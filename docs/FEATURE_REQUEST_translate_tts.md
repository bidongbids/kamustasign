# Feature request: translated text-to-speech (from the ML chat)

Panelist-requested feature from the thesis defense: add a Google Translate step
to the sign → text → speech output pipeline, with a **user-selectable target
language**. This belongs in the UI/CRUD chat, not here — it's screen-level
feature work, not model work. This note hands off what's already been
decided/researched so it doesn't need to be re-litigated.

## Current state (check before assuming anything exists)

Text-to-speech itself is **not built yet either**. `LiveTranslatorScreen.tsx`
and `WordTranslatorScreen.tsx` currently only display the recognized sign as
on-screen text (`"Detected sign: X"` / top-5 prediction list) — there is no
audio output anywhere in the app right now. So this is really **two**
additions on top of the existing (working) translator screens, not one:

1. Text-to-speech
2. Translation of the recognized text before/alongside speaking it

Both are small relative to the ML work, and neither depends on the
still-unbuilt CRUD/auth/classroom system (see `KamustaSign_UI_CRUD_Handoff.md`
at the project root) — this only touches the translator screens, which
already work standalone.

## Recommended approach

**TTS:** `expo-speech`. Confirmed (as of this research) to support Android,
iOS, *and* web in a single API — matches this project's one-codebase-for-
web-and-native setup. Install via `npx expo install expo-speech`, no native
config needed.

**Translation:** the real Google Cloud Translation API, not an unofficial/
scraping approach — the panelists said "Google Translate" by name, and the
official API is the more defensible choice if a panelist asks how it works
technically. Verified pricing as of July 2026: **500,000 characters/month
free, permanently** (not a trial credit), then $20 per million characters
beyond that — a school demo won't come close to the free limit.

Caveat worth flagging to whoever builds this: it requires a Google Cloud
project with billing enabled (standard for any Cloud API, even to stay
within the free tier), and since the app has no backend yet, the API key
would have to live in client-side code for now. Fine for a demo; not how
you'd want to ship it for real. This is a reasonable motivating case for
eventually building the Supabase backend already designed in the handoff
doc — it could proxy the translate call and keep the key server-side.

## Confirmed requirement

Target language is **user-selectable**, not fixed to one language, and once
a language is set, translation must be **automatic and immediate**: the
moment a sign is recognized, it gets translated (and spoken) directly in the
selected language, as part of the same flow. No separate "Translate" button,
no showing English first and translating as a second step. The language
picker is a standing mode set ahead of time, not a per-sign action — set it
once, every sign recognized after that goes straight to that language.

Implies:
- A small language-picker UI component somewhere in the translator flow,
  set before/independent of signing, not per-recognition.
- The selected language code gets passed into the Translation API call.
- The translate+speak call fires automatically right where the recognition
  result currently gets set — e.g. in `classifyBuffer()` in
  `WordTranslatorScreen.tsx`, right after the top prediction is computed —
  not behind a manual trigger.
- Likely candidates to prioritize in the picker given the school's location
  (Liloan, Misamis Occidental — Cebuano/Bisaya-speaking region): Filipino/
  Tagalog and Cebuano, alongside English. Full list not yet decided.

Worth flagging to whoever builds this: this adds a network dependency and
latency to what is currently a fully on-device, offline pipeline (MediaPipe
+ TF.js both run locally in-browser today, zero network calls at inference
time). "Immediate" is realistic for single words/short phrases — translate
APIs are typically sub-second — but the UI should handle the translate call
failing or timing out gracefully, since there's no existing precedent in
this codebase for a network error mid-recognition-loop.

## Not yet decided — resolve with the user or use judgment

- Full list of selectable languages.
- Where the picker lives in the UI (per-screen? global setting?).
- Whether translated text displays alongside the original English text, or
  replaces it, once translation is added.
- Whether to show a brief "translating..." state while the API call is in
  flight, or wait silently until it resolves before showing/speaking anything.
