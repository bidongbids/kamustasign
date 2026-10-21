# Handoff: KamustaSign (LCSign) — Translator, single-instrument layout

Two screens: **Letters** and **Words**, desktop. Mocks 4a and 4b.

## Overview

A layout + visual redesign of the two translator screens in KamustaSign /
LCSign (React Native + Expo SDK 56, web-first). Both screens become **one
glass instrument panel** with internal 1px rules instead of a column of
free-floating cards. Switching Letters ↔ Words changes only the middle bay
and the first cell of the bottom control strip — everything else holds
position.

Scope is visual and layout. No backend, data or routing change. Two items are
flagged inline as **proposals** (a Clear action, and a Clip length setting);
everything else is a rearrangement of controls that already exist.

## About the design files

The bundled HTML is a **design reference**, not production code. Recreate it
in the existing RN codebase with `StyleSheet.create`, the `src/theme/`
tokens, `GradientBackground`, `GlassCard`, `expo-blur`,
`expo-linear-gradient` and `react-native-svg`. Do not port the HTML and do
not add a CSS framework.

Open `KamustaSign Mockups.dc.html` in a browser. The relevant blocks are the
top turn, labelled **4a** (Letters) and **4b** (Words). Everything below turn
4 in that file is earlier exploration — ignore it, or read turn 1 block **1a**
for the palette and the material-style rationale.

## Fidelity

**High-fidelity.** All values below are final. Mocks are drawn at 1920 × 880
(the `desktop` breakpoint, `≥1100`). Mobile is **not** covered by this
handoff.

## Why this layout

The screen being replaced put three stacked cards in a 420px left column
against a fixed camera on the right, both pinned to the viewport edges. At
1920 that opened a ~400px void down the middle, and each card came out wide
and shallow ("elongated"). The fix: one bounded 1600px panel, three vertical
bays across the top, one horizontal control strip along the bottom, and 1px
rules — not gaps — doing the dividing.

**The camera is deliberately small and must stay small.** The extra width
from widening the panel went to a third bay, never to the video.

---

## Shared shell (identical in both screens)

### Page

- Background: `GradientBackground variant="subtle"` —
  `155deg #1A1E26 → #20262F (60%) → #171A21`. Column layout.
- Header: 70 high, `flex: none`, bottom border 1px `rgba(255,255,255,0.09)`,
  a `180deg rgba(255,255,255,0.05) → 0.01` sheen. The border is **full-bleed**;
  the header's contents are constrained to a centered 1600px row.
- Body: `flex: 1, minHeight: 0`, centers the panel both axes.

### Header contents (centered 1600px row, `space-between`)

- Left group, `gap: 12`: 36×36 circular neumorphic back button (chevron-left);
  34×34 neumorphic logo tile, radius 11, holding `HandLandmarkMark` at 17×17;
  "Translator" in Baloo2_700Bold 18/1.
- Center: the Letters/Words switcher. Track padding 5, radius 999, fill
  `neuWell #1D222B`, inset shadows. Active option padding `9 / 26`, radius
  999, fill `#252B38`, raised shadow, label Inter_600SemiBold 13 in
  `textPrimary`. Inactive: no fill, no shadow, label in `adminGray #7D8799`.
- Right group, `gap: 12`: language pill ("English" + chevron-down),
  neumorphic raised, padding `9 / 16`, Inter_600SemiBold 12 in
  `textSecondary`; 36×36 circular neumorphic help button (help-circle icon).

### The panel

`width: 1600, height: 706`, radius 30, `overflow: 'hidden'`.
Fill `150deg rgba(255,255,255,0.11) → rgba(255,255,255,0.035)`,
1px border `rgba(255,255,255,0.16)`, blur 18,
shadow `0 26px 64px rgba(0,0,0,0.36)`. Column layout.

Two regions:

