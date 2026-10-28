# Handoff: LCSign — classroom home redesign, Back button, light/dark mode and colour schemes

**For:** Claude Code, working in the LCSign repo.

**Scope:**
1. Redesign the student classroom home (`StudentDashboard.tsx`) so it's calmer and easier to scan.
2. Add a **Back** button to every screen.
3. Make **light / dark / match device** work on every screen and every width (today light mode is phone-only).
4. Add **four colour schemes** the user can pick: Graphite Aurora (current), Ocean, Forest, Sunset. Each has a light and a dark palette.
5. Apply all of this to the **Teacher** and **Admin** dashboards. Their layouts stay as in `design_handoff_teacher_admin_videocall/`.

**Files in this folder:**
- `LCSign Classroom Theming Mockups.html`: the design reference. Open it in Chrome. Red pins match the notes under each frame.
- `README.md`: this file.

**Frames:**

| Block | What |
|---|---|
| H1–H3 | Classroom home: dark, light, and "all letters learned" (desktop 1440×900) |
| H4 | Appearance panel (desktop popover) |
| H5 | The same screen in all 8 palettes |
| H6 | Phone 390×844: home in three palettes + Appearance sheet |
| B1 | Where Back goes on each screen |
| TA1–TA5 | Teacher Today and Admin Accounts in four palettes, desktop + phone |
| P | Palette sheet |

**Constraints still in force:** `StyleSheet.create` only. Baloo2 700/600 and Inter 400/500/600 only. Spacing 4/8/16/24/32/48 and radii 8/16/24/999. RN `Animated` only, and reduced motion is respected. No colour-only state.

---

## 1. Theme model

Today `ThemeProvider` has `name: "dark" | "light"` and forces dark on desktop/tablet. Change it to **two independent choices**:

```ts
type ThemeMode = "system" | "light" | "dark";              // existing ThemePreference
type SchemeName = "graphite" | "ocean" | "forest" | "sunset";

type Theme = {
  mode: ThemeMode;          // what the user picked
  name: "light" | "dark";   // resolved (system -> useColorScheme())
  scheme: SchemeName;
  colors: ThemeColors;      // palettes[scheme][name]
  shadows: Shadows;         // makeShadows(name) - unchanged geometry
  setMode(m: ThemeMode): void;
  setScheme(s: SchemeName): void;
};
```

- **Desktop and tablet stop being forced dark.** Remove the `isMobile ? wanted : "dark"` line. Keep `isMobile` on the context for layout only.
- **Storage:** keep `kamustasign.themePreference` for the mode and add `kamustasign.colorScheme` (default `"graphite"`). Both live in `AsyncStorage`, per device. Saving them to the profile is a PROPOSAL (§7).
- **First paint:** read both keys before the first render, holding the splash for this (or render with defaults and swap). This avoids a dark→light flash on the web.
- **`palettes`** becomes `Record<SchemeName, Record<"light"|"dark", ThemeColors>>`. `palettes.graphite.dark` is today's `darkColors`, unchanged, and `palettes.graphite.light` is today's `lightColors`. **Every existing token name keeps working.** The other three schemes only override the role colours and the ground (§2.2). Everything else derives from them.
- **Migration:** a screen that still imports the static `colors` from `theme.ts` stays Graphite dark. Move every screen to `useTheme()` / `useThemedStyles()`:
  - dashboards (Student, Teacher*, Admin, AccountPanel, Overlays)
  - Practice
  - Translator hub, Letters, Words, Signer
  - auth screens, RoleSelect
  - the video-call chrome
  
  `grep -rn "from \"../../theme/theme\"" src | grep colors` lists them. Do it one screen at a time. Graphite dark must stay pixel-identical.
- **Never themed:** camera / video / Signer bezels (`cameraBezel`, `onCamera`, `cameraScrim`) stay near-black in every scheme and mode, and so do the device housings from the material pass. The skeuomorphic hero objects stay their material colours.

## 2. Tokens

### 2.1 Role → token mapping (what a scheme changes)

