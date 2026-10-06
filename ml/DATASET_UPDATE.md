# Dataset update — MS-ASL retry (from the UI/CRUD chat, 2026-07-30/31)

The UI/CRUD chat retried `download_msasl_clips.py` for the previously-failed
MS-ASL videos (1,114 of 1,533 had failed in the original run). Net result:

- **1,139 → 1,287 unique MS-ASL clips** (+148 genuinely new), across the
  existing 133-word vocabulary. `word_classes.json` was **not** changed —
  no new words added, matching the earlier decision to hold off on
  vocabulary expansion.
- Two bugs hit along the way, both fixed, both cleaned up (verified by
  content-hash dedup, not just filename — final counts above are net of
  removing ~1,384 duplicate-content files created by these):
  1. First retry attempt failed outright (0/1,533) — venv wasn't activated,
     so `yt-dlp` wasn't on `PATH`. No data touched.
  2. The script named output files from Python's built-in `hash(url)`,
     which is randomized per process — every rerun produced different
     filenames for the same video, so skip-detection could never recognize
     already-downloaded clips across runs, causing silent duplicate
     downloads. Fixed in `download_msasl_clips.py` to use a stable
     MD5-based filename instead. Some files on disk still carry the old
     random-hash names from before the fix (harmless — just a naming
     inconsistency, not duplicate data); if this script runs again, rerun
     a content-hash dedup pass afterward just in case rather than trusting
     skip-detection alone against that historical mix.
- All 1,533 candidate videos have now been attempted at least twice.
  Retry yield had dropped to ~2% new successes by the end — the remaining
  failures are likely dead/removed videos, not rate-limiting. Recommend
  treating MS-ASL collection for the current vocabulary as done rather than
  retrying further.

**Next step (not done by the UI/CRUD chat, intentionally — this is your
call to keep model/ensemble state in one place):** rerun
`build_word_video_manifest.py` → `extract_word_landmarks.py` →
`consolidate_word_landmarks.py` → `train_word_classifier.py` to fold the
+148 clips into a retrain, same as the last full retrain.
