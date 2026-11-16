import * as ExpoSpeech from "expo-speech";
import { speak, stop } from "../lib/speech";

jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn() }));

const flush = () => new Promise((r) => setTimeout(r, 0));

/** A fake Android-app bridge; `reply` decides how each native call settles. */
function androidApp(reply: (method: string, opts?: Record<string, unknown>) => Promise<unknown>, plugins = ["TextToSpeech"]) {
  const nativePromise = jest.fn(reply);
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    nativePromise: (_plugin: string, method: string, opts?: Record<string, unknown>) => nativePromise(method, opts),
    PluginHeaders: plugins.map((name) => ({ name })),
  };
  return nativePromise;
}

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  jest.clearAllMocks();
});

describe("speech", () => {
  it("browsers and the desktop app use expo-speech", () => {
    const onDone = jest.fn();
    speak("hello", { language: "en-US", onDone });
    stop();
    expect(ExpoSpeech.speak).toHaveBeenCalledWith("hello", { language: "en-US", onDone });
    expect(ExpoSpeech.stop).toHaveBeenCalled();
  });

  it("the Android app speaks through the TextToSpeech plugin", async () => {
    const native = androidApp(async () => undefined);
    const onDone = jest.fn();
    speak("kumusta", { language: "fil-PH", onDone });
    await flush();
    expect(native).toHaveBeenCalledWith("speak", { text: "kumusta", lang: "fil-PH" });
    expect(onDone).toHaveBeenCalled();
    expect(ExpoSpeech.speak).not.toHaveBeenCalled();

    stop();
    expect(native).toHaveBeenLastCalledWith("stop", undefined);
  });

  it("a language with no voice on the phone is read with the default voice", async () => {
    const native = androidApp(async (_m, opts) => {
      if (opts?.lang) throw new Error("This language is not supported.");
    });
    const onDone = jest.fn();
    speak("maayong buntag", { language: "ceb", onDone });
    await flush();
    expect(native.mock.calls.map((c) => c[1])).toEqual([{ text: "maayong buntag", lang: "ceb" }, { text: "maayong buntag" }]);
    expect(onDone).toHaveBeenCalled();
  });

  it("other failures end the speech with onError, without a retry", async () => {
    const native = androidApp(async () => {
      throw new Error("Failed to read text.");
    });
    const onError = jest.fn();
    speak("hello", { onError });
    await flush();
    expect(native).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalled();
  });

  it("an Android build without the plugin falls back to expo-speech", () => {
    androidApp(async () => undefined, ["WebView"]);
    speak("hello");
    expect(ExpoSpeech.speak).toHaveBeenCalled();
  });
});