| Meaning | Existing token(s) | Follows the scheme? |
|---|---|---|
| Teacher accent, main actions, selected tabs | `primaryTeal`, `primaryTealDark`, `primaryTealLight`, `primaryTealText` | **yes** → `primary`, `primaryFill`, `primaryText` |
| Student accent, Next up, due-soon, attention | `accentCoral`, `accentCoralDark`, `accentCoralText`, `textOnAccent`/`onAccent` | **yes** → `accent`, `accentText`, `onAccent` |
| Admin accent | `adminGray`, `adminGrayLight` | no: neutral in every scheme (`textSecondary`) |
| Learned / correct | `success`, `successText`, `masteredRing` | **no**: the same green in every scheme |
| Needs practice / danger | `needsPractice`, `needsPracticeText`, `callDanger` | **no** |
| Stars | `starFilled`, `starEmpty`, `starResting` | **no**: gold. Light mode uses the darker `#B57B0A` so stars keep 3:1 on white |
| Ground, cards, wells, borders, text | `background`, `gradient*`, `surface*`, `neu*`, `border`, `text*`, `glass*` | **yes**: a slight tint per scheme |
| Focus ring | `focusRing` | yes (picked per palette for ≥ 3:1) |

So `primaryTeal` keeps its name and simply holds the scheme's primary. `ROLE_COLORS` in `ManageKit.tsx` must read from `useTheme().colors` instead of the static import.

### 2.2 New semantic names (add alongside the existing ones)

| New | Meaning | Graphite value (dark / light) |
|---|---|---|
| `primary` | brand hue for marks, rings, bars | `#7C6CF5` / `#6352E6` (= `primaryTeal`) |
| `primaryFill` | button fill; white label ≥ 4.5:1 | `#5A50A8` / `#5A49D6` |
| `primaryText` | primary as text/icon on ground/cards | `#B3A8FF` / `#4F3FC4` (= `primaryTealText`) |
| `accent` | student accent fill | `#F2B23E` (= `accentCoral`) |
| `accentText` | accent as text, rings on light | `#F2B23E` / `#8A5A00` |
| `surfaceRaised` | raised tiles and buttons | `#2C3340` / `#FFFFFF` |
| `star`, `starEmpty` | stars (not scheme-driven) | `#F2B23E` / `#B57B0A`; `#7D8799` / `#8A93A6` |

### 2.3 Palettes

All 8 palettes pass these checks, verified with a script:
- every text token (`textPrimary`, `textSecondary`, `textTertiary`, `primaryText`, `accentText`, `successText`, `dangerText`) is ≥ 4.5:1 on `background`, `surface` and `well`
- `onPrimary` on `primaryFill`, `onAccent` on `accent`, and `onStatus` on `successText` are each ≥ 4.5:1
- `primary`, `star`, `starEmpty`, `success`, `danger` and `focusRing` are each ≥ 3:1 on `surface`

The light-mode text tokens are slightly darker than today's phone light palette (`textSecondary` `#454D60`, `textTertiary` `#5A6276`) so they pass on `well` as well.

#### Dark

