# Design brief: KamustaSign mobile UI (light theme)

Design the phone-sized experience for an existing React Native app, in a **light
colour scheme**. The app currently ships a dark theme ("Graphite Aurora") tuned
for desktop; mobile layouts exist but were derived from the desktop ones rather
than designed for a phone.

> **Assumption to confirm:** "light" is read here as a light colour scheme, not
> "lightweight". If the ask was really about reducing bundle/asset weight, this
> brief is the wrong document.

---

## 1. What the app does

KamustaSign is a sign-language interpretation tool built as a BSIT capstone at
NMSC in the Philippines. Three things it does:

- **Translator** — point the camera at a signer, get text and speech out.
  Fingerspelling (letters / numbers) and whole words.
- **Signer** — the reverse: type text, a 3D figure signs it back.
- **Classroom** — a fixed learning plan with per-sign progress, for students,
  teachers and admins.

It covers two languages, **ASL** and **FSL** (Filipino Sign Language). FSL matters
more than ASL for the actual user population, so it should never feel like the
secondary option.

## 2. Hard stack constraints

These are not negotiable and they shape what a mockup can express.

**Styling is `StyleSheet.create` only.** React Native. There is **no CSS, no
Tailwind, no className, no media queries, no pseudo-selectors, no `:hover`**. Flexbox
only (no CSS Grid). Anything expressed as a CSS trick will have to be rebuilt or
abandoned, so design within these primitives:

| Available | Via |
|---|---|
| Blur / frosted glass | `expo-blur` (`BlurView`) — already used by `GlassCard` |
| Gradients | `expo-linear-gradient` |
| Vector shapes, charts, icons | `react-native-svg` |
| Shadows / elevation | `theme/shadows.ts` → `shadow()`, `neuRaised()`, `neuInset()` |
| Safe areas | `react-native-safe-area-context` |

**Only two font families are loaded**, via `expo-font` in `App.tsx`:

- **Baloo2** — 700 Bold, 600 SemiBold (headings)
- **Inter** — 400 Regular, 500 Medium, 600 SemiBold (body)

No other weights exist. Do not design around a 300 Light or an 800 Black; the
existing hero type already approximates 800 with Baloo2 700 because that's all
there is.

**Design tokens already exist** in `src/theme/theme.ts` — `colors`, `spacing`
(4/8/16/24/32/48), `radii` (8/16/24/999), `typography`, `kidTypography`, `sizes`,
`breakpoints`. Work with this scale rather than inventing a parallel one.

`useResponsive()` exposes `isMobile` (<768), `isTablet`, `isDesktop` (≥1100).
Mobile is the `isMobile` branch.

## 3. The central design problem: light-mode elevation

This is the hard part and the main reason this brief exists.

The app's whole depth language is **dark neumorphism**. `neuRaised()` and
`neuInset()` work by casting a near-black shadow (`#12151B`) on one side and a
lighter grey (`#2E3644`) on the other, against a mid-grey surface (`#232936`).
Every control uses it — the tab switcher, the camera housing, buttons, panels.

**Naively inverting those values produces mud.** Light neumorphism needs a
genuinely different approach: a near-white surface, a soft cool shadow below, and
a white highlight above, with far lower contrast than the dark version. It's
easy to end up with something that looks washed out and illegible in daylight —
which matters here, because this is a phone app used in classrooms and outdoors.

So: **propose a light elevation system**, not a palette swap. Specifically —

- What replaces `neuRaised` / `neuInset` in light mode, as concrete shadow values
- Whether frosted glass (`GlassCard`) survives light mode or needs replacing with
  something opaque — blur over light backgrounds reads very differently
- How "pressed" and "selected" states read without relying on darkness

Deliver this as a **token delta**: for each existing token, the light-mode value.
A designer-invented parallel system that doesn't map onto the existing names will
not get implemented.

### Accent colours to keep

Semantic colours carry meaning across the app and should survive the theme change
(adjusted for contrast on light, not replaced):

```
primaryTeal    #7C6CF5   (violet, despite the name)
accentCoral    #F2B23E   (gold)
success        #3FB56A
needsPractice  #E0525F
```

## 4. Mobile-specific requirements

**Portrait first.** Landscape can degrade gracefully; nobody holds a phone
sideways to fingerspell.

**The camera is the hero.** On desktop it's a 480×480 "device" with decorative
chrome shelves top and bottom. On a phone that chrome is expensive vertical
space. Decide what survives — the status readout is functional, the vents are not.

