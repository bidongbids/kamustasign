// MyMemory Translation API client - free, no account or API key required.
// Swapped in for Google Cloud Translation to avoid the billing-account/card
// verification requirement (see chat history around 2026-08-29 for why).
// Anonymous requests get 5,000 characters/day, tracked by IP; adding a
// contact email via EXPO_PUBLIC_MYMEMORY_EMAIL raises that to 50,000/day -
// no verification, just a string MyMemory uses to raise the quota. Either
// is far more than a live demo needs. If Google Translate's billing ever
// gets sorted and you want to switch back, the old implementation is in
// git history - the function signature below (translateText,
// isTranslateConfigured, TranslateError) is unchanged, so useTranslateAndSpeak.ts
// and every caller needs no changes either way.

const contactEmail = process.env.EXPO_PUBLIC_MYMEMORY_EMAIL;

// No account needed at all, so this is always true - kept only so callers
// that used to branch on "is translation configured" still compile/work.
export const isTranslateConfigured = true;

const TRANSLATE_URL = "https://api.mymemory.translated.net/get";

export class TranslateError extends Error {}

// Source is always "en" - the recognized sign is displayed/spoken as English
// text upstream of this call. Pass the ISO 639-1 target language code (see
// ./languages.ts).
export async function translateText(text: string, targetLanguageCode: string): Promise<string> {
  if (targetLanguageCode === "en") {
    return text;
  }

  const params = new URLSearchParams({
    q: text,
    langpair: `en|${targetLanguageCode}`,
  });
  if (contactEmail) params.set("de", contactEmail);

  const res = await fetch(`${TRANSLATE_URL}?${params.toString()}`);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TranslateError(`Translate API request failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  const translated = json?.responseData?.translatedText;
  if (typeof translated !== "string") {
    throw new TranslateError("Translate API response did not include translated text.");
  }
  // MyMemory signals an unsupported/unavailable language pair by returning
  // this text as a normal 200 response, not an HTTP error - surface it as a
  // real failure instead of silently "translating" to a useless message.
  if (translated.toUpperCase().includes("MYMEMORY WARNING")) {
    throw new TranslateError(translated);
  }
  return translated;
}