| Token | Graphite Aurora | Ocean | Forest | Sunset |
|---|---|---|---|---|
| `background` | `#1A1E26` | `#111A24` | `#131B18` | `#1E1820` |
| `backgroundEnd` | `#171A21` | `#0E151E` | `#101714` | `#19141B` |
| `surface` | `#252B37` | `#1A2634` | `#1D2823` | `#2A222D` |
| `surfaceRaised` | `#2C3340` | `#20303F` | `#24312B` | `#322938` |
| `well` | `#1D222B` | `#132030` | `#16201C` | `#211A24` |
| `border` | `#343B49` | `#2A3A4C` | `#2C3A33` | `#3C3141` |
| `textPrimary` | `#EDEFF4` | `#EDEFF4` | `#EDEFF4` | `#EDEFF4` |
| `textSecondary` | `#B0B8C8` | `#B0B8C8` | `#B0B8C8` | `#B0B8C8` |
| `textTertiary` | `#949DB0` | `#949DB0` | `#949DB0` | `#949DB0` |
| `primary` | `#7C6CF5` | `#4C9AFF` | `#4DB08F` | `#E07AAE` |
| `primaryFill` | `#5A50A8` | `#2563C9` | `#23735C` | `#A8407A` |
| `primaryText` | `#B3A8FF` | `#8CC0FF` | `#86D4B8` | `#F3A8CC` |
| `onPrimary` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `accent` | `#F2B23E` | `#2EC4B6` | `#E8A33D` | `#F5A65B` |
| `accentText` | `#F2B23E` | `#5FE0D3` | `#F0B45A` | `#F7B57A` |
| `onAccent` | `#2A1E05` | `#04221E` | `#2A1B03` | `#2E1704` |
| `success` | `#3FB56A` | `#3FB56A` | `#3FB56A` | `#3FB56A` |
| `successText` | `#5FD08A` | `#5FD08A` | `#5FD08A` | `#5FD08A` |
| `danger` | `#E0525F` | `#E0525F` | `#E0525F` | `#E0525F` |
| `dangerText` | `#FF7A85` | `#FF7A85` | `#FF7A85` | `#FF7A85` |
| `onStatus` | `#12151B` | `#12151B` | `#12151B` | `#12151B` |
| `star` | `#F2B23E` | `#F2B23E` | `#F2B23E` | `#F2B23E` |
| `starEmpty` | `#7D8799` | `#7D8799` | `#7D8799` | `#7D8799` |
| `focusRing` | `#F2B23E` | `#5FE0D3` | `#F0B45A` | `#F7B57A` |

#### Light

| Token | Graphite Aurora | Ocean | Forest | Sunset |
|---|---|---|---|---|
| `background` | `#EEF1F6` | `#EDF3F9` | `#EEF3EF` | `#F7F0F1` |
| `backgroundEnd` | `#E7EBF2` | `#E5EDF6` | `#E6EDE8` | `#F1E7E9` |
| `surface` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `surfaceRaised` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `well` | `#E6E9F1` | `#E1EAF3` | `#E1EAE4` | `#F0E4E7` |
| `border` | `#D5DAE5` | `#CFDCEA` | `#CEDCD3` | `#E3D2D7` |
| `textPrimary` | `#1B1F2A` | `#1B1F2A` | `#1B1F2A` | `#1B1F2A` |
| `textSecondary` | `#454D60` | `#454D60` | `#454D60` | `#454D60` |
| `textTertiary` | `#5A6276` | `#5A6276` | `#5A6276` | `#5A6276` |
| `primary` | `#6352E6` | `#2563C9` | `#1F7A60` | `#B03A78` |
| `primaryFill` | `#5A49D6` | `#2563C9` | `#1F7A60` | `#A8376F` |
| `primaryText` | `#4F3FC4` | `#1D53AD` | `#1A6A53` | `#962F64` |
| `onPrimary` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `accent` | `#F2B23E` | `#14A698` | `#E8A33D` | `#F5A65B` |
| `accentText` | `#8A5A00` | `#0B6F65` | `#8A5300` | `#99500B` |
| `onAccent` | `#3A2A00` | `#022420` | `#2A1B03` | `#2E1704` |
| `success` | `#237F48` | `#237F48` | `#237F48` | `#237F48` |
| `successText` | `#1B713D` | `#1B713D` | `#1B713D` | `#1B713D` |
| `danger` | `#C73A4C` | `#C73A4C` | `#C73A4C` | `#C73A4C` |
| `dangerText` | `#B3303D` | `#B3303D` | `#B3303D` | `#B3303D` |
| `onStatus` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `star` | `#B57B0A` | `#B57B0A` | `#B57B0A` | `#B57B0A` |
| `starEmpty` | `#8A93A6` | `#8A93A6` | `#8A93A6` | `#8A93A6` |
| `focusRing` | `#4F3FD0` | `#1D53AD` | `#1A6A53` | `#962F64` |

