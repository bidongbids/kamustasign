# Handoff: KamustaSign light theme + phone layouts

**For:** Claude Code, working in the KamustaSign React Native (Expo) repo.
**Source of truth for design decisions:** the "KamustaSign" design system artifact (claude.ai). Everything you need is copied into this file, so you don't need to open it.
**Goal:** add a **light theme** next to the existing dark theme ("Graphite Aurora") and rework the `isMobile` (<768) layouts for phones (375×812 baseline, portrait). **Both themes ship.** Dark must look exactly as it does today.

---

## 0. Before you change anything

1. Read `src/theme/theme.ts`, `src/theme/shadows.ts`, `App.tsx` (font loading), and `useResponsive()`.
2. The design used **guessed key names** for everything except `primaryTeal`, `accentCoral`, `success`, `needsPractice`. Map the guessed names in §2 onto the real keys in `theme.ts`, and add new keys only where nothing exists. Record that mapping in your PR description.
3. Dark values marked **(confirm)** in §2 are placeholders. **Keep the real values from `theme.ts`** and don't overwrite them with the placeholders.
4. Check the RN version and whether the New Architecture is on. That decides how you implement shadows (§3).

## 1. Hard constraints (from the brief; do not violate)

- Style only with `StyleSheet.create`: no CSS, Tailwind, className, media queries or hover. Use Flexbox only.
- Fonts available: **Baloo2** 700/600 and **Inter** 400/500/600. Don't use any other weights.
- Keep the existing scales: spacing 4/8/16/24/32/48 and radii 8/16/24/999.
- **Camera:** `<video>` with a `<canvas>` layered exactly on top, the canvas sized to the video's intrinsic dimensions, video `objectFit: 'cover'`. You may resize the *container*. Never pad, letterbox or inset the video, and keep the canvas on the same box and the same cover transform. Overlays (status pills etc.) are absolutely positioned siblings and must not change the video box.
- **Letters ≠ Words.** Letters predicts continuously (~30 fps) and uses a hold-to-commit ring with **no record button**. Words uses explicit record → stop → classify. Keep them visibly different.
- **Signer stage** is a WebGL canvas (R3F). Put controls beside or below it, not on top.
- **Translator hub tabs mount one screen at a time** (each rebuilds MediaPipe). Don't keep all three mounted.
- Touch targets **≥ 44pt** in both dimensions, with ≥ 8 between neighbours.
- Respect safe areas (notch, home indicator, mobile web browser chrome) via `react-native-safe-area-context`.

## 2. Tokens

### 2.1 Colors (`colors.light` / `colors.dark`)

| guessed key | light (new) | dark | use |
|---|---|---|---|
| `background` | `#EEF1F6` | `#1B2029` (confirm) | screen background |
| `surface` | `#F8F9FC` | `#232936` | cards, raised controls |
| `surfaceInset` | `#E4E8F0` | `#1D222C` (confirm) | tracks, wells, inputs |
| `surfacePressed` *(new)* | `#E6E9F1` | `#1F2430` (confirm) | raised control while pressed |
| `surfaceSelected` *(new)* | `#EAE7FF` | `#2A2F45` (confirm) | selected row/chip (non-primary) |
| `hairline` | `#D5DAE5` | `#2E3644` (confirm) | decorative 1px borders only |
| `controlBorder` *(new)* | `#7F889E` | `#717A8F` (confirm) | meaningful outlines (≥3:1) |
| `textPrimary` | `#1B1F2A` | `#E8ECF4` (confirm) | headings, body |
| `textSecondary` | `#4A5266` | `#A9B2C4` (confirm) | supporting text |
| `textMuted` | `#5D6579` | `#8D97AB` (confirm) | captions; lightest allowed text |
| `primaryTeal` | `#6352E6` | `#7C6CF5` | violet fill (selected, primary) |
| `primaryTealText` *(new)* | `#5241C9` | `#B3A8FF` | violet as text/icon |
| `onPrimary` *(new)* | `#FFFFFF` | `#FFFFFF` | text on `primaryTeal` |
| `accentCoral` | `#F2B23E` | `#F2B23E` | gold fill/ring (never text on light) |
| `onAccent` *(new)* | `#3A2A00` | `#1B2029` | text on gold |
| `accentCoralText` *(new)* | `#8A5A00` | `#F2B23E` | gold as text |
| `success` | `#2A9152` | `#3FB56A` | mastered fill, hand-detected dot |
| `successText` *(new)* | `#1E7B42` | `#5FD08A` | green as text |
| `needsPractice` | `#D9475A` | `#E0525F` | needs-practice fill, error icon |
| `needsPracticeText` *(new)* | `#B3303D` | `#FF7A85` | error copy |
| `onStatus` *(new)* | `#FFFFFF` | `#1B2029` | text on solid status badges |
| `focusRing` *(new)* | `#4F3FD0` | `#B3A8FF` | 2px outline, 2px offset (web) |
| `shadowDark` | `#667292` (used at 22–28% α) | `#12151B` | far-side neu shadow |
| `shadowLight` | `#FFFFFF` (85–90% α) | `#2E3644` | near-side highlight |
| `cameraBezel` *(new)* | `#12151B` | `#12151B` | frame around video/Signer, both themes |
| `onCamera` *(new)* | `#FFFFFF` | `#FFFFFF` | text over video/bezel |
| `cameraScrim` *(new)* | `rgba(18,21,27,0.62)` | same | pill behind status text over video |

