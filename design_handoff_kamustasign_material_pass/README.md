# Handoff: KamustaSign (LCSign) — Material UI Pass

Role Select · Live Translator (Letters) · Word Translator — desktop + mobile.

## Overview

A visual pass on three screens of KamustaSign / LCSign, a real-time ASL
interpretation app for Liloan Central School (React Native + Expo SDK 56,
targeting web / iOS / Android from one codebase). Scope is **visual only** —
no new screens, no new data, no backend changes. Two proposals are embedded
in the mockups and are called out explicitly below (a palette change and a
Role Select information-hierarchy change); everything else is a restyle of
existing, working screens.

The design brief this was built from is `uploads/KamustaSign_UI_Design_Brief.md`
in the bundle.

## About the Design Files

The files in this bundle are **design references created in HTML** —
prototypes showing intended look and layout, not production code to copy.
The task is to **recreate them in the existing React Native + Expo codebase**
using its established patterns: `StyleSheet.create`, the `src/theme/`
tokens, `GradientBackground`, `GlassCard`, `expo-blur`,
`expo-linear-gradient`, `react-native-svg`, and the `useResponsive()`
breakpoint hook. Do not introduce a CSS framework, do not port the HTML.

Concretely: change token *values* in `src/theme/theme.ts` (names stay), add
a `tint` prop to `GlassCard`, add a neumorphic shadow helper to
`src/theme/shadows.ts`, then restyle the three screens.

## Fidelity

**High-fidelity.** Colors, type sizes, radii, shadow geometry and copy are
final and specified below. Recreate pixel-close, but honor RN constraints
(see "RN implementation notes") rather than forcing a web-only technique.

Desktop mocks are drawn at **1180 × 740** and represent the `desktop`
breakpoint (`≥1100`). Mobile mocks are drawn at **390 × 844** and represent
the `mobile` breakpoint (`<768`). Tablet (`768–1099`) is not mocked —
use the mobile stack with wider gutters.

---

## Design Tokens

### PROPOSAL: "Graphite Aurora" palette

The mocks use a proposed replacement for the current **Violet Dusk** values.
**Every token name is unchanged** — this is a values-only diff in
`src/theme/theme.ts`, so no screen needs to change to adopt or revert it.