Shadows don't change per scheme. Dark uses today's `neuRaised` / `neuInset`. Light uses the light geometry already in `shadows.ts`: a cool far shadow, a white near highlight and a 1px `border` ring. In light mode `GlassCard` is opaque: `surface` + `border` + the `card` shadow, as in the phone handoff.

---

## 3. Classroom home (student) — `StudentDashboard.tsx`

**Why:** in today's screen every one of the 26 tiles has a bright green border, a check badge on the border and gold stars, so the borders are what you see first. The Call button is a 1,800px gold bar. The hero, call card, tabs and grid all have the same weight.

**Desktop (≥ 1100), H1:** content max-width 1200, padding 24, gap 16.

1. **Hero card** (flex 1):
   - left: "Hi, {first}!" (`kidHeadline` 30), "{n} signs learned" + overall `ProgressBar` (accent), and per-group chips "ASL Letters **21/26**" on `well`
   - a 1px divider
   - right: **Next up** (meta label, group · sign, an accent `KidButton` "Practise {sign} →", and a 96px raised slab with the sign)
2. **Call your teacher** card, 330 wide: avatar, name, presence (dot + word), and a 44px primary **Call** button. The busy label is unchanged: "Call (they're on a call)". No teacher yet: "Your class doesn't have a teacher yet."
3. **From your teacher:** `ModuleStrip` as equal-width cards with a title, "ASL Words · 1 of 7 learned", a small bar and a due chip, or a **Done** chip with a check.
4. **Learn card:**
   - one row: `SegmentedToggle` ASL|FSL, then `CurriculumTabs` with **counts inside the tabs** ("Letters 21/26", "Numbers SOON", "Words 34/80"), then a two-item legend on the right
   - below it, "21 of 26 letters learned" + a `ProgressBar` (success)
   - then the tile grid: 13 per row at 76×84, gap 12/9
5. **`SignTile` restyle**. No coloured border on learned tiles any more:
   - **learned:** `surfaceRaised` + `neuRaised('sm')`, an 18px `success` check **inside** the top-right corner, and stars
   - **tried:** raised + stars, no check
   - **not yet:** transparent, 1.5px dashed `border`, the letter in `textTertiary`, and "not yet"
   - **next:** raised, a 2.5px ring in `accentText`, and a "NEXT" pill (`accent` fill, `onAccent` text)
   
   Accessibility labels don't change.
6. **Group complete (H3):** the bar row becomes a `well` banner with a check: "All 26 letters learned. Great work!", "Practise any letter again to earn more stars.", and a **Go to Words →** button.

**Phone (< 768), H6:** the same order in one column. Hero + Next up are one card, then the call card as a row, the tabs, and tiles at 58px, 5 per row (≥ 48 for children). Back, Appearance and the account are 44px icon buttons in the header.

**Loading / error / no class:** keep today's copy ("Getting your signs…", "We couldn't load your signs" + Try again, `JoinClassCard`), shown inside the Learn card's area.

## 4. Header: Back, Appearance and account (all roles)

`DashboardShell` header, left to right:

1. **Back** pill (new)
2. the LCSign mark + wordmark in `primaryText`. It's no longer the only way back.
3. a spacer
4. the **Appearance** button: mode icon (sun/moon) + palette icon + the word "Appearance"; icon-only on phone
5. the **account chip**: avatar, name, role (role label coloured by role: primary / accent / neutral), and a chevron. It opens a menu with **Your account** (the existing `AccountPanel`) and **Sign out**.

The gear icon and the separate Sign out button go away.

### 4.1 Back button rules (B1)