1. **Top bays** — `flex: 1, minHeight: 0`, `flexDirection: 'row'`,
   `alignItems: 'stretch'`. Three bays separated by 1px vertical rules
   (`width: 1, background: rgba(255,255,255,0.12)`, full height).
   - Bay 1 — camera. `width: 588, flex: none`, padding 24, contents
     vertically centered.
   - Bay 2 — the mode's live output. `flex: 1, minWidth: 0`, padding 28.
   - Bay 3 — translation + actions. `width: 400, flex: none`, padding 28.
2. **Control strip** — `flex: none`, a 1px horizontal rule above it, then
   `flexDirection: 'row'`, `alignItems: 'center'`, padding `22 / 28`,
   `gap: 26`. Cells separated by 1px rules 74 high. Three cells; their
   contents differ per mode (below).

**No cell in either region has its own background, border or shadow.** The
panel is the only surface. Inside it, the only raised objects are the
neumorphic controls and the camera device.

### Bay 1 — the camera device (identical in both screens)

Radius 20, padding 12, housing `155deg #3C434F → #1A1E26 (55%) → #2B313D`,
`inset 0 1px 0 rgba(255,255,255,0.20)` + `0 14px 30px rgba(0,0,0,0.45)`.

- Top shelf 22 high, padding `0 6`: left, a 10×10 lens (radial
  `#5B6478 → #0C0E12 70%`, `inset 0 0 0 1.5px rgba(255,255,255,0.16)`) and a
  5×5 status LED — `success #3FB56A` on Letters, `needsPractice #E0525F` on
  Words while recording; right, "LCSIGN VISION" in Inter_500Medium 9,
  letterSpacing 0.14em, `textDim #6E7788`.
- Screen: **height 326**, radius 14, `overflow: 'hidden'`,
  `inset 0 0 0 1px rgba(0,0,0,0.6), inset 0 0 34px rgba(0,0,0,0.55)`.
  Usable feed area 516 × 326. A `150deg rgba(255,255,255,0.09) → transparent 42%`
  sheen sits over the feed.
- Bottom shelf 26 high, padding `0 8`: status text in Inter_500Medium 9.5
  `textDim` — "30 FPS · MODEL READY" (Letters), "CLASSIFYING · 45 FRAMES
  BUFFERED" (Words); right, three 20×3 radius-2 vent marks at
  `rgba(255,255,255,0.16)`.

Overlays on the feed:

- Landmark dots — `primaryTeal #7C6CF5` 9–11px with `0 0 10px` glow, wrist
  point `accentCoral #F2B23E` 13px. Indicative only; production draws the
  real 21 MediaPipe points on the existing canvas/SVG overlay.
- Letters only: a 186×226 detection box at `left:52, top:36`, 1.5px dashed
  `rgba(124,108,245,0.6)`, radius 14.
- Words only: the REC pill and the hand plate (see 4b below).
- The striped fill and its "webcam feed" caption are **placeholders** for the
  existing `getUserMedia` `<video>` surface.

### Bay 3 — translation + actions (same structure in both screens)

`flexDirection: 'column'`.

- Header row: "TRANSLATION" at `meta`; right, "English · ready" at 10px
  `textTertiary #5F6878`. The right label is live status, not a control.
- The translated string: Baloo2_700Bold 46/1.1, `textPrimary`.
- 1px rule, margin `20 / 0`.
- Helper copy, Inter_400Regular 12/1.65 `textSecondary`.
- `marginTop: 'auto'`, then the actions, `gap: 12` (see per-screen below).

**Speak it** is a solid `accentCoral #F2B23E` pill, 56 high, radius 999,
label Inter_600SemiBold 15 in `textOnAccent #2A1E05`, shadow
`0 5px 14px rgba(242,178,62,0.3)`, with a play icon. It is the only saturated
fill on the screen — the screen's one primary action.

---

## 4a — Letters

### Bay 2: Recognized

`flexDirection: 'column'`.