Rules: `success` and `needsPractice` always appear with an icon or word ("Mastered" + check, "Needs practice" + retry arrow), never as colour alone. Dark `primaryTeal` + white text is only 3.95:1, so in dark mode only bold text ≥19px goes on it.

### 2.2 Typography (`isMobile` branch; desktop unchanged)

| style | family / weight | size / line height |
|---|---|---|
| hero | Baloo2 700 | 32 / 36 |
| title | Baloo2 700 | 24 / 30 |
| heading | Baloo2 600 | 20 / 26 |
| transcript | Baloo2 700 | 28 / 34 |
| body | Inter 400 | 16 / 24 |
| bodyStrong | Inter 600 | 16 / 24 |
| label | Inter 500 | 14 / 20 (minimum for labels) |
| caption | Inter 500 | 13 / 18 (meta text only) |
| kidTitle | Baloo2 700 | 30 / 36 |
| kidBody | Inter 500 | 18 / 26 |
| kidLabel | Inter 600 | 16 / 22 |

Merge these into the existing `typography` / `kidTypography` (mobile overrides). If the existing mobile values are close, prefer them.

### 2.3 Sizes (new keys in `sizes`)

`touchMin: 44`, `recordButton: 72`, `tabBarHeight: 52`, `progressHeight: 10` (14 on the student hero card), `dialSize: 64`.

## 3. Elevation: `theme/shadows.ts`

Keep the function names and make each one theme-aware: `neuRaised(theme)`, or read the theme from context. Add `neuPressed`.

| function | light | dark (keep existing if different) |
|---|---|---|
| `neuRaised` | far `#667292` α.28 offset(4,6) r14 · near `#FFFFFF` α.90 offset(−4,−4) r10 · **1px `hairline` border** | far `#12151B` (5,5) r12 · near `#2E3644` (−4,−4) r10 |
| `neuRaisedSm` | far α.26 (2,3) r7 · near α.90 (−2,−2) r5 · 1px `hairline` | far (3,3) r6 · near (−2,−2) r5 |
| `neuInset` | inset far `#667292` α.22 (2,2) r5 · inset near `#FFF` α.85 (−2,−2) r5 · fill `surfaceInset` | inset `#12151B` (3,3) r7 · inset `#2E3644` (−3,−3) r7 |
| `neuPressed` *(new)* | inset far α.25 (1,2) r4 · 1px `hairline` · fill `surfacePressed` · `transform: [{scale: 0.97}]` | inset `#12151B` (2,2) r5 |
| `shadow('card')` | `#1B1F2A` α.06 (0,1) r2 + `#667292` α.16 (0,6) r16 · 1px `#DCE0EA` border | same as `neuRaised` |
| `shadow('sheet')` | `#1B1F2A` α.14 (0,−8) r24 · top 1px `hairline` | `#000` α.45 (0,−8) r24 |

Web / `boxShadow` strings (use these directly on react-native-web and on RN ≥0.76 with the New Architecture):