| Screen | Label | Goes to |
|---|---|---|
| Student classroom home | Back | Start screen (role picker), still signed in (= today's logo tap) |
| Practice | My signs | Classroom home. Stops the camera/reader first |
| Teacher: Today / Students / What they learn / Progress | Back | Start screen. Rail sections are tabs, so Back doesn't walk through them |
| Teacher: student detail (phone page) | Students | Students (desktop: a drawer with ✕ Close) |
| Teacher: plan or module with unsaved changes | Back | Asks first (`ConfirmInline` in the save bar): "Leave without saving? Your changes to the {language} plan will be lost." [Keep editing] [Leave] |
| Admin: Accounts | Back | Start screen. The account drawer uses ✕ Close |
| Translator hub / Signer | Back | Wherever it was opened from (start screen or dashboard) |
| Auth screens | Back | Start screen |
| Video call | — | No Back during a call. **Leave** is the way out. Browser/Android back asks "Leave the call?" |

New `components/BackButton.tsx`: `{ label = "Back", onPress, accessibilityLabel }`. A 44px pill: `surfaceRaised` + `neuRaised('sm')`, a chevron icon + label, and the focus ring on web. The phone variant is icon-only, 44×44, with `accessibilityLabel` "Back to {destination}". `DashboardShell` gets `onBack` and `backLabel`, and wires the Android `BackHandler` and web `popstate` to the same handler.

## 5. Appearance panel (H4, H6)

New `components/AppearancePanel.tsx`, opened from the header button. On desktop it's an anchored popover (RN `Modal`, transparent, light scrim). On phone it's a bottom sheet.

- **Mode:** a 3-option `SegmentedToggle` (Light · Dark · Match device) with a sun/moon/monitor icon on each option.
- **Colour scheme:** a 2×2 radio group of preview cards. Each draws a mini screen from that scheme's palette for the **current** mode: ground, a card bar, primary pill, accent pill and success dot. The name goes underneath. Selected = a 2.5px `primaryText` ring **and** a check badge.
- **Note text:** "Changes every screen on this device straight away. Ticks, stars and warnings keep the same meaning in every scheme."
- **Reset:** "Reset to default" restores Match device + Graphite Aurora.
- **When changes apply:** immediately, with no Save button. Theme swaps don't animate (no cross-fade).
- **Accessibility:** `accessibilityRole="radiogroup"` on each group and `radio` + `checked` on items. Keyboard: Tab between groups, arrow keys within, Esc closes.
- Replaces `ThemeToggle` (phone-only today). Remove it or have it open this panel.

## 6. Teacher and Admin (TA1–TA5)

Same layouts as the Teacher/Admin handoff. Changes:

- **Header:** the new Back + Appearance + account chip (§4).
- **Colours from the theme:** every colour comes from `useTheme().colors`.
  - Teacher: the rail's active item, filled buttons (`primaryFill`) and bars (`primary`) follow the scheme.
  - "Needs you" icons: `accentText` (missed call, stuck signs), `dangerText` (under 25%), `primaryText` (due), `successText` (waiting).
  - Count badges: `accent` fill + `onAccent`.
- **Admin stays neutral:** role badges are outlined text in `primaryText` (Teacher), `accentText` (Student) and `textSecondary` (Admin). The approvals inbox is marked with a 2px `accentText` ring + icon + count. **Approve teacher** uses `primaryFill`.
- **Video call:** the chrome (top bar, drawer, control bar, end screens) follows the theme. The stage, PiP and caption strip stay on `cameraBezel` / `captionScrim` in every mode. `callDanger` (Leave) and `callAccept` don't change with the scheme.

## 7. Component change list (RN)

| Component | Change |
|---|---|
| `theme/theme.ts` | `palettes[scheme][mode]`. Add the new semantic keys (§2.2) to every palette. Keep every existing key. |
| `theme/ThemeProvider.tsx` | `mode` + `scheme`, both persisted. No desktop dark lock. `setMode`, `setScheme`. Load before first paint. |
| `theme/shadows.ts` | Unchanged geometry. `makeShadows(name)` already covers light and dark. |
| `GradientBackground` | Gradient from `background` → `backgroundEnd` of the current palette. |
| `GlassCard` | Dark: sheer as today. Light: opaque `surface` + `border` + card shadow. Use `surfaceRaised` where `neuBase` was used. |
| `DashboardShell` | `onBack`, `backLabel`, the Appearance button and the account chip menu. Remove the gear + Sign out buttons. Every colour is themed. |
| `BackButton` (new) | §4.1 |
| `AppearancePanel` (new) | §5 |
| `ThemeToggle` | Removed (or reduced to opening `AppearancePanel`). |
| `SignTile` | New learned / tried / not-yet / next styles (§3.5). The star size prop is unchanged. |
| `Stars` | Read `star` / `starEmpty` from the theme. |
| `ModuleStrip` | Equal-width cards, a Done chip. |
| `CurriculumTabs` | Optional `counts` rendered inside each tab. |
| `ProgressBar` | `tone: 'primary' \| 'accent' \| 'success'`, all from the theme. |
| `KidButton`, `ActionButton` | Fills from `primaryFill` / `accent`; labels from `onPrimary` / `onAccent`. |
| `ManageKit.ROLE_COLORS` | A function of `colors`: teacher = `primaryText`, student = `accentText`, admin = `textSecondary`. |
| `StudentDashboard` | §3 layout. |
| `TeacherRail`, `TeacherToday`, `TeacherStudents`, `TeacherLearn`, `TeacherProgress`, `StudentDetailDrawer`, `AdminDashboard`, `AccountPanel`, `Overlays` | Move to `useThemedStyles`. No layout change. |
| `VideoCallScreen` | The chrome moves to the theme. Bezels stay fixed. |
| `RoleSelectScreen`, auth screens, translator screens | Move to `useThemedStyles` (the camera devices stay material-coloured). |

## 8. Copy (new or changed)

| Key | Text |
|---|---|
| header.back | Back |
| header.back.a11y | Back to the start screen / Back to {destination} |
| header.appearance | Appearance |
| header.appearance.a11y | Appearance: {Light/Dark} mode, {Scheme} colours |
| account.menu | Your account · Sign out |
| appearance.title | Appearance |
| appearance.mode | Mode: Light · Dark · Match device |
| appearance.scheme | Colour scheme: Graphite Aurora · Ocean · Forest · Sunset |
| appearance.note | Changes every screen on this device straight away. Ticks, stars and warnings keep the same meaning in every scheme. |
| appearance.reset | Reset to default |
| home.greeting | Hi, {first}! |
| home.total | {n} signs learned |
| home.next | Next up · {group} · {sign} · Practise {sign} |
| home.call.title | Call your teacher |
| home.call.button | Call · Call (they're on a call) |
| home.fromTeacher | From your teacher |
| home.module.done | Done |
| home.legend | Learned · How well you sign it |
| home.tile.notYet / next | not yet / NEXT · start |
| home.groupDone.title | All {n} {group} learned. Great work! |
| home.groupDone.body | Practise any {item} again to earn more stars. |
| home.groupDone.action | Go to {next group} |
| back.unsaved | Leave without saving? Your changes to the {language} plan will be lost. · Keep editing · Leave |
| call.backGuard | Leave the call? · Stay · Leave |

## 9. Proposals and open questions

- **PROPOSAL: save the appearance to the account.** It would follow the user across devices, which matters on shared school laptops where several students use one machine. It needs `profiles.appearance jsonb` and an update policy. Until then it's per device. On a shared laptop the last choice applies to the next user, so consider resetting to the default on sign-out.
- **More schemes / custom accent:** not included. Each new palette must pass the contrast script (§2.3).
- **Open:** should the Start screen (role picker) offer the Appearance button too, so a child can set dark mode before signing in? The design assumes yes (same header button).

## 10. Order of work

1. ThemeProvider + palettes, with Graphite dark unchanged (screenshot-compare).
2. `DashboardShell` header (Back, Appearance, account menu) + `AppearancePanel` + `BackButton`.
3. Student classroom home (§3) + `SignTile` / `ModuleStrip` / `CurriculumTabs` changes.
4. Teacher and Admin screens to `useThemedStyles`.
5. Practice, translator, auth, role select, call chrome.
6. Verify: all 8 palettes on each screen (desktop + phone), keyboard and screen reader on the Appearance panel, Back on Android hardware back and web browser back, reduced motion.
