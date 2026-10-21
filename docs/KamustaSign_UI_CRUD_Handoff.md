# KamustaSign (LCSign) — UI, CRUD & App-Layer Context

> Handoff doc for a new chat working on **UI, navigation, authentication, CRUD, and backend** — everything except the ML sign-recognition model. That work (MediaPipe landmark extraction, TensorFlow training, ensembling, TF.js conversion) lives in `ml/` and `src/ml/` and is being handled in a separate chat. This file deliberately stays shallow on that part — screens that use the model are listed for completeness, but their internal inference logic isn't detailed here.
>
> **Read this whole file before writing code.** The single most important thing it says is in Section 3: most of what the capstone manuscript describes (accounts, classroom, database) does not exist in the codebase yet. Don't assume it's there.

## 1. What this project is

KamustaSign (branded in-app as **LCSign**) is a BSIT capstone project: an AI-based, real-time American Sign Language (ASL) interpretation system for **Liloan Central School** (Liloan, Bonifacio, Misamis Occidental, Philippines). It translates ASL hand gestures into text in real time via webcam, and is designed (per the manuscript) to include a classroom module where teachers post sign-language assignments, students submit recorded performances, and the system auto-scores them using the same recognition engine.

Three user roles are designed: **Student**, **Teacher**, **Admin** — plus a direct-access **Translator** mode that skips role selection entirely.

## 2. Confirmed tech stack (from `package.json`, verified against actual usage)

- **Framework:** Expo SDK 56, React Native 0.85.3, React 19.2.3, TypeScript. Single codebase targets web, iOS, and Android (`app.json` lists all three platforms).
- **Fonts:** `@expo-google-fonts/baloo-2` (headings) + `@expo-google-fonts/inter` (body), loaded via `expo-font` in `App.tsx`.
- **Navigation library:** `@react-navigation/native` + `@react-navigation/native-stack` are installed **but not used anywhere in the code**. Current screen switching is done manually with `useState` in `App.tsx` (see Section 4). If you add real navigation, you're wiring up an already-installed-but-dormant library, not adding a new dependency.
- **Backend client:** `@supabase/supabase-js` is installed **but not imported or initialized anywhere in `src/`**. No Supabase URL/key, no `.env` file, no client instance exists yet. It's a dependency sitting unused — see Section 3.
- **Storage:** `@react-native-async-storage/async-storage` installed, not currently used in `src/`.
- **Camera:** `expo-camera` is installed **but not used**. The two working camera screens use raw browser `navigator.mediaDevices.getUserMedia` + HTML `<video>`/`<canvas>` elements instead — meaning they are web-only today (see Section 4.3) and native camera support isn't built yet despite the dependency being present.
- **ML runtime deps** (present, but out of scope for this doc): `@tensorflow/tfjs`, `@tensorflow/tfjs-react-native`, `react-native-fs`.
- **Other UI deps:** `react-native-svg` (used for the hand-landmark logo mark), `react-native-safe-area-context`, `react-native-screens`, `react-native-web`.

## 3. The most important thing to know: almost nothing is wired up yet

The capstone **manuscript** (thesis document) fully describes accounts, roles, a Postgres schema, a classroom module, and Row Level Security policies. **None of that exists in the actual codebase.** What's real today:

- `App.tsx` shows a role-select screen. If the user taps **Student**, **Teacher**, or **Admin**, they land on a literal placeholder: `"{Role} dashboard - coming next"`. There is no login, no signup, no session, no role persistence, no Supabase call anywhere in that path.
- If the user taps **Translator**, they go to the one fully-working part of the app: the ML translator hub (Section 4.3).
- **Zero CRUD operations exist in code.** No create/read/update/delete calls, no API layer, no database queries, no fetch/axios calls to anything. Grepping the entire `src/` tree for "supabase" returns no matches.
- No `.env` file exists, so there isn't even a Supabase project connected yet at the config level.