```
light neuRaised:   -4px -4px 10px rgba(255,255,255,0.9), 4px 6px 14px rgba(102,114,146,0.28), 0 0 0 1px #D5DAE5
light neuRaisedSm: -2px -2px 5px rgba(255,255,255,0.9), 2px 3px 7px rgba(102,114,146,0.26), 0 0 0 1px #D5DAE5
light neuInset:    inset 2px 2px 5px rgba(102,114,146,0.22), inset -2px -2px 5px rgba(255,255,255,0.85)
light neuPressed:  inset 1px 2px 4px rgba(102,114,146,0.25), 0 0 0 1px #D5DAE5
light card:        0 1px 2px rgba(27,31,42,0.06), 0 6px 16px rgba(102,114,146,0.16), 0 0 0 1px #DCE0EA
light sheet:       0 -8px 24px rgba(27,31,42,0.14), 0 -1px 0 #D5DAE5
```

Implementation by platform:
- **RN ≥0.76 New Arch and web:** return `{ boxShadow, borderWidth: 1, borderColor }`.
- **Older RN, iOS:** two nested Views (outer = far shadow, inner = near highlight + hairline border), the same pattern `neuRaised` uses today.
- **Older RN, Android:** `elevation` 3 (raised) / 1 (sm) / 0 (inset) + 1px `hairline` border. Inset wells: `surfaceInset` fill + 1px `#D3D8E4` top border + 1px white bottom border, or an `expo-linear-gradient` from `#DDE2EB` to `surfaceInset` over the top 30%.
- Never draw neumorphic shadows on or inside `cameraBezel`.

### State table (apply to every interactive element)

| state | raised control | segment/tab | list row |
|---|---|---|---|
| rest | `surface` + `neuRaised` | `textSecondary` label on `surfaceInset` track | `surface` + `neuRaisedSm` |
| pressed | `surfacePressed` + `neuPressed`, scale .97, 100ms | label → `textPrimary` | `surfacePressed` + `neuPressed` |
| selected | `primaryTeal` + `onPrimary` | `primaryTeal` thumb + `onPrimary` + `neuRaisedSm` | `surfaceSelected` + 2px `primaryTeal` border + check |
| disabled | `surfaceInset`, no shadow, dashed `controlBorder`, `textMuted` | `textMuted`, not focusable | `surfaceInset`, `textMuted` |
| loading | same size, spinner + progress text, taps blocked | 2px `accentCoral` underline on thumb | skeleton bars |

Use `Pressable` with `({pressed}) => ...` styles. Nothing relies on hover.

## 4. Theme switching

- Add `ThemeProvider` + `useTheme()` returning `{ name, colors, shadows, typography }`.
- `StyleSheet.create` runs at module load, so convert colour-dependent styles to `makeStyles(theme)` factories memoised per theme (`useMemo(() => makeStyles(theme), [theme.name])`).
- Default theme: `Appearance.getColorScheme()`. Add a toggle in the profile/header menu and persist the choice (AsyncStorage, or whatever the app already uses).
- Do this migration **one screen at a time** and keep dark pixel-identical.

## 5. Components

