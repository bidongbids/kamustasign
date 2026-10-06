// Maps a Google Translate language code (see ./languages.ts) to the BCP-47
// locale tag expo-speech expects for its `language` option. Only codes where
// the mapping isn't a trivial one-to-one need an entry here (e.g. Google's
// "fil" vs the "fil-PH" locale tag device TTS engines actually register, or
// "zh-CN"/"zh-TW" needing a different tag shape). Anything not listed here
// falls back to the raw Google code, which device TTS engines generally
// accept fine for the common single-country languages (e.g. "es", "de").
const OVERRIDES: Record<string, string> = {
  en: "en-US",
  fil: "fil-PH",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  pt: "pt-PT",
  fr: "fr-FR",
  es: "es-ES",
  ar: "ar-SA",
  he: "he-IL",
  ja: "ja-JP",
  ko: "ko-KR",
  hi: "hi-IN",
  vi: "vi-VN",
  th: "th-TH",
  id: "id-ID",
  ms: "ms-MY",
};

export function toTtsLocale(translateLanguageCode: string): string {
  return OVERRIDES[translateLanguageCode] ?? translateLanguageCode;
}