Rationale: neumorphism needs a mid-tone, low-chroma ground for soft double
shadows to read as raised. Violet Dusk's indigo→magenta gradient
(#2E1065 → #6D28D9 → #C026D3) is too saturated and too high-contrast for a
raised/inset light shadow to be legible against. Graphite Aurora keeps the
dusk mood at roughly a fifth of the chroma.

| Token | Violet Dusk (current) | Graphite Aurora (proposed) |
|---|---|---|
| `gradientStart` | #2E1065 | **#171A21** |
| `gradientMid` | #6D28D9 | **#1E2430** |
| `gradientEnd` | #C026D3 | **#262C3A** |
| `primaryTeal` (Teacher) | #6D28D9 | **#7C6CF5** |
| `primaryTealDark` | #4C1D95 | **#5A50A8** |
| `primaryTealLight` | #C026D3 | **#9A8DF8** |
| `accentCoral` (Student) | #FBBF24 | **#F2B23E** |
| `accentCoralDark` | #B45309 | **#C08420** |
| `textOnAccent` | #402D00 | **#2A1E05** |
| `adminGray` | #5B5568 | **#7D8799** |
| `adminGrayLight` | #8B84A0 | **#9AA3B2** |
| `surface` | #FFFFFF | **#232936** |
| `surfaceElevated` | #FFFFFF | **#252B38** |
| `surfaceMuted` | #EFE5FB | **#20252F** |
| `background` | #FAF5FF | **#1A1E26** |
| `textPrimary` | #1E1033 | **#EDEFF4** |
| `textSecondary` | #6B6280 | **#98A1B2** |
| `textOnPrimary` | #FFFFFF | **#FFFFFF** |
| `border` | #E4D4F7 | **rgba(255,255,255,0.16)** |
| `success` | #2F9142 | **#3FB56A** |
| `needsPractice` | #DC3545 | **#E0525F** |
| `focusRing` | #FBBF24 | **#F2B23E** |
| `overlay` | rgba(30,16,51,0.55) | **rgba(10,12,16,0.62)** |
| `disabledSurface` / `disabledText` | #EDE6F5 / #A79BB8 | **#20252F / #5F6878** |

New tokens required:

| Token | Value | Role |
|---|---|---|
| `glassTint` | `rgba(255,255,255,0.11)` | sheer glass fill (top stop 0.13, bottom 0.035 when gradiented) |
| `glassTintFrosted` | `rgba(255,255,255,0.58)` | frosted glass fill (see GlassCard change) |
| `glassBorder` | `rgba(255,255,255,0.16)` | 1px glass hairline (0.20–0.22 over video) |
| `neuBase` | `#232936` | neumorphic body fill |
| `neuShadowDark` | `#12151B` | neumorphic bottom-right shadow |
| `neuShadowLight` | `#2E3644` | neumorphic top-left highlight |
| `neuWell` | `#1D222B` | inset trough / switcher track fill |
| `neuWellLight` | `#2A3140` | inset trough highlight |
| `textTertiary` | `#5F6878` | monospace meta, disabled labels |
| `textDim` | `#6E7788` | on-device status text |
| `textOnGlass` | `#C3CAD6` | secondary text on sheer glass |

Additional non-token colors used only inside skeuomorphic objects (they are
material, not brand — keep them local to the component that draws them):

- Device housing gradient: `#3C434F → #1A1E26 (55%) → #2B313D` at 155°
- Rocker housing: `#333A47 → #1A1E26`; rocker cap: `#4A5261 → #333B49`, hard edge `#222832`
- Record button: `#E0525F → #A8303C`, hard edge `#7A1F29`
- Lens: radial `#5B6478 → #0C0E12 (70%)`
- Video-feed placeholder stripes: `#22262E / #1C2028` at 135°, 14px band

### Spacing, radii, breakpoints

Unchanged from the existing system. `xs 4 · sm 8 · md 16 · lg 24 · xl 32 · xxl 48`;
radii `sm 8 · md 16 · lg 24 · pill 999`; breakpoints mobile `<768`,
tablet `768–1099`, desktop `≥1100`.

Radii actually used in the mocks: `5, 6, 8, 10, 11, 12, 14, 15, 16, 18, 20,
22, 26, 999`. Where a value is off-scale it is because the element nests
inside another rounded element — an inner radius should be
`outer − padding`. Prefer snapping to `sm/md/lg/pill` and deriving nested
radii from the parent rather than hard-coding these.

### PROPOSAL: formalize the type scale

Font sizes are currently picked per screen (a gap flagged in the brief). The
mocks use one scale. Add it to `src/theme/theme.ts` as `typography` and
draw from it:

| Token | Family / weight | Size / line-height | Used for |
|---|---|---|---|
| `display` | Baloo2_700Bold | 44 / 1.12 | Role Select headline |
| `h1` | Baloo2_700Bold | 30 / 1.0 | wordmark, big numbers |
| `h2` | Baloo2_700Bold | 21 / 1.1 | role card titles, screen titles |
| `h3` | Baloo2_700Bold | 17 / 1.2 | panel titles |
| `hero` | Baloo2_800 (falls back to 700) | 62 / 1.0 | the recognized letter |
| `body` | Inter_400Regular | 15 / 1.7 | paragraph copy |
| `bodySm` | Inter_400Regular | 13 / 1.5 | card descriptions |
| `label` | Inter_600SemiBold | 14 / 1.0 | button labels |
| `labelSm` | Inter_600SemiBold | 12–13 / 1.0 | pills, small buttons |
| `caption` | Inter_400Regular | 11.5 / 1.6 | helper text |
| `meta` | Inter_500Medium | 10 / 1.0, letterSpacing 0.11em, uppercase | section eyebrows, status |

**Only Baloo2 (700/600) and Inter (400/500/600) are loaded via `expo-font`
in `App.tsx`.** The monospace text in the mockups is *annotation for this
handoff* and the small `meta` eyebrows — implement `meta` in
Inter_500Medium with letterSpacing, **not** a monospace face. Adding a mono
typeface would require a new `@expo-google-fonts/*` package and an
`App.tsx` load change; it is not proposed here.

`Baloo2_800ExtraBold` is used for the hero letter. If you don't want another
weight, use `Baloo2_700Bold` at the same size — the difference is small at 62px.

---

## The material system

Three styles, each with one job. This assignment is the whole design; if you
blur it, the screens get muddy.

### GLASS → panels

Every container that *holds* content. Never anything interactive.

- Sheer (default): fill `linear-gradient(150deg, rgba(255,255,255,0.13), rgba(255,255,255,0.035))`,
  1px border `rgba(255,255,255,0.16)`, blur 16, radius 20–22.
- Over video: same but border `rgba(255,255,255,0.22)`, fill 0.14 → 0.06, blur 18.
- Frosted: fill `rgba(255,255,255,0.58)` → `0.44`, dark text. Not used on
  these three screens (it belongs to auth + dashboards) but see the
  `GlassCard` change below.
- Panel drop shadow, where used: `0 10px 30px rgba(0,0,0,0.28)`.

**Required change:** unify the two existing tint strengths into one
`GlassCard` prop — `tint: 'sheer' | 'frosted'` (default `'sheer'`) — and
delete the inlined frosted pattern from the auth and dashboard screens. This
resolves gap #3 in the brief.

### NEUMORPHIC → controls

Anything you press or toggle. Raised = actionable. Inset = current state or a
value trough.

- Raised: `boxShadow: [{offsetX:5, offsetY:5, blurRadius:12, color:'#12151B'},
  {offsetX:-5, offsetY:-5, blurRadius:12, color:'#2E3644'}]` on fill `#232936`.
  Large raised elements (medallions, 118px tiles) go to 6–7px offset / 15–18 blur.
- Inset: same two shadows with `inset: true`, 3–5px offset, 7–12 blur, on
  fill `#1D222B` or `#20252F`.
- Pressed: swap raised → inset, and tint the label to `accentCoral`.

### SKEUOMORPHIC → hero objects

**Exactly one per screen**, and only where literalism does work:

1. **The camera panel** (both translator screens) — a device, not a video
   element: brushed housing gradient, `inset 0 1px 0 rgba(255,255,255,0.20)`
   top highlight, `0 18px 40px rgba(0,0,0,0.5)` cast shadow, a 26px top
   shelf with a real lens + status LED and a right-aligned "LCSIGN VISION"
   plate, and a 34px bottom shelf with FPS/model state and three vent marks.
   The feed sits in a 16px-radius recessed screen with
   `inset 0 0 0 1px rgba(0,0,0,0.6), inset 0 0 40px rgba(0,0,0,0.55)`.
2. **The confidence dial** (Letters) — an instrument gauge in an inset well.
3. **The record button** (Words) — a physical pushbutton with a 4px hard
   bottom edge.
4. **The handedness rocker** (Letters) — a two-position physical switch with
   a lit cap.

Nothing else in the app is skeuomorphic. Role Select has no hero object on
purpose.

---

## Screens / Views

### 1. Role Select — `src/screens/RoleSelectScreen.tsx`

**Purpose.** Entry point. Choose Student / Teacher / Admin, or skip auth
entirely and open the Translator.

**PROPOSAL (information hierarchy).** The Translator is no longer a 4th peer
card. It is demoted to a bordered ghost button below an "OR SKIP SIGN-IN"
rule, because "skip authentication" is a categorically different action from
"sign in as a role." This resolves the brief's Section 4.1 question. It needs
no routing change — same destination, different affordance.

**Desktop layout (1180 × 740).**

- Root: `GradientBackground variant="full"`, `flexDirection: 'row'`.
- Two ambient blob glows, absolutely positioned, behind everything:
  520×520 at `left:-120, top:280`, radial `rgba(124,108,245,0.30) → transparent 68%`;
  420×420 at `right:60, top:-140`, radial `rgba(242,178,62,0.16) → transparent 68%`.
  In RN these are `LinearGradient`/SVG radial fills at full opacity with a
  large `borderRadius`, not a CSS blur filter (see RN notes).
- **Left brand pane:** `width: 432`, padding `56 / 48`, right border
  1px `rgba(255,255,255,0.09)`, `justifyContent: 'space-between'`.
  - Logo lockup: 64×64 neumorphic tile, radius 20, containing a 34×34
    placeholder for `HandLandmarkMark`. **The hand mark is a placeholder in
    these mocks** — it has never had a brand pass (brief gap #5). Keep the
    existing `HandLandmarkMark` SVG at 34×34 inside the tile until a real
    mark exists. Beside it: "LCSign" at `h1`.
  - Headline: "Sign, and be understood." — `display`, hard line break after
    "be", `textPrimary`, marginBottom 18.
  - Sub: "Real-time American Sign Language interpretation for Liloan Central
    School." — `body`, `textSecondary`, maxWidth 300.
  - Footer: 1px rule, then "BSIT Capstone · Liloan, Misamis Occidental" at
    `meta` in `textTertiary`.
- **Right pane:** `flex: 1, minWidth: 0`, padding `56 / 52`,
  `justifyContent: 'center'`, `gap: 22`.
  - Eyebrow "SIGN IN AS" at `meta`.
  - Three role cards, `gap: 14`, each: sheer glass, radius 20, padding
    `22 / 24`, `flexDirection: 'row'`, `alignItems: 'center'`, `gap: 20`.
    - Border carries the role accent at 34% alpha **only on the focused /
      first card**; the others use `glassBorder`. (In the mock, Student is
      shown focused.)
    - Medallion: 54×54 neumorphic tile, radius 16, `flex: none`, containing a
      20×20 dot in the role accent with a `0 0 14px accent@0.6` glow.
    - Text block: `flex: 1, minWidth: 0`. Title at `h2`; description at
      `bodySm` in `rgba(255,255,255,0.60)`.
    - Continue button: pill, padding `11 / 16`, `labelSm`. **Student's is a
      solid `accentCoral` fill with `textOnAccent` label** and a
      `0 4px 12px accentCoral@0.28` glow (the focused row's primary action);
      Teacher's and Admin's are neumorphic raised with `textPrimary`.
  - Divider row: two 1px rules with "OR SKIP SIGN-IN" at `meta` in
    `textTertiary` between them, `gap: 16`.
  - Translator button: `alignSelf: 'flex-start'`, pill, transparent fill,
    1px `rgba(255,255,255,0.20)` border, padding `13 / 20`, `gap: 12`.
    Contents: 8×8 `success` dot with glow, "Open the Translator" at `label`,
    then "no account needed" at `bodySm` in `textTertiary`.

**Card copy (exact).**

- Student — "Practice signs, submit assignments, see your scores"
- Teacher — "Post assignments, grade submissions, call students"
- Administrator — "Manage accounts and classes"

**Mobile layout (390 × 844).** Single column. Status bar 52. Brand block
padding `26 / 22`: 56×56 logo tile (radius 18, 30×30 mark), "LCSign" at
`h1` 26px, sub at 14/1.6 maxWidth 250. Role cards at padding 18, radius 18,
44×44 medallions (16px dot), title `h2` 19px, description 12/1.4 truncated
("Practice, submit, see scores" / "Assignments, grading, calls" /
"Accounts and classes"). No Continue button on mobile — the whole card is the
target (min height 80, comfortably over 44). Bottom block pinned with
`marginTop: 'auto'`, padding `0 22 34`: divider row, then a full-width
52-high pill (centered label here, since it's a block button), then
"No account needed" centered at 11px `textTertiary`.

**States.** Card hover (web, `onHoverIn/onHoverOut`): raise the glass fill
0.10 → 0.13 and the border to the role accent at 34%. Pressed: scale 0.99.
Focus: 2px `focusRing` outline, offset 2.

---

### 2. Live Translator · Letters — `TranslatorHubScreen` + `LiveTranslatorScreen`

**Purpose.** Continuous single-frame fingerspelling recognition: live letter,
live confidence, accumulated word, spoken output. Web-only today; design for
a desktop browser first.

**Desktop layout (1180 × 740).**

- Root: `GradientBackground variant="subtle"` — gradient
  `155deg #1A1E26 → #20262F (60%) → #171A21`, `flexDirection: 'column'`.
- **Header, 66 high, `flex: none`:** padding `0 30`, bottom border 1px
  `rgba(255,255,255,0.09)`, a `180deg rgba(255,255,255,0.05) → 0.01` sheen.
  Three groups, `justifyContent: 'space-between'`:
  - Left: 34×34 neumorphic logo tile (radius 11, 17×17 mark) + "Translator" at `h3` 18px.
  - Center: **the Letters/Words pill switcher** — this is the hub's mode
    control, currently a plain pill. Track: padding 5, radius 999, fill
    `neuWell`, inset shadow `3/3/8 #12151B` + `-3/-3/8 #2A3140`. Active
    option: padding `9 / 26`, radius 999, fill `#252B38`, raised shadow,
    `textPrimary`. Inactive: same box, no fill, no shadow, `adminGray` label.
  - Right: language pill ("Cebuano ▾", neumorphic raised, padding `9 / 16`,
    `labelSm` in `textSecondary`) + a 36×36 circular neumorphic help button.
    The "▾" and "?" are placeholders — use `react-native-svg` chevron and
    help-circle icons.
- **Body:** `flexDirection: 'row'`, `gap: 26`, padding `26 / 30`,
  `flex: 1, minHeight: 0`.

- **Left column, `width: 352, flex: none`, `gap: 18`:**

  1. **Recognized panel** — sheer glass, radius 22, padding 24.
     - Eyebrow "RECOGNIZED".
     - Row, `gap: 22`: a **118×118 neumorphic tile** (radius 26, raised
       7/7/18) holding the current letter at `hero` 62px; beside it the
       **confidence dial**: 118×118 inset well (radius 999, inset 5/5/12),
       with a ring inset 9 drawn as a conic sweep — `success` from 220° for
       `pct × 360`, remainder `rgba(255,255,255,0.06)`, masked to a 63–64%
       radial donut. Center: "92%" at `h1` 27px (the "%" at 15px) over
       "CONFIDENCE" at `meta` 8.5px.
     - Divider 1px `rgba(255,255,255,0.10)`, then the **accumulated word**:
       "Reading:" at `bodySm` `textSecondary`, then per-letter tiles 26×32,
       radius 8 — already-committed letters **inset** (`#20252F`, inset
       2/2/6, label `adminGray`), the newest letter **raised** (`#252B38`,
       3/3/8 + -2/-2/6, label `accentCoral` 700). The physical state carries
       the recency; no color-only cue.
  2. **Signing-hand panel** — sheer glass, radius 22, padding `22 / 24`.
     - Header row: "SIGNING HAND" at `meta`; right-aligned "affects accuracy"
       at 10px `accentCoral`.
     - **The rocker:** 62 high, radius 16, housing
       `155deg #333A47 → #1A1E26`, `inset 0 1px 0 rgba(255,255,255,0.18)` +
       `0 5px 12px rgba(0,0,0,0.4)`, padding 6, two `flex: 1` halves with
       `gap: 6`. Active half: radius 12, cap `180deg #4A5261 → #333B49`,
       `0 3px 0 #222832` hard edge + `0 6px 10px rgba(0,0,0,0.45)` +
       `inset 0 1px 0 rgba(255,255,255,0.3)`, label `label` 700 in
       `textPrimary`, preceded by a 7×7 `success` LED with glow. Inactive
       half: no fill, label `#8A93A3` 600.
     - Reason line, `caption` `textSecondary`: "The model was trained
       right-hand dominant. Flip this and we mirror the landmarks for you."
     - This directly addresses the brief's "handedness toggle is easy to
       miss": it is now the second-largest object in the column, it is
       physically switch-shaped, and it states its own consequence.
  3. **Action row**, `marginTop: 'auto'`, `gap: 12`: "Speak it" —
     `flex: 1`, 52 high, pill, neumorphic raised, `label` — plus a 52×52
     circular neumorphic backspace (use an SVG delete icon, not "⌫").

- **Right: the camera device**, `flex: 1, minWidth: 0` — **`minWidth: 0` is
  mandatory.** RN Web flex items default to `min-width: auto` and a video
  panel in a row will refuse to shrink and push the layout off-screen; this
  was a real bug in the last session. Radius 26, padding 14, housing gradient
  `155deg #3C434F → #1A1E26 (55%) → #2B313D`,
  `inset 0 1px 0 rgba(255,255,255,0.20)` + `0 18px 40px rgba(0,0,0,0.5)`,
  `flexDirection: 'column'`.
  - Top shelf 26 high: left, an 11×11 lens (radial `#5B6478 → #0C0E12 70%`,
    `inset 0 0 0 1.5px rgba(255,255,255,0.16)`) + a 5×5 `success` LED with
    glow; right, "LCSIGN VISION" at `meta` 9px letterSpacing 0.14em in `textDim`.
  - Screen: `flex: 1, minHeight: 0`, radius 16, `overflow: 'hidden'`,
    recessed shadow as specified above. Feed placeholder: 135° 14px stripes
    `#22262E / #1C2028` — **replace with the real `<video>`/`getUserMedia`
    surface**; the striped fill and its "webcam feed / getUserMedia · 640×480"
    caption are placeholder-only. A `150deg rgba(255,255,255,0.09) → transparent 42%`
    glass sheen sits over the feed.
  - Overlays on the feed:
    - Detection box: 214×250 at `left:52, top:44`, 1.5px dashed
      `rgba(124,108,245,0.6)`, radius 14. RN has no `borderStyle: 'dashed'`
      with a radius on all platforms — draw it with `react-native-svg`
      (`strokeDasharray`).
    - Badge above it: "21 landmarks locked", padding `4 / 10`, radius 6,
      fill `rgba(124,108,245,0.9)`, 10px 600 white.
    - Landmark dots: `primaryTeal` 9–11px with a `0 0 10px` glow, wrist point
      `accentCoral` 13px. In production these are the real 21 MediaPipe
      points drawn on the existing canvas/SVG overlay — the four dots in the
      mock are indicative placement only.
    - Caption bar: bottom 24, left/right 26, glass-over-video, radius 16,
      padding `14 / 20`. Left: the translated string at `h2` 22px white,
      in curly quotes. Right: "translated · Cebuano ready" at 11px
      `rgba(255,255,255,0.66)`.
  - Bottom shelf 34 high: "30 FPS · MODEL READY" at `meta` 9.5px `textDim`;
    right, three 22×3 vent marks at `rgba(255,255,255,0.16)`.

**Mobile layout (390 × 844).** Column, camera on top, controls below.

- Status bar 52. Title row padding `8 / 20 / 16`: "Letters" at `h2` 20px,
  and the pill switcher shrunk (padding `7 / 16`, `labelSm` 12px, track
  padding 4).
- Camera device: `margin: 0 16`, radius 22, padding 10, screen height 340,
  radius 15. Same housing and overlays at reduced scale (detection box
  158×196 at `left:96, top:56`; caption bar inset 14, radius 14, translated
  string at 18px, right label "Cebuano" at 9.5px). Bottom shelf 26 high:
  "30 FPS · READY" + a single `success` LED.
- Below, padding 16, `gap: 14`:
  - Recognized panel collapsed to one glass row (radius 20, padding 18,
    `gap: 18`): 80×80 letter tile (radius 22, `hero` 44px), 80×80 dial
    ("92%" 20px, "CONF." 7px), then the reading strip (label 11px + three
    20×26 tiles, radius 6).
  - Signing-hand row: glass, radius 20, padding `14 / 16`. Left text block
    `flex: 1`: "Signing hand" at `labelSm` 13px, "Left-handed? Flip it."
    at 10.5px `textSecondary`. Right: the rocker at 132×48, radius 14,
    padding 5, caps radius 10, labels 12px. The long reason line is dropped
    on mobile; put it behind the header help button.
  - Action row `marginTop: 'auto'`, `gap: 12`: "Speak it" `flex: 1` at 56
    high, plus a 56×56 backspace. **56 ≥ 44 hit target — do not shrink these.**

**Behavior.** Live prediction updates continuously; the letter tile and the
dial are the only things that change per frame. Animate the dial sweep with
`Animated.timing` at 180ms `ease-out` and cross-fade the letter over 120ms
— do not animate the tile's shadow (expensive, and it reads as flicker).
Committing a letter to the word strip: the new tile animates inset → raised
over 160ms while the previous newest goes raised → inset.

---

### 3. Word Translator — `WordTranslatorScreen`

**Purpose.** Record a clip → classify → ranked top-5 word predictions →
auto-translate and speak in the chosen language.

**Desktop layout (1180 × 740).** Same shell as Letters — identical header,
with "Words" active in the switcher, and the same two-pane 26-gap body. Keeps
the wide-camera split from the recent rework.

- **Left column, `width: 398, flex: none, minWidth: 0`, `gap: 18`:**

  1. **Top-matches panel** — sheer glass, radius 22, padding 24.
     - Header: "TOP MATCHES" at `meta`; right, "45 frames" at 10px `textTertiary`.
     - **Rank 1 is promoted onto a raised neumorphic slab** (radius 18,
       padding 18, raised 6/6/15, marginBottom 16) — hierarchy is physical,
       not just typographic:
       - Row: word at `h1` 32px `textPrimary`; percentage at `h3` 20px in `success`.
       - Bar: 12 high, radius 999, inset trough (`neuWell`, inset 3/3/7 +
         -2/-2/5), fill `90deg #2E9A58 → #3FB56A` with a
         `0 0 10px success@0.55` glow, width = confidence.
       - Footer row: 6×6 `success` dot + "Salamat · spoken in Cebuano" at
         11px `textSecondary`.
     - **Ranks 2–5**, `gap: 13`, each: label row (word at `label` 15px +
       percentage at `labelSm` 12px) over a 8-high inset trough with a
       `primaryTeal` fill. Ranks 4–5 drop to `#8F98A6` labels and
       `primaryTealDark` fills so the tail visibly recedes.
     - **This replaces the plain "word + confidence %" text rows** (brief
       section 4.4). Widths come straight from the model's softmax output —
       no rescaling; a 2% bar should look like 2%.
  2. **Recording panel**, `marginTop: 'auto'` — sheer glass, radius 22,
     padding `18 / 20`, row, `gap: 16`.
     - **The record button:** 76×76 outer bezel, radius 999, fill
       `160deg #3A414F → #1A1E26`, `0 6px 14px rgba(0,0,0,0.5)` +
       `inset 0 1px 0 rgba(255,255,255,0.2)`. Inner cap 56×56, radius 999,
       `180deg #E0525F → #A8303C`, `0 4px 0 #7A1F29` hard edge +
       `0 8px 14px needsPractice@0.35` + `inset 0 1px 0 rgba(255,255,255,0.35)`.
       Glyph: an 18×18 radius-5 white square (stop) while recording; a
       filled circle when idle.
     - Text block `flex: 1, minWidth: 0`: "Recording" at `h3` 17px;
       "Hold the sign steady. Tap again to classify." at `bodySm`
       `textSecondary`; then a **12-bar frame meter**, 18 high, `gap: 3`,
       bars `flex: 1` radius 2, heights 30–100%, colored `#3F4655 / #4B5364 /
       #5B647A` with the current frame in `needsPractice` and one
       `primaryTeal` marker. This is the redesigned "red dot + frame count"
       feedback.
- **Right: the camera device** — identical construction to Letters, with:
  - Top-shelf LED in `needsPractice` (recording) instead of `success`.
  - **REC pill**, top-left of the feed at 22/20: glass-over-video tinted
    `150deg rgba(224,82,95,0.30) → 0.14`, 1px `rgba(224,82,95,0.5)` border,
    radius 999, padding `8 / 14`, `gap: 9` — a 9×9 `needsPractice` dot with
    glow, "REC" at `labelSm` white, "45 / 60 frames" at 11px
    `rgba(255,255,255,0.72)`.
  - **"RIGHT HAND" plate**, top-right, glass-over-video, radius 999,
    `meta` 11px `rgba(255,255,255,0.8)` — mirrors the Letters rocker state
    so the setting is visible on both screens.
  - **Translation bar**, bottom 26 / sides 26: glass-over-video, radius 18,
    padding `16 / 22`, row `gap: 18`. Left `flex: 1, minWidth: 0`:
    "TRANSLATION" at `meta` 9.5px over the translated word at `h1` 26px
    white. Right: a **solid `accentCoral` Speak pill** (padding `11 / 18`,
    `textOnAccent` label, `0 4px 12px accentCoral@0.3`) — the one saturated
    fill on the screen, and the primary action.
  - Bottom shelf: "CLASSIFYING · 45 FRAMES BUFFERED" + three vent marks.

**Mobile layout (390 × 844).** Same structure as the Letters mobile screen:
status bar, title row with switcher ("Words" active), camera device
(`margin: 0 16`, radius 22, padding 10, screen 282 high) with the REC pill at
12/12 (compressed to "REC" + "45/60") and a translation bar at inset 12
(radius 14, word at 20px, Speak reduced to a single `accentCoral` icon pill).
Below, padding 16 `gap: 14`: the top-matches panel (radius 20, padding 18;
rank-1 slab radius 16 padding 14, word 26px, pct 17px, bar 11 high; ranks 2–4
only — **drop rank 5 on mobile**), then the record row pinned with
`marginTop: 'auto'`: an 88×88 bezel with a 66×66 cap and a 9-bar frame meter.

**Behavior.**
- Idle → recording: cap translateY 0 → 2 and hard edge 4px → 2px over 90ms
  (`Animated`), then hold. Recording → classifying: cap returns, glyph
  cross-fades circle ↔ square.
- Frame meter advances one bar per captured frame, no easing — it is a counter.
- On a new classification: animate **bar widths only**, 260ms `ease-out`,
  staggered 40ms down the ranks. Do not animate the row order, the words, or
  the percentages counting up. The brief asks how much to animate for a
  classroom demo — this is the answer: the list is positionally stable so a
  teacher can point at it, and only the quantity moves.
- `prefers-reduced-motion` (web) / `AccessibilityInfo.isReduceMotionEnabled`
  (native): skip the width transition and the dial sweep, set final values
  directly.

---

## State Management

No new state beyond what the screens already hold. What the redesign reads:

- **Role Select** — `hoveredRole` / `focusedRole` (drives the accent border
  and which Continue is filled). No new data.
- **Letters** — `currentLetter`, `confidence` (0–1, drives the dial sweep),
  `accumulatedWord` (drives the tile strip; the last index renders raised),
  `signingHand: 'left' | 'right'`, `targetLanguage`, `modelReady`, `fps`.
- **Words** — `isRecording`, `frameCount` / `frameTarget` (45 / 60 in the
  mock), `predictions: {word, confidence}[]` (top 5, sorted desc),
  `translation`, `isSpeaking`, `signingHand` (read-only mirror for the plate).

**Not designed here (out of scope, flagged):** empty, loading and error states
(brief gap #8) and first-run onboarding (gap #9). The mocks show the happy
path only. Loading and error treatments for these screens should be a
follow-up — implementing them from the existing plain-text lines is fine for
now, but do not invent a new visual pattern for them.

---

## RN implementation notes

The mocks are HTML, so a few techniques need a translation. In priority order:

1. **`minWidth: 0` on every camera pane** in a row layout. RN Web's
   `min-width: auto` default will push the panel off-screen otherwise. Also
   on the two-pane bodies' text columns.
2. **Double shadows.** RN 0.81+ (Expo SDK 56) supports `boxShadow` as an
   array of shadow objects, and `inset: true`, on web, iOS and Android. Add
   `neuRaised(size)` and `neuInset(size)` helpers to `src/theme/shadows.ts`
   and use them everywhere rather than inlining. If a target platform in your
   build ever lacks array support, degrade to the single dark shadow plus a
   1px `rgba(255,255,255,0.06)` top border — never to a flat fill.
3. **Gradients** — `expo-linear-gradient` for all the linear fills
   (housings, glass tints, bar fills, sheens).
4. **Conic gradient (the confidence dial)** has no RN equivalent. Draw it in
   `react-native-svg`: a `<Circle>` with `strokeDasharray` /
   `strokeDashoffset` and `transform="rotate(-140)"` for the 220° start,
   `strokeLinecap="butt"`. Same for the ring's unfilled remainder.
5. **Radial gradients** (lens, blob glows) — `react-native-svg`
   `<RadialGradient>`.
6. **`filter: blur()`** (used on the Role Select blobs) does not exist in RN.
   Bake the softness into the radial gradient's stops instead — the mock's
   blur is compensating for a hard stop; an SVG radial with a
   `transparent 68%` outer stop needs no blur.
7. **Backdrop blur** — `expo-blur`'s `BlurView`, `intensity` ≈ 16–18 mapped
   to the mock's blur radius, `tint="light"` with the tint overlay on top.
   Keep `overflow: 'hidden'` on the rounded container.
8. **Masked donut** (`mask: radial-gradient(...)`) — not needed once the dial
   is an SVG stroke.
9. **`text-wrap: pretty`** — no RN equivalent; ignore.
10. **Hover** — `onHoverIn` / `onHoverOut` on `Pressable`, web only.
11. **Glyph placeholders.** "▾", "?", "⌫", "▶", "▮▮▮ ⌁" in the mocks are
    stand-ins. Use `react-native-svg` icons (chevron-down, help-circle,
    delete, play). The mobile status bars are mock chrome — the real app uses
    `expo-status-bar` / `SafeAreaView`.

## Accessibility

The brief ranks an accessibility audit above visual polish (gap #1), and this
pass is visual only — it does not discharge that. What it does do, and what
still needs checking:

- Every state cue is doubled: the word-strip tiles use raised/inset **and**
  color; the rocker uses position, an LED **and** a label; prediction rank
  uses elevation, bar length **and** a number. No color-only signal was
  introduced.
- Contrast to verify against WCAG (not yet measured): `textSecondary`
  #98A1B2 on the ground (~5.6:1, should pass AA body), `textTertiary`
  #5F6878 on ground (~2.6:1 — **fails for body text**; keep it to 10–11px
  meta only, or lighten it), `textDim` #6E7788 inside the device housing,
  and white text on glass-over-video, which depends on the live video behind
  it — the 0.14 tint is the floor, do not go sheerer on the caption bars.
- Hit targets: mobile action buttons are 56, role cards ~80 high, rocker
  halves 61×38 (**below 44 in height — increase to 48 if the row can grow**).
- Still owed: screen-reader labels on the rocker and the record button
  (`accessibilityRole="switch"` / `"button"` with state), keyboard
  navigation order on the desktop translator, and reduced-motion handling
  (specified above but untested).

## Assets

No new assets. Everything is drawn from tokens, gradients and shadows.

- `HandLandmarkMark` — reuse the existing hand-skeleton SVG. **In the mocks
  it is a striped placeholder**: the brief flags it as never having had a
  brand pass and the highest-leverage brand work available. Do not treat the
  placeholder as a design.
- Webcam feeds — the striped fills labelled "webcam feed" are placeholders
  for the existing `getUserMedia` `<video>` surface.
- Landmark dots — indicative; the real overlay draws 21 MediaPipe points.
- Icons — Lucide equivalents via `react-native-svg`.
- No photography, no illustration, no Lottie.

## Files

- `KamustaSign Mockups.dc.html` — the mockups. Opens in any browser. Four
  option blocks: **1a** the palette and material system, **1b** Role Select,
  **1c** Live Translator (Letters), **1d** Word Translator. Each screen block
  holds the 1180-wide desktop mock and the 390-wide mobile mock side by side,
  with a note under it explaining the intent.
- `KamustaSign_UI_Design_Brief.md` — the source brief this was built from
  (screen inventory, current tokens, known gaps, open questions).

Authoritative on the current implementation, and not in this bundle:
`src/theme/theme.ts`, `src/theme/shadows.ts`, `src/theme/responsive.ts`,
`src/components/GradientBackground.tsx`, `src/components/GlassCard.tsx`.

## Open questions carried forward

Answered by these mocks (as proposals, flag if you disagree):

- Role Select's 4th card → demoted to a ghost button under a rule.
- Palette → Graphite Aurora proposed over Violet Dusk, values-only diff.
- Prediction animation for a classroom → widths only, stable order.

Still open, and not addressed here:

- Does Video Call join this visual language or stay a dark "call mode"?
- Does the product need a light mode for bright classrooms and projectors?
- Dashboards were not part of this pass — they remain the most repetitive
  part of the app (brief gap #4).