| component | change |
|---|---|
| `GlassCard` | Add an `overMedia` prop. Light + `!overMedia` → **opaque**: `surface`, radius 16, `shadow('card')`, **no BlurView**. `overMedia` (both themes) → BlurView `tint="dark"` intensity 40 + `cameraScrim` fill, `onCamera` text. Dark + `!overMedia` → unchanged. |
| `SegmentedToggle` | Track `surfaceInset` + `neuInset`, height 52, padding 4, pill. Segments ≥44 tall. States per §3. Supports per-option `disabled` / `loading`. |
| `ProgressBar` | Track `surfaceInset` + `neuInset`, height 10 (14 hero). Fill `success` / `primaryTeal` / `needsPractice`. **Required** status text + icon at the right. Loading → `hairline` skeleton + "Loading…". Teacher rows: stacked variant with counts. |
| `CameraDevice` | Mobile: drop the decorative shelves/vents. Container `cameraBezel`, radius 24, full content width (343), 400 tall. Status readout → `cameraScrim` pill top-left (32 tall, `success` dot or grey "No hand yet"). Letters: `accentCoral` "Live" chip top-right. Words: "Recording 0:02" chip there. Loading and no-permission overlays per §7. |
| `ConfidenceDial` | 64px on phones. Disc `surface` + `neuRaisedSm`, 6px ring on `surfaceInset`. ≥.80 `success` "Sure", .50–.79 `accentCoral` "Maybe", <.50 `needsPractice` "Unsure", null "–" "Waiting". Number Baloo2 700 18. Throttle to 10 updates/s. |
| `TranslatorPanel` | Words result = bottom sheet (`surface`, top radius 24, `shadow('sheet')`, grab handle). Best match in `transcript` + confidence badge. "Not right? Tap the sign you made" then **4 alternatives as 52px full-width rows** with mini bar + %. Selected = `surfaceSelected` + 2px `primaryTeal` border + check. Buttons: "Try again" (secondary) / "Use this" (primary). Log the chosen alternative as a correction if there's a hook for it. Never hide alternatives behind "More". |
| `LanguagePicker` | Two equal 44pt chips, **FSL first and default**, ASL second. Chip = `surface` + `neuRaisedSm` + 1px `controlBorder`. Selected `primaryTeal` + `onPrimary`. Code + full name ("FSL Filipino"). No dropdowns or flags. |
| `HandednessPicker` | Two 44pt pills (icon + "Left"/"Right"). Below 360 wide, collapse to one 44×44 toggle with an accessibility label. |
| `RoleCard` | 2×2 grid, half width − 8, ~140 tall, radius 24, `neuRaised`. Icon in 40px `surfaceSelected` tile. Order: Student, Teacher, Admin, Translator (bottom-right). |
| **New** `CaptureControls` (or inline in the two screens) | Letters: 48px candidate glyph on `surfaceSelected` tile inside an `accentCoral` hold ring + transcript with `primaryTeal` caret + hint "Hold still to add the letter". Words: 72px record button (`surface` + `neuRaised`, `needsPractice` disc). Recording → stop square inside an `accentCoral` progress ring. Loading → disabled style labelled "Loading…". |
| **New** `StateMessage` | Icon in 48px `surfaceInset` disc, `heading`, one `body` line, full-width primary button (48), optional text secondary (44). Variants: `card`, `banner` (`surfaceInset`, for offline notices). |

## 6. Screen layouts (`isMobile`, 375×812)

Vertical budget: top inset + 56 header ≈ 100. Bottom dock + home indicator ≈ 190. Content ≈ 520. Side gutter 16.

- **Shared:** header = back (44) · centred `title` · one 44 action. **Bottom dock** = `surface` + `shadow('sheet')`, top radius 24, padded by bottom safe inset + 8. Primary controls live in the dock. On mobile web, use the dynamic viewport height so the dock isn't hidden behind the browser toolbar.
- **RoleSelect:** `hero` "Kamusta!" + "Who's using KamustaSign?", RoleCard 2×2, LanguagePicker under the grid.
- **Auth:** single column. Inputs 52 tall on `surfaceInset` + `neuInset` with labels above. Full-width 52 primary button pinned to the dock (lifts with the keyboard). 2FA: six 48×56 boxes, numeric keyboard, "Paste code" chip. Errors below the field in `needsPracticeText` + icon.
- **TranslatorHub:** move the 3-tab SegmentedToggle **to the bottom row of the dock**. On switch, unmount the old tab immediately and show the camera loading state "Starting hand tracking…".
- **Fingerspelling:** camera 343×400 (status pill + Live chip + ConfidenceDial top-right). Below: transcript row (candidate tile + hold ring, Backspace 44, Speak 44). Dock rows: [LanguagePicker + HandednessPicker] / [Letters|Numbers toggle] / [hub tabs]. **No record button.**
- **Words:** same camera block. Record button centred in the dock. After stop: "Reading your sign…", then the TranslatorPanel sheet over the lower camera half.
- **Signer:** WebGL stage 343×360 in `cameraBezel`, nothing overlaid. Below: text input (52), then Play/Pause 56 (primary), Replay 44, Speed chip 0.5×/1×, Loop 44. Highlight the current word in `accentCoral`. LanguagePicker in the dock.
- **StudentDashboard / CurriculumTabs / Practice:** `kidTitle` greeting, hero card (current unit, 14px ProgressBar, "Continue"). FSL|ASL 2-option toggle, then a Letters/Numbers/Words chip row (44, horizontal scroll). Sign grid in 3 columns of ~104×112 tiles with a status corner (check / retry / empty). Practice reuses the Fingerspelling camera block. Feedback banner in the dock ("Nice! That's B." + check).
- **TeacherDashboard / StudentProgressRow:** class switcher chip, then 72px rows (40 initials avatar, name, stacked bar, counts). Default sort "Needs help first".
- **AdminDashboard:** 3 summary cards in a horizontal snap scroller, then a Users|Classes toggle with 64px rows. Destructive actions go in the overflow menu, not inline.
- **VideoCall:** remote video full-bleed in `cameraBezel`, local 96×128 draggable tile snapping to corners. Dock on `cameraScrim` blur: mute, camera, captions toggle, end (64, `needsPractice`). Captions above the dock in `onCamera` `transcript` on `cameraScrim`.
- **Landscape:** camera on the left 60%, dock as a right column. Nothing more is required.