**One-handed reach.** Primary controls belong in the bottom third. The record
button, the Letters/Numbers switch and the language picker are all reached
mid-signing, sometimes with one hand occupied.

**No hover.** Every affordance must read as tappable at rest. Several desktop
controls currently rely on hover feedback.

**44pt minimum touch targets**, with real spacing between them. Some existing
chips are 26pt tall.

**Safe areas** — notch, home indicator, and the browser chrome in mobile web,
since this ships as a web app too.

## 5. Screens to cover

| Screen | File | Notes |
|---|---|---|
| Role select | `screens/RoleSelectScreen.tsx` | entry point; student / teacher / admin / translator |
| Auth | `screens/auth/*` | login, register, 2FA setup + verify |
| Translator hub | `screens/TranslatorHubScreen.tsx` | 3-tab switcher: Fingerspelling / Words / Signer |
| Fingerspelling | `screens/FingerspellingScreen.tsx` | nested Letters / Numbers toggle |
| Words | `screens/WordTranslatorScreen.tsx` | record → stop → top-5 matches |
| Signer | `screens/SignerScreen.tsx` | 3D avatar playback + controls |
| Student classroom | `screens/dashboard/StudentDashboard.tsx`, `CurriculumTabs.tsx`, `PracticeScreen.tsx` | ASL/FSL → Letters/Numbers/Words, progress bars, sign grid |
| Teacher | `screens/dashboard/TeacherDashboard.tsx`, `StudentProgressRow.tsx` | per-student progress |
| Admin | `screens/dashboard/AdminDashboard.tsx` | users, classes, system-wide progress |
| Video call | `screens/videocall/VideoCallScreen.tsx` | 1:1 WebRTC, local + remote video |

Existing components to reuse rather than redraw: `SegmentedToggle`, `ProgressBar`,
`GlassCard`, `CameraDevice`, `ConfidenceDial`, `TranslatorPanel`, `RoleCard`,
`Wordmark`, `HandLandmarkMark`, `LanguagePicker`, `HandednessPicker`.

## 6. Functional contracts — do not break these

A designer can't see these from a screenshot, and breaking them breaks the product.

**The camera panel is a real `<video>` with a `<canvas>` layered exactly on top.**
The canvas carries the hand-skeleton overlay and is sized to the video's intrinsic
dimensions. If the two diverge by so much as a few pixels, the landmarks drift off
the hand. The video uses `objectFit: cover` inside its container, so the container
can be resized but the video cannot be letterboxed, padded, or given an
inconsistent aspect without consequences.

**Letters and Words are different interaction models and must stay visibly
different.** Letters predicts continuously at ~30 fps with a hold-to-commit timer.
Words is an explicit record → stop → classify cycle. A student who confuses the
two will think the app is broken.

**The Signer stage is a WebGL canvas** (React Three Fiber). Overlaying UI on it is
possible but costly; prefer controls beside or below it.

**Three tabs mount and unmount one screen at a time**, each rebuilding the
MediaPipe graph. Don't propose a design that implies all three run at once.

## 7. What to deliver

1. **Annotated screen mockups** for the list in §5 at phone width (375×812
   baseline), portrait.
2. **The light-mode token delta** from §3 — concrete values, mapped onto the
   existing token names.
3. **An elevation spec**: what replaces `neuRaised` / `neuInset`, as shadow
   values that can be written into `theme/shadows.ts`.
4. **State coverage** for interactive elements: rest, pressed, selected,
   disabled, loading. Loading especially — the word models take a noticeable
   moment to load and the camera needs permission, so there are real waits here.
5. **Empty and error states**: no camera permission, model still loading, no
   hand detected, a curriculum group with no trained model yet, call failed.

Mockups are the deliverable, not code. RN styling can't be pasted from HTML/CSS,
so anything expressed in a web idiom has to be translated by hand anyway — clear
annotations beat markup.

## 8. Context worth knowing

- The dark theme is not disliked; light mode is being added, so consider whether
  both should ship and the tokens need a theme switch rather than replacement.
- Real accuracy is imperfect — the word model is right about 73% of the time on
  clean data, less in live use. **Design for being wrong**: top-5 alternatives
  are already surfaced and should be easy to tap, not buried as a fallback.
- The audience includes children and teachers, not developers. There is a
  `kidTypography` scale in the theme for exactly that reason.
