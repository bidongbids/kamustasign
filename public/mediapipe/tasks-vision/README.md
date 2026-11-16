Vendored copy of `@mediapipe/tasks-vision@0.10.15` (Apache-2.0, Google) so
the translator works without internet. `vision_bundle.js` is the package's
`vision_bundle.mjs` (renamed: Electron's app:// MIME map has no `.mjs`).
Loaded by `../load-tasks-vision.js` (for the page) and `../holistic-worker.js`,
which fall back to jsdelivr if this folder is missing. To bump the version,
replace these files from
`https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-<ver>.tgz`
and update `TASKS_VISION_VERSION` in `src/lib/mediapipeVision.ts` and the CDN
URL in both of those loaders.