## 7. Empty / error / loading states (copy is final unless the team objects)

| situation | where | heading · message | action |
|---|---|---|---|
| No camera permission | camera block | "Camera is off" · "KamustaSign needs your camera to see your hands." | **Allow camera**; secondary "How to turn it on" |
| Permission permanently denied | camera block | "Camera is blocked" · "Turn it on in Settings › KamustaSign › Camera." | **Open Settings** |
| Model loading | camera (video dimmed under `cameraScrim`) | "Getting the word model ready" + progress bar + "60%" | none; record button disabled-loading |
| No hand (after 3 s) | status pill + hint | pill → grey "No hand yet"; hint "Keep your hand inside the frame, in good light." | auto-clears |
| Curriculum group with no trained model | sign grid / practice | "Coming soon" · "You can learn these signs from the videos. Practice with the camera isn't ready yet." | **Watch the signs**; tiles get a "Video only" badge |
| Call failed | video call | "Call didn't connect" · "Check your internet and try again." | **Try again**; secondary "Back" |
| Offline | any | banner: "You're offline. Progress will sync later." | none |

Voice: short, warm, second person, sentence case, no emoji, no error codes shown to students.

## 8. Suggested order of work

1. Theme plumbing: `ThemeProvider`, `useTheme`, light/dark colour objects, theme-aware `shadows.ts`, persisted toggle. Dark must remain unchanged (screenshot-compare).
2. Primitives: `GlassCard`, `SegmentedToggle`, `ProgressBar`, `LanguagePicker`, `HandednessPicker`, `StateMessage`, touch-target fixes (26pt chips → 44).
3. Translator: `CameraDevice` mobile variant, dock, Fingerspelling, Words + `TranslatorPanel`, Signer.
4. Role select + Auth.
5. Classroom (student, teacher, admin), then VideoCall.
6. Empty/error/loading states everywhere.

Make small commits per step, and run the app on iOS, Android and mobile web after steps 1, 3 and 5.

## 9. Acceptance checklist

- [ ] Dark theme is visually unchanged.
- [ ] Every text/background pair in §2.1 holds ≥4.5:1 (≥3:1 for text ≥24px or bold ≥19px, and for meaningful borders/icons) in **both** themes. Re-check against the real dark values you kept.
- [ ] No tappable element is under 44×44. Neighbours are ≥8 apart.
- [ ] No hover-only affordances remain.
- [ ] Camera canvas landmarks still align with the hand at several container sizes (test portrait 375 and 414 widths, plus landscape).
- [ ] Letters has no record button. Words has no live-updating letter.
- [ ] Only one hub tab is mounted at a time (check MediaPipe init logs).
- [ ] Nothing is overlaid on the Signer WebGL canvas.
- [ ] FSL is listed first and is the default everywhere.
- [ ] Top-5 alternatives are visible and tappable without extra taps.
- [ ] Safe areas are correct on a notched iPhone, Android with gesture nav, and iOS Safari / Android Chrome web.
- [ ] Only Baloo2 600/700 and Inter 400/500/600 are referenced.

## 10. Open questions to flag back (don't block on them)

- Real dark values for the keys marked (confirm).
- Whether there is a corrections endpoint for logging a chosen alternative.
- Final icons: the design used placeholders. Use the app's existing icon set, `Wordmark` and `HandLandmarkMark`.