- Eyebrow "RECOGNIZED" at `meta`, marginBottom 20.
- Row, `alignItems: 'center'`, `gap: 18`:
  - **Letter tile** — 168×168, radius 34, fill `neuBase #232936`, raised
    `9/9/22 #12151B` + `-9/-9/22 #2E3644`. Glyph: Baloo2 (800 if available,
    else 700) at 92/1, `textPrimary`.
  - **Confidence dial** — 168×168, radius 999, inset well: fill
    `neuWell #1D222B`, `inset 6/6/14 #12151B` + `inset -6/-6/14 #2A3140`.
    Ring inset 12 from the well edge: sweep starts at 220°, `success` for
    `pct × 360`, remainder `rgba(255,255,255,0.06)`, masked to a 64–65% donut.
    Center: percentage in Baloo2_700Bold 38/1 (the "%" at 20),
    "CONFIDENCE" at `meta` 9 letterSpacing 0.07em, marginTop 6.
- 1px rule, margin `24 / 0 / 18`.
- Row: "Reading:" Inter_400Regular 13 `textSecondary`; right, "5 letters" at
  10px `textTertiary` (the live count).
- **The letter strip** — `flexDirection: 'row'`, `gap: 7`,
  `flexWrap: 'nowrap'`, `overflow: 'hidden'`. Tiles 36×44, radius 10,
  `flex: none`:
  - committed letters: **inset** — fill `#20252F`, `inset 2/2/6 #12151B`,
    label Inter_600SemiBold 18 in `adminGray`.
  - newest letter: **raised** — fill `#252B38`, `3/3/8 #12151B` +
    `-2/-2/6 #2E3644`, label Inter_700 18 in `accentCoral`.
  - The physical state carries recency; the color is a second cue, not the
    only one.
  - **nowrap is required** — the strip must never break a word across lines.
    It clips, so render only the last N letters that fit (see State).

### Bay 3 actions

- Helper copy: "Letters commit to the strip once they hold steady, then
  translate as a word. Clear empties the strip and starts a new word."
- **Speak it** (as specified in the shell).
- Row, `gap: 12`:
  - **Clear** — `flex: 1`, 52 high, radius 999, **transparent fill**, 1px
    `rgba(255,255,255,0.22)` border, label Inter_600SemiBold 14
    `textPrimary`. **PROPOSAL — this control is new.**
  - **Backspace** — 52×52, radius 999, neumorphic raised, delete icon in
    `textSecondary`.

**Clear vs. backspace — the distinction matters and must be built as stated:**
backspace removes the **last committed letter**; Clear empties the **whole
strip** and starts a new word. Clear is outlined rather than filled because it
is destructive and rarely wanted; do not promote it to a solid fill. Give it
a confirm step only if you see users hitting it by accident — with a 5-letter
word in flight it isn't worth a dialog.

### Control strip (three cells)

1. **Signing hand** — `flex: 1, minWidth: 0`.
   - Label row: "SIGNING HAND" at `meta`; "affects accuracy" at 10px
     `accentCoral`.
   - The rocker: 50 high, radius 15, housing `155deg #333A47 → #1A1E26`,
     `inset 0 1px 0 rgba(255,255,255,0.18)` + `0 5px 12px rgba(0,0,0,0.4)`,
     padding 5, two `flex: 1` halves, `gap: 5`.
     - Active half: radius 11, cap `180deg #4A5261 → #333B49`,
       `0 3px 0 #222832` hard edge + `inset 0 1px 0 rgba(255,255,255,0.3)`,
       label Inter_700 13 `textPrimary`, preceded by a 6×6 `success` LED
       with `0 0 7px` glow, `gap: 7`.
     - Inactive half: no fill, label Inter_600SemiBold 13 `#8A93A3`.
   - The long "trained right-hand dominant" sentence moved out of this cell —
     put it behind the header help button, or as a first-run tooltip.
