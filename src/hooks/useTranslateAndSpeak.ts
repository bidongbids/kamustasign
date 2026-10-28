// Fires the moment a sign is recognized: translate the English text into the
// standing target language, then speak it - no separate "Translate" button,
// no manual trigger (see docs/FEATURE_REQUEST_translate_tts.md). Handles the
// translate call failing or timing out gracefully: falls back to speaking
// the original English text rather than staying silent, since TTS itself
// doesn't depend on translation succeeding.
import { useCallback, useRef, useState } from "react";
import * as Speech from "expo-speech";
import { translateText, isTranslateConfigured } from "../lib/translate";
import { toTtsLocale } from "../lib/ttsLocales";

type Status = "idle" | "translating" | "speaking" | "error";

// Successful translations, keyed "<lang>|<text>". Pressing Speak again on the
// same word replays it without another network round trip or another bite
// out of the translation API's daily quota. Failures aren't cached, so a
// flaky connection gets retried on the next press.
const translationCache = new Map<string, string>();

/** `sourceLanguageCode`: what the text to speak is written in ("en" unless it's FSL word captions). */
export function useTranslateAndSpeak(targetLanguageCode: string, sourceLanguageCode = "en") {
  const [status, setStatus] = useState<Status>("idle");
  const [translatedText, setTranslatedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Every speak() call takes a new id; only the latest call may update state.
  // Needed because a new call cancels the previous utterance, and that
  // cancellation fires the old utterance's onStopped - which must not flip
  // the status to "idle" while the new one is speaking.
  const callIdRef = useRef(0);

  const speak = useCallback(
    async (text: string) => {
      if (!text) return;
      // Repeats are always spoken - Speak must work every time it's pressed,
      // including on the word that was just spoken. Overlap is prevented by
      // cancelling whatever is still playing instead of skipping repeats.
      // (Skipping repeats is what made Speak work only the first time.)
      const id = ++callIdRef.current;
      Speech.stop();

      setError(null);
      setStatus("translating");

      const cacheKey = `${sourceLanguageCode}>${targetLanguageCode}|${text}`;
      let toSpeak = translationCache.get(cacheKey);
      if (toSpeak === undefined) {
        try {
          toSpeak = await translateText(text, targetLanguageCode, sourceLanguageCode);
          translationCache.set(cacheKey, toSpeak);
        } catch (err: any) {
          toSpeak = text;
          if (id === callIdRef.current) {
            setError(
              isTranslateConfigured
                ? err?.message ?? "Translation failed."
                : "Google Translate isn't configured yet - speaking the original English instead."
            );
          }
        }
      }
      // A newer press arrived while this one was translating - it owns the
      // audio and the display now.
      if (id !== callIdRef.current) return;

      setTranslatedText(toSpeak);
      setStatus("speaking");
      const finish = () => {
        if (id === callIdRef.current) setStatus("idle");
      };
      Speech.speak(toSpeak, {
        language: toTtsLocale(targetLanguageCode),
        onDone: finish,
        onError: finish,
        onStopped: finish,
      });
    },
    [targetLanguageCode, sourceLanguageCode]
  );

  const reset = useCallback(() => {
    callIdRef.current++;
    Speech.stop();
    setTranslatedText("");
    setError(null);
    setStatus("idle");
  }, []);

  return { speak, reset, status, translatedText, error };
}
