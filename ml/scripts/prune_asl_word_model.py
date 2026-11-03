"""
Takes consolidate_combined_words.REMOVED_WORDS out of the trained ASL word
model WITHOUT retraining (2026-11-02: 23 look-alike words, 344 -> 321).

Each seed's last layer is a Dense softmax over the words. Dropping a word's
column of that layer (kernel and bias) gives exactly the seed's old
probabilities with the removed words taken out and the rest renormalised -
so the remaining words keep everything the model learned, and the clips
that used to be lost to a removed look-alike now go to the next best word.
A retrain without those words (consolidate_combined_words.py already leaves
them out) would also free the capacity they used; this is the instant
version of that.

What it rewrites (the originals of all of it are v6, archived in
models/asl_combined_v6_person/ and data/combined_word_landmarks_v6_344.npz):
  models/asl_combined_seed{0-3}.keras         last layer without the removed words
  models/asl_combined_label_classes.json      the 321 words
  data/combined_word_classes.json             the 321 words
  data/combined_word_landmarks.npz            clips of removed words dropped, labels renumbered
                                              (old file renamed, not deleted)
It refuses to run twice: the seeds must still match the v6 archive.

Then, as after any retrain: export_fused_word_ensemble.py asl, convert into
public/word-model/model0, copy the label list to public/word-model/,
word_model_diagnostics.py asl, export_word_practice_order.py,
export_star_reference.py.

  cd ml
  python scripts/prune_asl_word_model.py
"""
import hashlib
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from consolidate_combined_words import REMOVED_WORDS  # noqa: E402

ML = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATA, MODELS = os.path.join(ML, "data"), os.path.join(ML, "models")
ARCHIVE = os.path.join(MODELS, "asl_combined_v6_person")
NPZ = os.path.join(DATA, "combined_word_landmarks.npz")
NPZ_OLD = os.path.join(DATA, "combined_word_landmarks_v6_344.npz")
CLASSES = os.path.join(DATA, "combined_word_classes.json")


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    old = json.load(open(CLASSES, encoding="utf-8"))
    missing = [w for w in REMOVED_WORDS if w not in old]
    if missing:
        raise SystemExit(f"not in the current class list (already pruned?): {missing}")
    seeds = [os.path.join(MODELS, f"asl_combined_seed{s}.keras") for s in range(4)]
    for p in seeds:
        if md5(p) != md5(os.path.join(ARCHIVE, os.path.basename(p))):
            raise SystemExit(f"{p} is not the archived v6 seed - not pruning it")
    if os.path.exists(NPZ_OLD):
        raise SystemExit(f"{NPZ_OLD} already exists")

    keep = np.array([i for i, w in enumerate(old) if w not in REMOVED_WORDS])
    new = [old[i] for i in keep]
    remap = np.full(len(old), -1, dtype=np.int32)
    remap[keep] = np.arange(len(keep))
    print(f"{len(old)} -> {len(new)} words (removing {sorted(REMOVED_WORDS)})")

    # data: drop removed words' clips, renumber labels
    out = {}
    with np.load(NPZ) as d:
        for s in ("train", "val", "test"):
            y = d[f"y_{s}"]
            m = remap[y] >= 0
            out[f"y_{s}"] = remap[y[m]]
            for k in ("src", "id"):
                out[f"{k}_{s}"] = d[f"{k}_{s}"][m]
            out[f"X_{s}"] = d[f"X_{s}"][m]
            print(f"  {s}: {len(y)} -> {int(m.sum())} clips", flush=True)
        X_test_old, y_test_old = d["X_test"].astype("float32"), d["y_test"]
    tmp = NPZ + ".tmp.npz"
    np.savez(tmp, **out)
    del out
    os.rename(NPZ, NPZ_OLD)
    os.rename(tmp, NPZ)

    # seeds: drop the removed words' columns of the last Dense layer
    from tensorflow import keras
    m_test = remap[y_test_old] >= 0
    X_check = X_test_old[m_test]
    for p in seeds:
        m = keras.models.load_model(p, compile=False)
        cfg = m.get_config()
        last = cfg["layers"][-1]["config"]
        assert last.get("activation") == "softmax" and last["units"] == len(old), last
        last["units"] = len(new)
        pruned = m.__class__.from_config(cfg)
        w = m.get_weights()
        w[-2], w[-1] = w[-2][:, keep], w[-1][keep]
        pruned.set_weights(w)
        ref = m.predict(X_check, verbose=0, batch_size=256)[:, keep]
        ref /= ref.sum(1, keepdims=True)
        got = pruned.predict(X_check, verbose=0, batch_size=256)
        err = float(np.abs(got - ref).max())
        if err > 1e-4:
            raise SystemExit(f"{os.path.basename(p)}: pruned model differs from renormalised v6 by {err}")
        pruned.save(p)
        print(f"  {os.path.basename(p)}: {len(old)} -> {len(new)} outputs, max |diff| vs renormalised v6 {err:.1e}")

    for path in (CLASSES, os.path.join(MODELS, "asl_combined_label_classes.json")):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(new, f, indent=2, ensure_ascii=False)
    print("done")


if __name__ == "__main__":
    main()
