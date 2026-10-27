// Shared words and small helpers for the call screen's pieces
// (VideoCallScreen and the files beside it).
import { colors } from "../../theme/theme";
import type { CallModel, ReaderPhase } from "../../hooks/useCallSignReader";
import type { CallModelKey, CallSettings } from "../../lib/callSignaling";

export const MODELS: Record<CallModelKey, CallModel> = {
  "asl-letters": { kind: "letters" },
  "asl-words": { kind: "words", language: "asl" },
  "fsl-words": { kind: "words", language: "fsl" },
};
export const MODEL_NAMES: Record<CallModelKey, string> = {
  "asl-letters": "ASL Letters",
  "asl-words": "ASL Words",
  "fsl-words": "FSL Words",
};
/** One-line explanations for the Reading tab's model list. */
export const MODEL_HINTS: Record<CallModelKey, string> = {
  "asl-letters": "Fingerspelling, one letter at a time",
  "asl-words": "Whole signs, pause between them",
  "fsl-words": "Filipino Sign Language words",
};

export type ReadFrom = "them" | "me" | "both";

// "them"/"me" on this screen <-> the role-based `read` the settings carry.
export const toRead = (readFrom: ReadFrom, role: "teacher" | "student"): CallSettings["read"] =>
  readFrom === "both" ? "both" : (readFrom === "me") === (role === "teacher") ? "teacher" : "student";
export const fromRead = (read: CallSettings["read"], role: "teacher" | "student"): ReadFrom =>
  read === "both" ? "both" : read === role ? "me" : "them";

export type Tone = "neutral" | "gold" | "success" | "error";

/** The reader's status chip: the existing labels, now with an icon kind. */
export const PHASE: Record<ReaderPhase, { chip: string; tone: Tone; icon: "dot" | "hand" | "check" | "alert" }> = {
  off: { chip: "Paused", tone: "neutral", icon: "dot" },
  loading: { chip: "Starting…", tone: "neutral", icon: "dot" },
  error: { chip: "Can't read signs", tone: "error", icon: "alert" },
  "no-hand": { chip: "No hand", tone: "neutral", icon: "dot" },
  unsure: { chip: "Not sure", tone: "neutral", icon: "alert" },
  holding: { chip: "Hold still", tone: "gold", icon: "hand" },
  added: { chip: "Added", tone: "success", icon: "check" },
  reading: { chip: "Reading sign…", tone: "gold", icon: "dot" },
  checking: { chip: "Checking…", tone: "gold", icon: "dot" },
};

// Text colours that pass on glass and on the dark ground (theme.ts:
// green/red text uses the *Text tokens).
export const toneColor = (t: Tone) =>
  t === "success" ? colors.successText : t === "gold" ? colors.accentCoral : t === "error" ? colors.needsPracticeText : colors.textOnGlass;

export const initials = (name?: string | null) =>
  (name ?? "?")
    .replace(/\s*\(you\)\s*$/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

/** "Ana" from "Ana Santos" - the screen says names, never guessed pronouns. */
export const firstName = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] || "They";

export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
export const tries = (n: number) => `${n} ${n === 1 ? "try" : "tries"}`;
