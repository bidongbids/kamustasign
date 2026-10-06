// The signing clips bundled into the app, keyed by word.
//
// These are the seven words where the SignAvatars word2motion download
// overlaps KamustaSign's own 133-word vocabulary. One clip per word, picked
// for a sensible duration (~40 frames) out of the 8-17 recordings each word
// has in ml/data/signer_clips/. Regenerate any of them with:
//
//     python ml/scripts/signavatars_to_rotations.py --word <gloss>
//
// Bundled rather than fetched because there are only seven and they total
// under 500KB. Once the vocabulary grows past a few dozen words this should
// become a fetch-on-demand loader instead - at which point this file becomes
// a manifest of URLs rather than static imports.

import type { SignerClip } from "../../lib/smplxSkeleton";

import accident from "./accident_00625.json";
import add from "./add_00962.json";
import alone from "./alone_02110.json";
import animal from "./animal_02589.json";
import apple from "./apple_03005.json";
import appointment from "./appointment_03061.json";
import argue from "./argue_03273.json";

export const SIGNER_CLIPS: Record<string, SignerClip> = {
  accident: accident as unknown as SignerClip,
  add: add as unknown as SignerClip,
  alone: alone as unknown as SignerClip,
  animal: animal as unknown as SignerClip,
  apple: apple as unknown as SignerClip,
  appointment: appointment as unknown as SignerClip,
  argue: argue as unknown as SignerClip,
};

/** Words that can currently be signed, in display order. */
export const SIGNABLE_WORDS = Object.keys(SIGNER_CLIPS).sort();