2. **Commit speed** — `flex: 1, minWidth: 0`.
   - Label row: "COMMIT SPEED" at `meta`; "450ms hold" at 10px `accentCoral`
     (live, reflects the selection).
   - Segmented control: 50 high, radius 999, inset track (`neuWell`,
     `inset 3/3/8` + `inset -3/-3/8 #2A3140`), padding 5, three `flex: 1`
     options `gap: 5`. Selected: radius 999, fill `#252B38`, raised
     `4/4/9` + `-3/-3/8`, label Inter_700 12 `textPrimary`. Unselected:
     Inter_600SemiBold 12 `#8A93A3`.
   - Options Fast / Balanced / Careful. Map to the existing hold thresholds —
     the mock shows Balanced = 450ms.
3. **Holding meter** — `width: 394, flex: none`. This is the one genuinely
   new element in the strip; it exists because Commit speed is meaningless
   without seeing the hold it configures, and because the cell would
   otherwise be empty.
   - Label "HOLDING · 290 / 450 ms" at `meta` (live).
   - A 50-high inset well, radius 15, padding `0 16`, holding a 10-high
     trough (fill `#171B22`, `inset 2/2/5 #0E1117`) with a
     `90deg #5A50A8 → #7C6CF5` fill at `heldMs / thresholdMs`, and the same
     figure as a percentage at the right in Inter_500Medium 11
     `textSecondary`.
   - When nothing is being held, the fill is 0% and the label reads
     `0 / 450 ms` — do not hide the cell.

---

## 4b — Words

Same shell, same 588 / flex / 400 bays, same strip geometry. What differs:

### Camera overlays

- Status LED `needsPractice`, bottom-shelf text "CLASSIFYING · 45 FRAMES
  BUFFERED".
- **REC pill**, `left:16, top:14`: fill
  `150deg rgba(224,82,95,0.30) → rgba(224,82,95,0.14)`, 1px
  `rgba(224,82,95,0.5)` border, blur 14, radius 999, padding `7 / 12`,
  `gap: 8` — an 8×8 `needsPractice` dot with glow, "REC" in
  Inter_600SemiBold 11 white, "45 / 60 frames" at 10px
  `rgba(255,255,255,0.72)`.
- **Hand plate**, `right:16, top:14`: glass-over-video (fill
  `rgba(255,255,255,0.14) → 0.05`, border `rgba(255,255,255,0.22)`), radius
  999, padding `7 / 12`, "LEFT HAND" at `meta` 10 in
  `rgba(255,255,255,0.8)`. Read-only — it mirrors the rocker so the setting
  is visible on both screens.
- No detection box on Words (the sign is a movement, not a pose).

### Bay 2: Top matches

- Header row: "TOP MATCHES" at `meta`; right, "45 frames" at 10px
  `textTertiary`.
- **Rank 1 on a raised slab** — radius 20, padding 20, fill `neuBase`,
  raised `7/7/18` + `-7/-7/18`, marginBottom 20.
  - Row: word in Baloo2_700Bold 40/1 `textPrimary`; percentage in
    Baloo2_700Bold 24/1 `success`.
  - Bar: 14 high, radius 999, inset trough (`neuWell`, `inset 3/3/7` +
    `inset -2/-2/5`), fill `90deg #2E9A58 → #3FB56A` with
    `0 0 10px success@0.55` glow, width = confidence.
- **Ranks 2–5**, `gap: 14`, each: a label row (word Inter_600SemiBold 16 +
  percentage Inter_500Medium 12) over a 9-high inset trough
  (`inset 2/2/5 #12151B`) with a `primaryTeal` fill.
  - Ranks 2–3: word `textOnGlass #C3CAD6`, percentage `adminGray`, fill
    `primaryTeal`.
  - Ranks 4–5: word `#8F98A6`, percentage `textTertiary`, fill
    `primaryTealDark #5A50A8` — the tail visibly recedes.
- Bar widths come straight from the model's softmax. **Do not rescale or
  apply a minimum width** — a 2% bar should look like 2%.

### Bay 3 actions