This isn't a bug to fix — it's just genuinely unbuilt. Section 5 below has the designed target (from the manuscript's ERD and DFDs) to build toward.

## 4. What's actually implemented today

### 4.1 File structure (non-ML)

```
App.tsx                          — root component, manual role-based "routing" via useState
src/
  screens/
    RoleSelectScreen.tsx         — entry screen: 4 role cards (Student/Teacher/Admin/Translator)
    TranslatorHubScreen.tsx      — tab switcher between the two ML screens (Letters / Words)
    LiveTranslatorScreen.tsx     — ML: single-frame alphabet/letter sign recognition (web only)
    WordTranslatorScreen.tsx     — ML: sequence-based word sign recognition (web only)
    TestModelScreen.tsx          — dev-only harness that loads the model and runs one dummy
                                    prediction to confirm it loads; NOT linked into App.tsx's
                                    navigation flow at all (orphaned screen, reachable only by
                                    manually rendering it)
  components/
    RoleCard.tsx                 — big tappable icon+label+description card w/ accent color,
                                    used on RoleSelectScreen
    HandLandmarkMark.tsx         — SVG hand-skeleton logo mark (21-point MediaPipe topology,
                                    hand-coded points/connections), used as the app's visual
                                    identity on RoleSelectScreen
  theme/
    theme.ts                     — design tokens: colors, fonts, spacing, radii (see 4.2)
  ml/                             — OUT OF SCOPE for this doc (model loading, landmark math)
```

### 4.2 Design tokens (`src/theme/theme.ts`)

Already-approved palette and type scale — reuse these, don't invent new colors:

| Token | Value | Use |
|---|---|---|
| `primaryTeal` | `#1D6F66` | Brand primary (also Teacher accent) |
| `primaryTealDark` / `primaryTealLight` | `#154F49` / `#3E8F85` | Teal variants (Translator accent) |
| `accentMarigold` | `#F2A93B` | Secondary accent (Student accent, landmark dots) |
| `accentMarigoldDark` | `#D6901F` | Marigold variant |
| `background` | `#FBF7EF` | Warm paper background |
| `surface` / `surfaceMuted` | `#FFFFFF` / `#F1ECE1` | Card / muted surfaces |
| `success` / `needsPractice` | `#3F9142` / `#D9603B` | Reserved for future auto-scoring feedback UI |
| `adminGray` / `adminGrayLight` | `#5B6570` / `#8A93A0` | Admin role accent |
| `textPrimary` / `textSecondary` / `textOnPrimary` | `#2B2621` / `#6B6459` / `#FFFFFF` | Text |
| `border` | `#E4DCC9` | |

Fonts: `Baloo2_700Bold` / `Baloo2_600SemiBold` (headings), `Inter_400Regular` / `_500Medium` / `_600SemiBold` (body). Spacing scale: `xs4 sm8 md16 lg24 xl32 xxl48`. Radii: `sm8 md16 lg24 pill999`.

### 4.3 The working part: Translator flow

`RoleSelectScreen` → tap "Translator" → `TranslatorHubScreen` (pill tab switcher, "Letters" / "Words") → renders either `LiveTranslatorScreen` (letters) or `WordTranslatorScreen` (words).

Both translator screens:
- Only render their real UI when `Platform.OS === "web"` — on native (iOS/Android) they currently show a plain "this feature currently supports web only" message. This is the actual current limitation, not a placeholder for effect.
- Use raw web APIs (`navigator.mediaDevices.getUserMedia`, HTML `<video>`/`<canvas>`) rather than `expo-camera`, which is why native isn't supported yet.
- Load MediaPipe from a CDN at runtime (not bundled).
- Share the same visual pattern: mirrored video preview, canvas landmark overlay, a result card below. `WordTranslatorScreen` additionally has a Record/Stop button and a top-5 ranked prediction list; `LiveTranslatorScreen` shows a single live-updating prediction + confidence.

If the classroom module (Section 5) needs students to record and submit a video on a phone, native camera support will need to be built — it doesn't piggyback on the existing translator screens as-is.

## 5. Designed but NOT built — the target architecture

This is what the manuscript's Entity-Relationship Diagram, Data Flow Diagrams, and Functional Decomposition specify. Treat it as the design brief, not as existing code.

### 5.1 Planned backend: Supabase

- **Auth:** role-based accounts (student / teacher / admin), login/signup shared across all three roles.
- **Postgres DB** — planned schema (from the manuscript ERD):

```
CLASSES        { id PK, name, teacher_id FK }
PROFILES       { id PK (FK to auth.users), full_name, role ["student"|"teacher"|"admin"], class_id FK }
ASSIGNMENTS    { id PK, teacher_id FK, class_id FK, target_sign, due_date }
SUBMISSIONS    { id PK, assignment_id FK, student_id FK, video_url (Storage), submitted_at }
SCORES         { id PK, submission_id FK, predicted_sign, is_correct, confidence }
```

Relationships: a class has many profiles and many assignments; a teacher profile posts assignments; a student profile submits submissions; an assignment receives many submissions; each submission produces exactly one score.

- **Storage:** submission videos.
- **Row Level Security:** policies scoping access by role (not yet designed in detail — will need real policies per table, e.g. students can only read/write their own submissions, teachers can only manage assignments/scores for their own classes).

### 5.2 Planned functional modules (from the Functional Decomposition diagram)

- **Authentication & Role Management** — Login/Sign Up (shared by all roles), Role Routing (student/teacher/admin land on different dashboards after auth).
- **Classroom Module** — Post Assignment (teacher), Submit Recording (student), Auto-Score (system, reuses the ML model against a submitted video vs. the assignment's `target_sign`), Gradebook (teacher-facing view of scores).
- **Admin Panel** — Manage Accounts, Manage Classes.
- **Real-Time Translator** — already built (Section 4.3); the DFD models it as its own subsystem (Hand Landmark Detection → Sign Classification → Text/Speech Output) separate from the classroom module.

### 5.3 Planned feature: Video chat (designed, not built)

A peer-to-peer video chat between Student and Teacher roles, with each side's device running its own local copy of the sign-recognition pipeline against both the local and incoming remote video stream, rendering live translated captions as an overlay. Design specifics:

- **Transport:** WebRTC, direct P2P audio/video — never routed through a server.
- **Signaling only:** Supabase Realtime exchanges the WebRTC SDP offer/answer and ICE candidates before the P2P link takes over. No persistent DB table needed — the signaling channel is ephemeral (exists only for call setup).
- **Translation overlay:** each device runs the existing MediaPipe + TF.js pipeline against two streams (own camera + incoming peer stream) independently; translation is never computed server-side or sent over the network.
- **Flow:** "Establish Call (Signaling)" (caller sends request via Realtime, callee accepts/declines, offer/answer/ICE relayed) → "Stream Video & Translate Overlay (P2P)" (direct WebRTC media flow, both sides overlay captions using the bundled model).
- Likely needs `react-native-webrtc` for native + browser-native WebRTC APIs for web, matching the existing dual web/native target.

Full detail on this specific feature (including the original design conversation) is in `SESSION_SUMMARY_for_UI_and_VideoChat.md` at the project root, if more context is needed.

## 6. Suggested next steps for this chat

Roughly in dependency order:
1. Set up a real Supabase project, add `.env` handling, initialize the client.
2. Build the Postgres schema from Section 5.1 + RLS policies.
3. Build actual auth (login/signup) and wire real navigation (the installed-but-unused `@react-navigation` packages) in place of `App.tsx`'s `useState` role switch.
4. Build role-specific dashboards to replace the "coming next" placeholders.
5. Build the classroom module CRUD: post assignment, submit recording, view gradebook, manage accounts/classes (admin).
6. Decide how "Submit Recording" gets camera access on native (current translator screens are web-only) before wiring auto-scoring to it.
7. Video chat (Section 5.3) — lower priority, biggest lift, has its own design doc already.

## 6a. Progress on Section 6 (this session)

- **Step 1 (Supabase project + `.env` + client) — code scaffolded, blocked on you creating the actual project.**
  - `.env.example` added (copy to `.env`, gitignored already). Needs `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` from a real project's Settings → API page.
  - `src/lib/supabase.ts` added: initializes the client, throws a clear error if env vars are missing, uses AsyncStorage for session persistence on native and Supabase's default (localStorage) on web.
  - Still needed: actually create the Supabase project at supabase.com and paste its URL/anon key into `.env`. Nothing else can be tested end-to-end until that exists.
- **Step 2 (Postgres schema + RLS) — drafted, not yet run against a live project.**
  - `supabase/migrations/0001_schema.sql` — tables from Section 5.1 (`profiles`, `classes`, `assignments`, `submissions`, `scores`), plus a `handle_new_user` trigger that auto-creates a `profiles` row on signup from `auth signup` metadata (`full_name`, `role`).
  - `supabase/migrations/0002_rls.sql` — RLS policies per role for all 5 tables, plus a private `submissions` storage bucket with path-scoped policies (`{student_id}/{assignment_id}/{filename}`). Uses `SECURITY DEFINER` helper functions (`current_user_role`, `current_user_class_id`, `is_admin`) to avoid self-referential RLS recursion on `profiles`.
  - Not yet applied or tested against a real database — run via the Supabase SQL Editor (paste each file in order) or `supabase db push` once the CLI is linked to the project. Treat as a strong draft, not verified.

## 6b. Auth UI — register/login/Google/2FA (this session)

Built as real, functional screens (not mocks) — wired to `supabase.auth` and
`supabase.auth.mfa` — but not yet runnable end-to-end because no live
Supabase project exists yet (see 6a). Product decisions made this session:
2FA is TOTP-authenticator-app based (offered right after registration,
skippable, not mandatory); only Student/Teacher can self-register, Admin is
login-only; Google login is web-only for now.

- `src/lib/authGate.ts` — `useAuthGate()` hook: the single source of truth for
  "is this user actually allowed in." Session presence alone isn't enough —
  Supabase issues a session at `aal1` right after password sign-in, before an
  enrolled TOTP factor is verified — so this tracks `status: loading |
  signedOut | needsMfa | authenticated` by checking
  `mfa.getAuthenticatorAssuranceLevel()`, not just session existence.
- `src/navigation/AuthNavigator.tsx` — switches between Login/Register/
  Verify2FA/Setup2FA. Deliberately uses the same manual `useState` routing
  App.tsx already uses elsewhere, not the installed-but-dormant
  `@react-navigation` stack — wiring that is still its own separate step
  (Section 6, step 3), not folded into this pass.
- `src/screens/auth/{LoginScreen,RegisterScreen,Verify2FAScreen,Setup2FAScreen}.tsx`
  plus shared `src/components/auth/{AuthTextField,AuthButton}.tsx` and
  `src/screens/auth/authStyles.ts`.
- `App.tsx` — tapping Student/Teacher/Admin on `RoleSelectScreen` now leads
  into `AuthNavigator` instead of straight to the placeholder; the "coming
  next" dashboard placeholder only shows once `authGate.status ===
  "authenticated"`. Translator is untouched (still no-auth, direct access).
  Also restores the tapped role from a `?role=` URL param after a Google
  OAuth redirect bounces the web page away and back.

**Important:** `src/lib/supabase.ts` used to `throw` at import time when
`.env` was missing. Since `App.tsx` now eagerly imports the auth chain, that
throw was crashing the *entire app* on load — including the previously-working
Translator flow — any time `.env` isn't configured (i.e., right now). Fixed:
the client always constructs (with placeholder values if unconfigured) and
exports `isSupabaseConfigured: boolean`; `authGate` and every auth screen
check that flag first and show a "backend not connected yet" message instead
of calling a live client. Confirmed by inspecting the actual served Metro
bundle, not just `tsc`.

Still needed before this is testable end-to-end: the real Supabase project
from 6a (URL + anon key in `.env`), the `0001`/`0002` migrations actually run
against it, and a Google OAuth client configured in both Google Cloud Console
and the Supabase Auth provider settings (redirect URI must match).

## 6c. Design pass — desktop + mobile responsiveness, colors (this session)

Scoped to `RoleSelectScreen`, `RoleCard`, and the auth screens/`theme` —
deliberately did not touch `TranslatorHubScreen` or anything under `src/ml`,
since those are being actively edited in a parallel chat this session.

- `src/theme/theme.ts` — added depth/state tokens (`surfaceElevated`,
  `overlay`, `focusRing`, `disabledSurface`, `disabledText`) and
  `breakpoints` (`tablet: 768`, `desktop: 1100`). Existing brand hues
  (teal/marigold/warm-paper) unchanged, just extended.
- `src/theme/responsive.ts` — `useResponsive()` hook (`useWindowDimensions`
  wrapper) so screens can branch on desktop/tablet/mobile instead of
  hardcoding pixel widths.
- `src/theme/shadows.ts` — brand-tinted soft shadow presets (`sm`/`md`/`lg`),
  cross-platform (iOS `shadow*`, Android `elevation`, web via RNW's
  automatic `shadow*` → `box-shadow` mapping).
- `src/components/icons/RoleIcons.tsx` — replaced the 4 emoji role icons
  (🎓📋⚙️🎥) with hand-drawn SVGs (`react-native-svg`, already a dependency).
  Emoji glyphs render differently per OS font (Windows/macOS/Android/iOS),
  which undercuts a consistent brand across the desktop+mobile targets this
  app is built for — SVGs render identically everywhere.
- `RoleCard.tsx` — soft elevation, hover/focus lift + visible focus ring for
  keyboard nav (`onHoverIn`/`onFocus` — real states, not CSS-only).
- `RoleSelectScreen.tsx` — desktop (`width >= 1100`) now gets a two-pane
  layout: branded panel (large `HandLandmarkMark`, wordmark, tagline) + a
  2×2 card grid, instead of the same narrow stacked-mobile column stretched
  across a wide window. Mobile/tablet keep the single-column layout, now
  also rendering `HandLandmarkMark` at the top (it existed but was never
  actually rendered before this pass, despite a comment claiming it was).
- `src/components/auth/{AuthTextField,AuthButton}.tsx` — focus rings, soft
  shadows, hover lift on web, 48px minimum touch targets.
- `src/screens/auth/AuthScreenShell.tsx` (new) — shared frame for all 4 auth
  screens: brand mark + wordmark, elevated card, role-tinted decorative
  background, responsive padding. Replaces each screen's own
  `ScrollView`/`container` boilerplate.

## 6d. Palette swap — "Deep Jade & Coral" (this session)

The original "warm paper" teal/marigold palette (Section 4.2) read as too
pale/plain on request. Replaced with a bolder evolution, same underlying
brand identity:

| Token | Old | New |
|---|---|---|
| `primaryTeal` | `#1D6F66` | `#0F766E` (deeper jade) |
| `primaryTealDark` | `#154F49` | `#0B4F49` |
| `primaryTealLight` | `#3E8F85` | `#14B8A6` (brighter turquoise) |
| `accentMarigold` → **`accentCoral`** (renamed, not just recolored) | `#F2A93B` | `#FF6B4A` (vivid coral) |
| `accentMarigoldDark` → **`accentCoralDark`** | `#D6901F` | `#E5502F` |
| `background` | `#FBF7EF` | `#FFF8EE` (richer cream) |
| `surfaceMuted` | `#F1ECE1` | `#F5EAD8` |
| `needsPractice` | `#D9603B` | `#DC3545` (kept clearly distinct from the new coral accent) |
| `textPrimary` / `textSecondary` | `#2B2621` / `#6B6459` | `#1C1410` / `#6E5F4E` |
| `border` | `#E4DCC9` | `#E8D9BE` |

`accentMarigold`/`accentMarigoldDark` were renamed to `accentCoral`/
`accentCoralDark` (not just recolored under the old name) since keeping a
"marigold" name on a coral value would've been misleading in the code. Only
3 files referenced it (`RoleSelectScreen.tsx`, `AuthScreenShell.tsx`,
`HandLandmarkMark.tsx`) — all updated. The `primaryTeal*`/`adminGray*`/
`needsPractice` tokens kept their names (value-only changes), so the
translator screens (`WordTranslatorScreen.tsx` etc., out of scope for this
chat) pick up the new colors automatically without needing to be touched.
Text contrast re-verified against the new `background` (~5.8:1, still AA-
compliant).

## 6e. Motion & personality pass (this session)

Everything up to this point was static — no animation anywhere. Added
tasteful motion (RN's built-in `Animated` API, no new dependency) aimed at
feeling lively without tipping into childish, since the audience spans
students through teacher/admin staff:

- `HandLandmarkMark.tsx` — gentle idle "breathing" scale loop (`animated`
  prop, default on; pass `false` to keep it still, e.g. next to running text).
- `RoleCard.tsx` — cards fade/slide in on mount, staggered via a new `index`
  prop; hover/focus/press now drive a real `Animated.spring` scale instead of
  a static transform swap.
- `AuthButton.tsx` — same spring-based hover/press feedback.
- `RoleSelectScreen.tsx` / `AuthScreenShell.tsx` — header/card fade+slide in
  on mount.
- `src/components/Wordmark.tsx` (new) — shared two-tone "LC" + "Sign"
  logotype (coral "Sign") used on `RoleSelectScreen`. Auth screens
  deliberately keep their own single-color, role-tinted wordmark instead
  (teal for teacher, gray for admin, etc.) since that tint signals which
  role's flow you're in — swapping it for the fixed two-tone would lose that.

## 7. Explicitly out of scope here

The ML recognition pipeline — `ml/` (Python training scripts, MediaPipe extraction, dataset handling) and `src/ml/` (`modelLoader.ts`, `wordLandmarks.ts`, on-device inference) — is being actively developed in a separate chat this session. If this chat needs to touch model-loading code (e.g. to wire auto-scoring in Section 5.2), treat `loadModel()` / `loadWordModels()` in `src/ml/modelLoader.ts` as a stable existing API to call, not something to redesign here.
