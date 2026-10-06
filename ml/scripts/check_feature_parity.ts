// Emit the TypeScript normalizer's output for a few cached clips, so
// check_feature_parity.py can diff it against the Python pipeline.
//
// Why this exists: src/ml/wordLandmarks.ts and ml/scripts/extract_word_landmarks.py
// implement the same transform twice, in two languages. A divergence between
// them does not raise - it silently feeds the model features it was never
// trained on, and the only symptom is bad predictions. That is exactly the
// failure this pair of scripts is meant to catch, and it got more likely when
// the transform grew from 258 to 384 features.
//
// Run:  npx esbuild ml/scripts/check_feature_parity.ts --bundle \
//         --platform=node --format=cjs --outfile=/tmp/parity.cjs \
//         && node /tmp/parity.cjs > /tmp/ts_features.json \
//         && python ml/scripts/check_feature_parity.py

import * as fs from "fs";
import * as path from "path";
import { normalizeSequence, FEATURES_PER_FRAME } from "../../src/ml/wordLandmarks";

// Written by the Python side: {clip: [[...258 floats] x 40]}
const inputPath = "/tmp/parity_input.json";
const raw = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as Record<string, number[][]>;

const out: Record<string, number[][]> = {};
for (const [clip, frames] of Object.entries(raw)) {
  const typed = frames.map((f) => {
    if (f.length !== FEATURES_PER_FRAME) {
      throw new Error(`${clip}: expected ${FEATURES_PER_FRAME} values, got ${f.length}`);
    }
    return Float32Array.from(f);
  });
  out[clip] = normalizeSequence(typed).map((f) => Array.from(f));
}

console.log(JSON.stringify(out));
