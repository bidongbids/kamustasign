// Speaks text aloud. Browsers and the desktop app use the Web Speech API
// through expo-speech. The Android app (mobile/, Capacitor) runs in
// Android's web view, which has no speechSynthesis at all, so there the text
// goes to Android's own text-to-speech through the TextToSpeech plugin
// (@capacitor-community/text-to-speech, installed in mobile/).
//
// The plugin is called through window.Capacitor.nativePromise - what
// @capacitor/core's registerPlugin() uses under the hood - so the web bundle
// doesn't need Capacitor as a dependency.
import * as Speech from "expo-speech";

type SpeakOptions = {
  language?: string;
  onDone?: () => void;
  onError?: () => void;
  onStopped?: () => void;
};

type NativeBridge = {
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, options?: Record<string, unknown>) => Promise<unknown>;
  PluginHeaders?: { name: string }[];
};

/** The Capacitor bridge when this is the Android app and its TextToSpeech plugin is installed. */
function nativeTts(): Required<Pick<NativeBridge, "nativePromise">> | null {
  const cap = typeof window !== "undefined" ? (window as { Capacitor?: NativeBridge }).Capacitor : undefined;
  if (!cap?.isNativePlatform?.() || !cap.nativePromise) return null;
  if (!cap.PluginHeaders?.some((p) => p.name === "TextToSpeech")) return null;
  return cap as Required<Pick<NativeBridge, "nativePromise">>;
}

export function speak(text: string, options: SpeakOptions = {}): void {
  const tts = nativeTts();
  if (!tts) {
    Speech.speak(text, options);
    return;
  }
  const say = (lang?: string) => tts.nativePromise("TextToSpeech", "speak", { text, ...(lang ? { lang } : {}) });
  say(options.language)
    // A language the phone has no voice for is refused before anything is
    // said. Browsers read it with the default voice instead; do the same.
    .catch((err: unknown) =>
      /not supported/i.test(String((err as { message?: string })?.message ?? err)) ? say() : Promise.reject(err)
    )
    .then(
      () => options.onDone?.(),
      () => options.onError?.()
    );
}

export function stop(): void {
  const tts = nativeTts();
  if (!tts) {
    Speech.stop();
    return;
  }
  tts.nativePromise("TextToSpeech", "stop").catch(() => {});
}