- Helper copy: "Record a sign, hold it steady, then stop to classify. Clear
  discards the clip and the ranked matches."
- **Speak it** (as in the shell).
- **Clear** — full width, 52 high, outlined, same styling as 4a. On Words it
  discards the buffered clip and the prediction list, returning the bay to
  its empty state. No backspace on this screen (nothing accumulates).

### Control strip (three cells)

1. **Recording** — `width: 394, flex: none`, row, `gap: 18`.
   - **The record button**: 74×74 outer bezel, radius 999,
     `160deg #3A414F → #1A1E26`, `0 6px 14px rgba(0,0,0,0.5)` +
     `inset 0 1px 0 rgba(255,255,255,0.2)`. Inner cap 56×56, radius 999,
     `180deg #E0525F → #A8303C`, `0 4px 0 #7A1F29` hard edge +
     `0 8px 14px needsPractice@0.35` + `inset 0 1px 0 rgba(255,255,255,0.35)`.
     Glyph: an 18×18 radius-5 white square while recording, a filled circle
     when idle.
   - Text block `flex: 1, minWidth: 0`: "Recording" Baloo2_700Bold 16/1.2;
     "Tap again to classify." Inter_400Regular 11/1.5 `textSecondary`; then a
     **12-bar frame meter**, 16 high, `gap: 3`, bars `flex: 1` radius 2,
     heights 30–100%, colored `#3F4655 / #4B5364 / #5B647A` with the current
     frame in `needsPractice` and one `primaryTeal` marker. This replaces
     the old "red dot + frame count badge".
2. **Signing hand** — identical to 4a, including the LED and the labels.
3. **Clip length** — `flex: 1, minWidth: 0`. **PROPOSAL — this setting does
   not exist today.** Label row "CLIP LENGTH" + "60 frames" at 10px
   `accentCoral`; segmented control identical in construction to Commit
   speed, options Short / Standard / Long.
   - It is here because the cell would otherwise be empty and reopen the void
     this redesign closed. **If the 60-frame window is fixed, delete this
     cell** and let Signing hand and Recording each take `flex: 1` — do not
     leave it blank, and do not invent a different filler.

---

## Design tokens

Colors are the **Graphite Aurora** values proposed earlier in the mock file
(turn 1, block 1a) — a values-only diff on the existing token *names* in
`src/theme/theme.ts`, so nothing outside that file changes to adopt or
revert it.

| Token | Value | Role |
|---|---|---|
| `gradientStart / Mid / End` | `#171A21 / #1E2430 / #262C3A` | page ground |
| `background` | `#1A1E26` | translator ground (subtle variant start) |
| `primaryTeal / Dark / Light` | `#7C6CF5 / #5A50A8 / #9A8DF8` | landmarks, prediction bars, holding meter |
| `accentCoral / Dark` | `#F2B23E / #C08420` | Speak it, live setting values, newest letter |
| `textOnAccent` | `#2A1E05` | label on `accentCoral` |
| `adminGray / Light` | `#7D8799 / #9AA3B2` | inactive switcher + committed letters |
| `surface / Elevated / Muted` | `#232936 / #252B38 / #20252F` | neumorphic body / selected / inset tile |
| `textPrimary` | `#EDEFF4` | headings, glyphs |
| `textSecondary` | `#98A1B2` | body, eyebrows |
| `textTertiary` | `#5F6878` | 10px meta only — fails AA at body size |
| `textDim` | `#6E7788` | text inside the device housing |
| `textOnGlass` | `#C3CAD6` | ranks 2–3 |
| `success` | `#3FB56A` | confidence, ready LEDs |
| `needsPractice` | `#E0525F` | recording |
| `glassTint` | `rgba(255,255,255,0.11)` → `0.035` | panel fill (0.14 → 0.05 over video) |
| `glassBorder` | `rgba(255,255,255,0.16)` | panel border (0.22 over video) |
| `divider` | `rgba(255,255,255,0.12)` | the 1px internal rules |
| `neuBase / neuWell / neuWellLight` | `#232936 / #1D222B / #2A3140` | neumorphic fills |
| `neuShadowDark / Light` | `#12151B / #2E3644` | neumorphic shadow pair |
| `focusRing` | `#F2B23E` | 2px `:focus-visible`, offset 2 |

