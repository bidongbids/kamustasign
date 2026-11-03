"""
Gathers every clip the deployed ASL word model (v6, 344 words) was trained,
validated or tested on into ONE folder with ONE sub-folder per word:

  ml/data/ASL_word_dataset/
    README.txt     what is here and where it came from
    classes.csv    one row per word: folder name, clip counts by source and split
    clips.csv      one row per file: word, file, source, type, split, signer, original path
    <word>/        344 folders, named as the app shows the word
                   ("he/she/it" -> "he-she-it": Windows folder names can't hold "/")
      citizen_<id>.mp4            ASL Citizen video
      wlasl_<id>.mp4              WLASL video
      msasl_<id>.mp4              MS-ASL video
      youtube_<video>_<n>.npy     YouTube dictionary segment (landmarks only)
      gislr_<signer>_<seq>.parquet  Google Isolated Sign Language Recognition
                                  clip (landmarks only: the dataset has no video)

The files are HARD LINKS to the originals, not copies: they take no extra
disk space (the GISLR files alone are ~53 GB, more than the drive has free),
and nothing the training pipeline reads is moved or changed. Deleting this
folder never deletes an original. Copying it to another drive copies the
full data.

What counts as "used" is read from data/combined_word_landmarks.npz (the
exact arrays v6 trained on) - the clip ids of our/webcam/YouTube clips, and
the GISLR clips by position (consolidate_combined_words.py appends them in
gislr_raw.npz order, split by participant) - plus the webcam check: every
clip by the five held-out ASL Citizen people (word_model_diagnostics.py
HELDOUT_SIGNERS), none of which the model trained on.

Run (main venv):
  cd ml
  python scripts/organize_asl_word_dataset.py
"""
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import consolidate_combined_words as cc  # noqa: E402
import word_model_diagnostics as wd  # noqa: E402

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
DATA = os.path.normpath(DATA)
OUT = os.path.join(DATA, "ASL_word_dataset")
SL = os.path.join(DATA, "word_videos", "dataset", "SL")
GISLR_DIR = os.path.join(DATA, "train_landmark_files")
YT = os.path.join(DATA, "youtube_signs", "segments")
SOURCE_NAMES = {
    "citizen": "ASL Citizen (Microsoft Research, 2023)",
    "wlasl": "WLASL (Li et al., 2020)",
    "msasl": "MS-ASL (Microsoft Research, 2019)",
    "youtube": "YouTube ASL dictionary videos (harvest_youtube_signs.py)",
    "gislr": "Google Isolated Sign Language Recognition (Kaggle asl-signs, 2023)",
}


def folder_name(word):
    return re.sub(r'[\\/:*?"<>|]', "-", word)


def video_source(fname):
    if fname.startswith("citizen_"):
        return "citizen", fname
    if fname.startswith("msasl_"):
        return "msasl", fname
    if re.fullmatch(r"\d{5}\.mp4", fname):
        return "wlasl", "wlasl_" + fname
    raise SystemExit(f"unknown video source: {fname}")


