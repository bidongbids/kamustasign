// Every student-facing practice string (the design system's copy deck). One
// idea per sentence, the computer takes the blame, a tip instead of a
// verdict, no percentages, no clock times. Keys mirror the deck so Filipino /
// Cebuano tables can be added later without touching the screens.
import { MASTERY_PASSES } from "./curriculum";
import { minutesUntil } from "./practiceFlow";

export type FeedbackIcon = "hand" | "handGold" | "star" | "moon" | "question" | "alert";

export type FeedbackModel = {
  icon: FeedbackIcon;
  headline: string;
  body?: string;
  tone: "neutral" | "gold" | "success";
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
  | { kind: "passed"; counted: boolean | null; alreadyLearned: boolean }
  | { kind: "retry"; predicted: string | null; confidence: number };

export function buildFeedback(args: {
  state: PracticeFeedbackState;
  isLive: boolean;
  sign: string;
  passes: number;
  holding: boolean;
  nextPassAt: Date | null;
  saveError: string | null;
  tipIndex: number;
  /** Words practice in hands-free (auto) mode: no Record button to press. */
  handsFree?: boolean;
  now: number;
  onRetrySave?: () => void;
}): FeedbackModel {
  const { state, isLive, sign, passes, holding, nextPassAt, saveError, tipIndex, now } = args;
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
        ? { icon: "handGold", headline: "Keep going!", body: "You are close. Try again.", tone: "neutral", tip }
        : { icon: "handGold", headline: "Keep going!", body: `The computer hasn't seen “${sign}” yet.`, tone: "neutral", tip };
    case "passed": {
      if (state.counted === null) return { icon: "star", headline: "Correct!", body: "Saving your star…", tone: "success" };
      if (state.alreadyLearned)
        return { icon: "star", headline: "Correct!", body: "You already learned this one. Great practice!", tone: "success" };
      if (state.counted && passes >= MASTERY_PASSES) {
        return { icon: "star", headline: "You earned a star!", body: "You learned this sign!", tone: "success" };
      }
      if (state.counted) {
        const left = Math.max(0, MASTERY_PASSES - passes);
        return {
          icon: "star",
          headline: "You earned a star!",
          body: `${passes} star${passes === 1 ? "" : "s"} · ${left} more to learn this sign.`,
          tone: "success",
        };
      }
      if (nextPassAt) {
        return {
          icon: "moon",
          headline: "Correct! Great signing.",
          body: "Your next star is resting. Come back later to earn it.",
          chip: `Ready in ${minutesUntil(nextPassAt, now)} min`,
          tone: "success",
        };
      }
      return { icon: "star", headline: "Correct!", body: "Sign it again to earn your star.", tone: "success" };
    }
    case "retry":
      if (!state.predicted)
        return { icon: "question", headline: "The computer couldn't tell", body: "That's okay. Try again.", tone: "neutral", tip };
      if (state.predicted === sign)
        return {
          icon: "handGold",
          headline: "Almost!",
          body: `The computer saw “${sign}”, but it wasn't sure.`,
          tone: "neutral",
          tip: "Sign it again, big and clear.",
        };
      return {
        icon: "question",
        headline: "Let's try again",
        body: `The computer thought it saw “${state.predicted}”.`,
        tone: "neutral",
        tip: "Watch “How to make it”, then sign slowly.",
      };
  }
}