Type: **Baloo2 700/600 and Inter 400/500/600 only** — the fonts already
loaded via `expo-font` in `App.tsx`. The monospace in the mocks is handoff
annotation; the small uppercase `meta` style is Inter_500Medium 10,
letterSpacing 0.11em. Baloo2_800 is used for the 92px letter glyph — if you
don't want the extra weight, use 700 at the same size.

Radii used: `10, 11, 14, 15, 20, 30, 34, 999`. Nested radii are
`outer − padding`; derive them rather than hard-coding.

## Interactions

- **Live prediction (Letters).** Only the letter glyph and the dial change per
  frame. Cross-fade the glyph over 120ms; animate the dial sweep with
  `Animated.timing` 180ms ease-out. Never animate the tile's shadow.
- **Letter commit.** The new strip tile animates inset → raised over 160ms
  while the previous newest goes raised → inset.
- **Holding meter.** Width tracks `heldMs / thresholdMs` continuously, no
  easing — it is a progress readout, not a transition.
- **Clear.** Empties the strip in one step; fade the tiles out over 120ms
  rather than sliding them, so the row's height never moves.
- **Record (Words).** Press: cap `translateY` 0 → 2 and hard edge 4 → 2 over
  90ms, then hold. Release on stop. Glyph cross-fades circle ↔ square.
- **Frame meter.** One bar per captured frame, no easing.
- **New classification.** Animate **bar widths only**, 260ms ease-out,
  staggered 40ms down the ranks. Do **not** reorder rows, retype the words,
  or count the percentages up — a teacher needs to be able to point at the
  list mid-demo.
- **Hover** (web): `onHoverIn`/`onHoverOut` on `Pressable`. Raise a
  control's neumorphic offset by 1px; do not change its fill.
- **Reduced motion** (`prefers-reduced-motion` on web,
  `AccessibilityInfo.isReduceMotionEnabled` native): set final values
  directly, skip every transition above.

## State

No new state except the two proposals.

**Letters:** `currentLetter`, `confidence` (0–1), `heldMs`,
`commitThresholdMs` (Fast/Balanced/Careful → existing values),
`accumulatedWord: string`, `signingHand: 'left' | 'right'`,
`targetLanguage`, `translation`, `modelReady`, `fps`.

- The strip renders `accumulatedWord`, last-N-that-fit, newest last. Compute
  N from the bay width — do not wrap and do not shrink the tiles.
- Backspace: `accumulatedWord.slice(0, -1)`. **Clear: `''`** (new).

**Words:** `isRecording`, `frameCount`, `frameTarget` (60; **`clipLength`
is the proposal**), `predictions: {word, confidence}[]` sorted desc,
`translation`, `isSpeaking`, `signingHand` (read-only mirror).

- Clear: `predictions = []`, `frameCount = 0`, `translation = null`.

**Not designed here:** empty, loading and error states, and first-run
onboarding. The mocks show the happy path. When you build the empty states,
keep the bays and the strip in place and empty their contents — the layout
must not reflow between empty and populated.

## RN implementation notes

1. **`minWidth: 0`** on bay 2 and on every `flex: 1` strip cell. RN Web's
   `min-width: auto` default is what pushed a video panel off-screen in a
   previous session.
2. **Double shadows** — RN 0.81+ (Expo SDK 56) takes `boxShadow` as an array
   and supports `inset: true` on web, iOS and Android. Add
   `neuRaised(size)` / `neuInset(size)` to `src/theme/shadows.ts` and use
   those, not inline shadow objects. If a platform ever lacks array support,
   degrade to the dark shadow plus a 1px `rgba(255,255,255,0.06)` top border —
   never to a flat fill.