def main():
    classes = json.load(open(os.path.join(DATA, "combined_word_classes.json"), encoding="utf-8"))
    if os.path.exists(OUT) and not os.path.exists(os.path.join(OUT, "clips.csv")) and os.listdir(OUT):
        raise SystemExit(f"{OUT} exists and is not ours - not touching it")

    # video id -> SL path, resolved per class exactly as word_model_diagnostics.vocab_clip_files does
    import select_asl_word_references as sel
    folders = {sel.key(d): d for d in os.listdir(SL)}
    vid_path = {}
    for w in classes:
        for n in [w] + [a for a in sel.ALIASES.get(w, []) if a[:-1] == w and a[-1].isdigit()]:
            d = folders.get(sel.key(n))
            for f in os.listdir(os.path.join(SL, d)) if d else []:
                vid_path.setdefault((w, os.path.splitext(f)[0]), os.path.join(SL, d, f))
    with open(os.path.join(DATA, "word_manifest.csv"), newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            vid_path[(r["word"], r["video_id"])] = os.path.join(DATA, "word_videos", r["path"])

    rows = {}  # (word, file) -> row
    def add(word, src_file, out_file, source, kind, split, signer):
        key = (word, out_file)
        if key in rows:
            return
        rows[key] = {"word": word, "folder": folder_name(word), "file": out_file, "source": source, "type": kind,
                     "split": split, "webcam_check": "no", "signer": signer,
                     "original": os.path.relpath(src_file, DATA).replace("\\", "/"), "_src": src_file}

    # 1) what v6 trained / validated / tested on
    npz = np.load(os.path.join(DATA, "combined_word_landmarks.npz"))
    with np.load(os.path.join(DATA, "gislr_raw.npz")) as g:
        g_sign = np.array([cc.GISLR_LABELS.get(s, s) for s in g["sign"]])
        g_part, g_seq = g["participant"], g["sequence_id"]
    g_split = np.where(np.isin(g_part, list(cc.TEST_PARTICIPANTS)), "test",
                       np.where(np.isin(g_part, list(cc.VAL_PARTICIPANTS)), "val", "train"))
    for s in ("train", "val", "test"):
        y, src, ids = npz[f"y_{s}"], npz[f"src_{s}"], npz[f"id_{s}"]
        gi = np.flatnonzero(g_split == s)
        if int((src == 1).sum()) != len(gi):
            raise SystemExit(f"{s}: {int((src == 1).sum())} GISLR rows in the npz, {len(gi)} expected")
        if not (src[-len(gi):] == 1).all():
            raise SystemExit(f"{s}: GISLR rows are not the tail of the split")
        for k in range(len(y) - len(gi)):
            word, vid = classes[y[k]], str(ids[k])
            if src[k] == 3:
                add(word, os.path.join(YT, vid), "youtube_" + vid, "youtube", "landmarks", s, "")
                continue
            path = vid_path.get((word, vid))
            if path is None:
                raise SystemExit(f"no video for {word} / {vid}")
            source, out_file = video_source(os.path.basename(path))
            add(word, path, out_file, source, "video", s, wd.citizen_signer(vid) or "")
        for k, j in zip(range(len(y) - len(gi), len(y)), gi):
            word = classes[y[k]]
            if word != g_sign[j]:
                raise SystemExit(f"{s}: GISLR row {j} is {g_sign[j]} in gislr_raw but {word} in the npz")
            p = os.path.join(GISLR_DIR, str(g_part[j]), f"{g_seq[j]}.parquet")
            add(word, p, f"gislr_{g_part[j]}_{g_seq[j]}.parquet", "gislr", "landmarks", s, str(g_part[j]))

    # 2) the webcam check: every clip by the held-out people (never trained on)
    held = set(json.load(open(wd.WEBCAM_SPLIT))["heldout_signers"])
    n_check = 0
    for vid, i, _ in wd.vocab_clip_files(classes):
        if wd.citizen_signer(vid) not in held:
            continue
        word, path = classes[i], vid_path[(classes[i], vid)]
        source, out_file = video_source(os.path.basename(path))
        add(word, path, out_file, source, "video", "webcam check", wd.citizen_signer(vid))
        rows[(word, out_file)]["webcam_check"] = "yes"
        n_check += 1

    # 3) link. A clip whose video has since been moved to another word's
    # folder (someone re-filed it by hand) is left out and listed in the README.
    moved = []
    for key, r in list(rows.items()):
        if os.path.exists(r["_src"]):
            continue
        name = os.path.basename(r["_src"])
        now = [d for d in os.listdir(SL) if os.path.exists(os.path.join(SL, d, name))]
        if not now:
            raise SystemExit(f"original missing and not found anywhere in SL: {r['_src']}")
        moved.append((r["word"], name, r["split"], now[0]))
        del rows[key]
    for m in moved:
        print(f"  left out: {m[1]} - trained as '{m[0]}' ({m[2]}), the video is now in SL/{m[3]}/")
    os.makedirs(OUT, exist_ok=True)
    made = 0
    for w in classes:
        os.makedirs(os.path.join(OUT, folder_name(w)), exist_ok=True)
    for r in rows.values():
        dst = os.path.join(OUT, r["folder"], r["file"])
        if os.path.exists(dst):
            if not os.path.samefile(dst, r["_src"]):
                raise SystemExit(f"{dst} exists and is a different file")
            continue
        os.link(r["_src"], dst)
        made += 1
        if made % 10000 == 0:
            print(f"  linked {made}", flush=True)

    # 4) tables
    ordered = sorted(rows.values(), key=lambda r: (classes.index(r["word"]), r["source"], r["file"]))
    cols = ["word", "folder", "file", "source", "type", "split", "webcam_check", "signer", "original"]
    with open(os.path.join(OUT, "clips.csv"), "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, cols, extrasaction="ignore")
        wr.writeheader()
        wr.writerows(ordered)
    per = defaultdict(Counter)
    for r in ordered:
        per[r["word"]][r["source"]] += 1
        per[r["word"]][r["split"]] += 1
        per[r["word"]]["total"] += 1
    srcs, splits = list(SOURCE_NAMES), ["train", "val", "test", "webcam check"]
    with open(os.path.join(OUT, "classes.csv"), "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["class_index", "word", "folder", "total"] + srcs + splits)
        for i, w in enumerate(classes):
            c = per[w]
            wr.writerow([i, w, folder_name(w), c["total"]] + [c[s] for s in srcs] + [c[s] for s in splits])

    tot = Counter(r["source"] for r in ordered)
    spl = Counter(r["split"] for r in ordered)
    renamed = [(w, folder_name(w)) for w in classes if folder_name(w) != w]
    readme = f"""LCSign - ASL word model dataset (model v6, deployed 2026-10-29)
==============================================================

Every clip the ASL word model was trained, validated or tested on, one
folder per word ({len(classes)} folders). Built by
ml/scripts/organize_asl_word_dataset.py from data/combined_word_landmarks.npz.

Files: {len(ordered):,}
""" + "".join(f"  {tot[s]:>7,}  {SOURCE_NAMES[s]}\n" for s in srcs) + f"""
Splits (clips.csv "split"):
  train         {spl['train']:>7,}  used to train the model
  val           {spl['val']:>7,}  used to pick the best training epoch
  test          {spl['test']:>7,}  never trained on (GISLR test signers 16069, 25571
                         + ASL Citizen / WLASL / MS-ASL test clips)
  webcam check  {spl['webcam check']:>7,}  never trained on: every clip by the five ASL Citizen
                         people held out of training ({', '.join(sorted(held))})
  ("webcam_check" = yes also marks those people's clips in the test split;
  {n_check:,} clips in all are scored by the webcam check.)

Types:
  video      .mp4, MediaPipe Holistic landmarks were extracted from them
  landmarks  GISLR .parquet (the dataset ships landmarks, not video) and
             YouTube .npy segments (landmarks cut from dictionary videos;
             the source video id is in the file name)

Folder names: the word as the app shows it, except
""" + "".join(f"  {w!r:>14} -> {n!r}\n" for w, n in renamed) + """
GISLR glosses were renamed to the app's words (thankyou -> thank you,
callonphone -> call on phone, ...) and "mom" was merged into "mother"
(the same sign); see GISLR_LABELS in consolidate_combined_words.py.
Training also counted each webcam-extra and YouTube clip twice (EXTRA_REPEAT);
here each file appears once.
""" + ("""
Left out: the model trained on these, but their videos have since been
moved by hand to another word's folder under ml/data/word_videos/dataset/SL:
""" + "".join(f"  {name}  trained as '{w}' ({s}), now in SL/{d}/\n" for w, name, s, d in moved)
       if moved else "") + """
IMPORTANT
- The files are hard links to the originals under ml/data: no extra disk
  space, and deleting this folder does not delete the originals. Copying
  the folder elsewhere copies the full data (~60 GB with GISLR).
- Licences: ASL Citizen, WLASL and MS-ASL are research-only datasets;
  GISLR is Kaggle competition data; the YouTube videos belong to their
  channels. Check each dataset's terms before sharing this folder.
"""
    open(os.path.join(OUT, "README.txt"), "w", encoding="utf-8").write(readme)
    print(f"{len(ordered):,} files in {len(classes)} folders ({made:,} new links)")
    print(dict(tot), dict(spl))


if __name__ == "__main__":
    main()
