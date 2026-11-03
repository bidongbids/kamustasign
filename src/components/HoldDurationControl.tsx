// src/components/HoldDurationControl.tsx
// Companion timer to COMMIT_THRESHOLD in LiveTranslatorScreen: how long a
// handshape must hold steady above the confidence threshold before it's
// committed to the word. The Translator's Settings show it as "How long to
// hold a letter" (TranslatorSettings.tsx). An instant commit logs transient/unsure
// shapes the moment confidence crosses the threshold for even one frame -
// this adds a deliberate pause so an uncertain sign can be corrected before
// it locks in. Persisted the same way as handedness (see HandednessPicker.tsx)
// - set once, applies to every recognition after that.
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "kamustasign:holdDurationMs";

export const HOLD_PRESETS = [
  { label: "Fast", ms: 150 },
  { label: "Balanced", ms: 450 },
  { label: "Careful", ms: 900 },
] as const;

const DEFAULT_MS = 450;

/** "0.45 s" - the hold time as the Translator's Settings show it. */
export const holdSeconds = (ms: number) => `${Number((ms / 1000).toFixed(2))} s`;

// Every mounted useHoldDuration() shares one value (as useHandedness does),
// so the Translator's Settings popover reaches the reader's own instance.
const holdListeners = new Set<(value: number) => void>();

export function useHoldDuration(): [number, (value: number) => void] {
  const [holdMs, setHoldMs] = useState<number>(DEFAULT_MS);

  useEffect(() => {
    let cancelled = false;
    holdListeners.add(setHoldMs);
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      const n = saved == null ? NaN : Number(saved);
      if (!cancelled && Number.isFinite(n) && n > 0) setHoldMs(n);
    });
    return () => {
      cancelled = true;
      holdListeners.delete(setHoldMs);
    };
  }, []);

  function update(value: number) {
    holdListeners.forEach((listener) => listener(value));
    AsyncStorage.setItem(STORAGE_KEY, String(value)).catch(() => {});
  }

  return [holdMs, update];
}