3. **Gradients** — `expo-linear-gradient` for housings, glass fills, bar
   fills and sheens.
4. **The confidence dial** has no conic-gradient equivalent. Draw it in
   `react-native-svg`: a `<Circle>` with `strokeDasharray` /
   `strokeDashoffset`, `transform="rotate(-140)"` for the 220° start,
   `strokeLinecap="butt"`, plus a second circle for the unfilled remainder.
5. **Radial gradients** (the lens) — `react-native-svg` `<RadialGradient>`.
6. **The dashed detection box** — `react-native-svg` `strokeDasharray`; RN's
   `borderStyle: 'dashed'` does not combine reliably with a border radius.
7. **Backdrop blur** — `expo-blur` `BlurView`, intensity ≈ 18 for the panel
   and 14 for the video overlays, with the tint layer on top and
   `overflow: 'hidden'` on the rounded container.
8. **The 1px rules** are `View`s with a fixed `width`/`height` of 1 — not
   `borderWidth`, which would round with the panel's corners.
9. **Icons** — Lucide equivalents via `react-native-svg`. The glyphs
   "‹ ▾ ? ⌫ ▶" in the mocks are placeholders.

## Accessibility

The brief ranks a full accessibility audit above visual polish; this pass does
not discharge it. What this design does and doesn't do:

- Every state cue is doubled — strip tiles use elevation **and** color; the
  rocker uses position, an LED **and** a label; prediction rank uses
  elevation, bar length **and** a number. No color-only signals.
- Needs labels: `accessibilityRole="switch"` + state on the rocker and the
  segmented controls; `accessibilityRole="button"` with an explicit
  `accessibilityLabel` on Clear ("Clear all letters") so it isn't confused
  with backspace; `accessibilityLiveRegion="polite"` on the recognized letter
  and on the top prediction.
- Contrast to verify (not measured): `textTertiary #5F6878` on the panel is
  roughly 2.6:1 — **keep it to 10px meta, never body copy**. `textDim` inside
  the housing and white-on-glass over live video both need a real check; the
  0.14 video tint is the floor.
- Hit targets: all strip controls are 50 high, buttons 52–56 — fine. The
  rocker halves are 40 high inside a 50 housing; acceptable on a desktop
  pointer target this wide, but raise the housing to 56 if this layout is
  ever used on touch.
- Keyboard order on the desktop screen is unspecified and untested. Suggested:
  switcher → language → help → rocker → commit speed → Speak it → Clear →
  backspace.

## Assets

None new. Everything is tokens, gradients and shadows.

- `HandLandmarkMark` — reuse the existing SVG. It appears as a striped
  placeholder in the mocks and has never had a brand pass; do not treat the
  placeholder as a design.
- The camera feed and the landmark dots are placeholders for the existing
  `getUserMedia` surface and the real 21-point overlay.

## Files

- `KamustaSign Mockups.dc.html` — the mockups. Blocks **4a** (Letters) and
  **4b** (Words) at the top of the file are what this handoff specifies.
  `support.js` sits beside it so the file opens offline.
- `KamustaSign_UI_Design_Brief.md` — the original brief: full screen
  inventory, current token values, known gaps, open questions.

Authoritative on the current implementation, and not in this bundle:
`src/theme/theme.ts`, `src/theme/shadows.ts`, `src/theme/responsive.ts`,
`src/components/GradientBackground.tsx`, `src/components/GlassCard.tsx`.

## Decisions needed

- **Clip length** (4b, cell 3) — keep as a real setting, or delete the cell?
- Mobile layouts for these two screens are not designed. The bays would stack;
  it needs its own pass.
- `GlassCard` should gain a `tint: 'sheer' | 'frosted'` prop as part of this
  work, replacing the frosted pattern currently inlined in the auth and
  dashboard screens. These two screens only use `sheer`.
