// Every student-facing practice string (the design system's copy deck). One
// idea per sentence, the computer takes the blame, a tip instead of a
// verdict, no clock times. Every result shows its score as a percentage, with
// the pass mark beside it (in words or on the ScoreMeter) so the number
// means something. Keys mirror the deck so Filipino / Cebuano tables can be
// added later without touching the screens.
import { MASTERY_PASSES, PASS_CONFIDENCE } from "./curriculum";

/** 0-1 -> whole percent, rounded down so a miss never shows the pass mark. */
export const percent = (c: number) => Math.floor(c * 100);
export const PASS_PERCENT = percent(PASS_CONFIDENCE);

/** "Up from 62%. Getting closer!" when this try beat the last one, else null. Never points out a drop. */
export function closerText(now: number, previous: number | null | undefined): string | null {
  if (previous == null || percent(now) <= percent(previous)) return null;
  return `Up from ${percent(previous)}%. Getting closer!`;
}

export type FeedbackIcon = "hand" | "handGold" | "star" | "question" | "alert";

export type FeedbackModel = {
  icon: FeedbackIcon;
  headline: string;
  body?: string;
  tone: "neutral" | "gold" | "success";
  /** 0-1: the try's score, drawn as a ScoreMeter with the pass mark. */
  score?: number;
  tip?: string;
  chip?: string;
  action?: { label: string; onPress: () => void };
};

/** Rotated in order on each new "not yet" moment, never back to back. */
export const TIPS = [
  "Move your hand a bit closer to the camera.",
  "Keep your hand inside the box.",
  "Sign slowly, then hold still.",
  "Make sure your face and hand are in the light.",
  "Use your signing hand. A grown-up can switch it.",
  "Watch “How to make it” first.",
];

export type PracticeFeedbackState =
  | { kind: "waiting" }
  | { kind: "trying"; best: number }
  // counted: null while the write is in flight.
  | { kind: "passed"; counted: boolean | null; alreadyLearned: boolean; confidence: number }
  // confidence: the target sign's score (0-1), whatever the computer saw.
  // previous: the last word clip's score for this sign, if there was one.
  | { kind: "retry"; predicted: string | null; confidence: number; previous?: number | null };

export function buildFeedback(args: {
  state: PracticeFeedbackState;
  isLive: boolean;
  sign: string;
  passes: number;
  holding: boolean;
  saveError: string | null;
  tipIndex: number;
  /** Words practice in hands-free (auto) mode: no Record button to press. */
  handsFree?: boolean;
  onRetrySave?: () => void;
}): FeedbackModel {
  const { state, isLive, sign, passes, holding, saveError, tipIndex } = args;
  const tip = TIPS[tipIndex % TIPS.length];

  if (saveError) {
    return {
      icon: "alert",
      headline: "We couldn't save that try",
      body: "Your signing was fine. Check the internet and try again.",
      tone: "neutral",
      action: args.onRetrySave ? { label: "Try again", onPress: args.onRetrySave } : undefined,
    };
  }

  if (holding && state.kind !== "passed") {
    return { icon: "handGold", headline: "Hold it… keep still", body: "Watch the ring fill up.", tone: "gold" };
  }

  switch (state.kind) {
    case "waiting":
      return isLive
        ? { icon: "hand", headline: "Show your hand", body: `Make the sign for “${sign}” in the box.`, tone: "neutral" }
        : args.handsFree
          ? { icon: "hand", headline: "Ready when you are", body: `Sign “${sign}”, then pause.`, tone: "neutral" }
          : { icon: "hand", headline: "Ready when you are", body: `Press Record, then sign “${sign}”.`, tone: "neutral" };
    case "trying":
      return state.best > 0
        ? {
            icon: "handGold",
            headline: "Keep going!",
            body:
              state.best >= PASS_CONFIDENCE
                ? `Best so far: ${percent(state.best)}%. Now hold it still.`
                : `Best so far: ${percent(state.best)}%. Reach ${PASS_PERCENT}% and hold still.`,
            tone: "neutral",
            score: state.best,
            tip,
          }
        : { icon: "handGold", headline: "Keep going!", body: `The computer hasn't seen “${sign}” yet.`, tone: "neutral", tip };
    case "passed": {
      const pct = `${percent(state.confidence)}%`;
      const score = state.confidence;
      if (state.counted === null) return { icon: "star", headline: `Correct! ${pct}`, body: "Saving your good try…", tone: "success", score };
      if (state.alreadyLearned)
        return { icon: "star", headline: `Correct! ${pct}`, body: "You already learned this one. Great practice!", tone: "success", score };
      if (state.counted && passes >= MASTERY_PASSES) {
        return { icon: "star", headline: `That one counts! ${pct}`, body: "You learned this sign!", tone: "success", score };
      }
      if (state.counted) {
        const left = Math.max(0, MASTERY_PASSES - passes);
        return {
          icon: "star",
          headline: `That one counts! ${pct}`,
          body: `${left} more good ${left === 1 ? "try" : "tries"} to learn this sign.`,
          tone: "success",
          score,
        };
      }
      return { icon: "star", headline: `Correct! ${pct}`, body: "Sign it again so it counts.", tone: "success", score };
    }
    case "retry": {
      const scored = `“${sign}” scored ${percent(state.confidence)}%.`;
      if (!state.predicted)
        return {
          icon: "question",
          headline: "The computer couldn't tell",
          body: `${scored} That's okay. Try again.`,
          tone: "neutral",
          score: state.confidence,
          tip,
        };
      if (state.predicted === sign)
        return {
          icon: "handGold",
          headline: `Almost! ${percent(state.confidence)}%`,
          body: closerText(state.confidence, state.previous) ?? `You need ${PASS_PERCENT}% to pass. Try again.`,
          tone: "neutral",
          score: state.confidence,
          tip,
        };
      return {
        icon: "question",
        headline: "Let's try again",
        body: `${scored} It looked more like “${state.predicted}”.`,
        tone: "neutral",
        score: state.confidence,
        tip: "Watch “How to make it”, then sign slowly.",
      };
    }
  }
}
