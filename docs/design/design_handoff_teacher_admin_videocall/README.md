# Handoff: LCSign — Teacher dashboard, Admin dashboard, Video call

Redesign of the three adult-facing parts of LCSign inside the Graphite Aurora
design system. Built from `docs/TEACHER_ADMIN_VIDEOCALL_DESIGN_HANDOFF.md`
(the brief), the material-pass README, the child-learning handoff, the 22
screenshots in `design/current_teacher_admin_videocall/` and the source of
`TeacherDashboard.tsx`, `ClassPlanEditor.tsx`, `TeacherModules.tsx`,
`InviteStudents.tsx`, `CallHistory.tsx`, `ManageKit.tsx`,
`AdminDashboard.tsx`, `VideoCallScreen.tsx`, `theme.ts` and `shadows.ts`.

## About the design files

`LCSign Teacher Admin Call Mockups.html` is a **design reference in HTML**,
not code to port. Open it in Chrome. It loads Baloo 2 / Inter from Google
Fonts, and everything else is inline. Recreate in React Native with
`StyleSheet.create`, the `src/theme` tokens, `GlassCard`, `GradientBackground`,
`neuRaised` / `neuInset` / `neuPressed`, and the ManageKit components.

- **Frames:** desktop 1440×900, phone 390×844, laptop check 1366×768.
- **Pins:** red numbered pins match the numbered notes under each frame.
- **Proposals:** a red `PROPOSAL` tag marks anything that needs data or server work that doesn't exist today. Everything else can be built from Appendix A of the brief.
- **Placeholders:** striped boxes stand for the real `<video>` elements. Icons are stroke SVGs in the `UiIcons.tsx` style.

| Block | Frames |
|---|---|
| **T** Teacher | T1 Today · T2 Students (roster) · T3 Student detail · T4 What they learn, step 1 (plan) · T5 step 2 (modules) · T6 Module editor + date picker · T7 Modules by category · T8 Progress · T9 states (first run, waiting for approval, loading, error, empty roster, no modules, all caught up) · T10 1366 · T11 phone ×4 |
| **A** Admin | A1 Approvals + accounts · A2 Role change drawer + locked variants · A3 no results / nobody waiting / error / loading · A4 1366 · A5 phone ×2 |
| **C** Call | C1 Calling, Incoming, Connecting · C2 Teacher connected · C3 Student connected · C4 Practice: asked / waiting / passed / not yet (both sides) · C5 Show big · C6 Weak connection, camera off, muted, reconnecting · C7 Ended (teacher, student) + 7 error cards · C8 1366 · C9 phone ×5 |
| **S** System | S1 token additions · S2 interactive states |

**Fidelity:** high for layout, hierarchy, sizes, states and copy. Colours and materials are the existing tokens. Shadows are the existing helpers.

---

## What changed and why (summary)

### Teacher (problems 1–7, proposals T1–T7)

- **The shell changes once for every section.** The rail is: class switcher (dropdown pill) → **Today · Students · What they learn · Progress** → class code at the foot. The class header with its stats **no longer repeats** above every section. The stats live on Today only, so each section starts with its own content.
- **Today (T1, new):** a "Needs you" list sorted by urgency (missed calls → students under 25% → signs the class is stuck on → modules due within 7 days or overdue → students waiting for a class), one action per row. Beside it: Online now (the only Call buttons outside the roster), class average, per-group completion and the last saved call notes. All of it comes from data the dashboard already loads.
- **Students (T2):** a sortable table built from rows (52px) that works at 40.
  - Filters: All / Online / Under 25% / Not started.
  - Columns: Name, Status, Overall, ASL Letters, ASL Words, FSL Words.
  - **Call** is a filled button only for online students. Offline is a dim icon button, and On a call is disabled.
  - **Remove** moved into a ⋯ menu, away from Call.
  - Tapping a row opens the **student detail drawer (T3)**: tiles + stars per group, overall, modules, saved call notes with that student, and Call.
- **What they learn (T4–T7):** the plan and modules become **one section with two numbered steps** and one sentence that says how they differ.
  - The module editor is a frosted drawer with a **date picker** (no more YYYY-MM-DD) and an "In the plan" filter that ties step 2 to step 1.
  - "Modules by category" previews what it will create before creating it.
- **Progress (T8):** a per-sign column chart plus a **student × sign grid** that uses three shapes (learned ✓ / tried ◉ / not tried), so it reads without colour. "To review" uses a 3-part stacked strip instead of reusing the progress bar for a different meaning.
- **Phone (T11):** a bottom tab bar, full names on 64px rows, Call only for online students, the missed call first on Today.

### Admin (problems 1–4, proposals A1–A2)

- **Approvals inbox** at the top: gold attention border + icon + count, showing only when someone is waiting. Actions are **Approve teacher** and **Turn down…**. Turn down replaces "Make student" and has an inline confirm that spells out the result.
- **Stat tiles → filter counts** (All 16 · Students 12 · Teachers 3 · Admins 1), plus a **class filter** and **Group by class**, both from `listAllClasses()`.
- **Account drawer** (frosted) replaces the inline pill switch. The role is a radio-card group. A **consequences panel** lists what will happen in sentences, and the confirm button names the change. Self / last-admin locks are shown with their reason instead of a disabled option.

### Video call (problems 1–6, proposals V1–V7)

- **Focus layout:** big remote video, self PiP, **one caption strip below the video** (never over hands), tools in a **drawer** (Practice | Reading), and a **fixed control bar** with Leave set apart.
- **Student view:** no teacher-only controls are rendered. It has 44px captions, 64px controls and a bigger self view.
- **Practice:**
  - The teacher gets a letter grid / word search, a tries timeline, and clear Got it / Not yet results.
  - On the student side, the **self view becomes big** during a request, because the check reads the student's own camera. The request shows a 104px target, a hold ring and Show me how.
- **Ringing:** a full-screen incoming call, a band reading "Incoming video call", static halos (one slow pulse when motion is allowed), and 64px Accept/Decline.
- **Ended:** a summary page (length, practised signs with results, transcript, Save / Download) and a short, warm student summary.
- **Connection and devices:** weak-connection banner, mute shown on the control and the PiP, peer camera off, and seven error cards with one action each.
- **Phone:** the video fills the screen, the caption card floats above a fixed bottom bar, and Tools / the request open as bottom sheets.
- **The black-video bug:** the design requires both `<video>` elements to be **created once** and only their wrappers to change between layouts, which also fixes this bug.

---

## Token additions

All are aliases or a single darker step of existing hues, named by role.
Add them to `darkColors` in `src/theme/theme.ts`. For phones in light mode,
map them onto `lightColors` the same way (`success`, `accentCoral`,
`needsPractice`, `textTertiary` have light values already).

| Token | Value | Derived from | Reason |
|---|---|---|---|
| `presenceOnline` | `#3FB56A` | `success` | Online dot. Always with the word "Online". |
| `presenceOnCall` | `#F2B23E` | `accentCoral` | On a call. The **shape** is a diamond, so it differs from the online dot without colour. |
| `presenceOffline` | `#8A93A6` | `textTertiary` | Offline: an outlined ring, not filled. 5.4:1 on the ground. |
| `attention` | `#F2B23E` | `accentCoral` | The approvals inbox border, the rail "Needs you" count, due-soon chips. |
| `callDanger` | `#C23A47` | `needsPractice` darkened 15% | Leave / Decline / Cancel call fills. White label 5.3:1. `needsPractice` with white is 3.8:1, which fails AA for a 14–18px label. |
| `callAccept` | `#3FB56A` | `success` | Accept fill. |
| `textOnCallAccept` | `#1E1F26` | `textOnFrosted` | Label on Accept, 6.3:1. White on green is only 3.1:1. |
| `actionPrimaryFill` | `#5A50A8` | `primaryTealDark` | Filled teacher actions (Call, Save, New module). White on `primaryTeal` #7C6CF5 is 3.95:1, which fails AA for 13–16px labels. The bright violet stays for outlines, selected states and accents. |
| `captionScrim` | `rgba(10,12,16,0.78)` | `overlay` at 0.78 | Floor for any caption over video. White text stays ≥ 8.8:1 even over a white frame. |
| `ringHalo` | `rgba(124,108,245,0.35)` | `primaryTeal` @ 35% | Ringing halos (calling / incoming). |
| `qualityGood` / `qualityFair` / `qualityPoor` | `#5FD08A` / `#F2B23E` / `#FF7A85` | `successText` / `accentCoral` / `needsPracticeText` | Quality badge text + bars. These are text tokens, so they pass on glass (5.9 / 6.1 / 4.6:1). |
| `heatLearned` / `heatTried` / `heatNone` | `#3FB56A` / ring `#F2B23E` / `rgba(255,255,255,0.06)` | `success` / `accentCoral` / glass | Progress grid cells. Each has its own **shape**: filled + check / ring + dot / empty. |

No new fonts, weights, radii or spacing values. Sizes used: touch targets
44 (adult), 48–64 (anything a child taps in a call), rows 52 / 60 / 64.

### Contrast checks done for this pass (existing tokens)

- **Secondary text on sheer glass:** `textSecondary` #98A1B2 is ≈ 4.4:1 and `textTertiary` #8A93A6 ≈ 3.7:1. Both fail for body text. **Use `textOnGlass` #C3CAD6 (≈ 6.9:1) for secondary text inside glass cards.** The mockups do this throughout.
- **Gold and green on glass:** `accentCoral` on glass is ≈ 6.1:1. For green or red *text* on glass use `successText` / `needsPracticeText`, not `success` / `needsPractice`.
- **Frosted forms:** `textOnFrostedMuted` #5B6472 on frosted glass over a dark backdrop measures ≈ 2–3:1. The new drawers use `textOnFrosted` only. Please check `AccountPanel`'s muted lines too.
- **Badges:** `adminGrayLight` badge text on glass is ≈ 4.5:1, which is borderline. Keep the badge at 11px/600 or larger.

---

## Component change list (RN terms)

### Existing components: new props and variants

| Component | Change |
|---|---|
| `DashboardShell` | `rail?: ReactNode` slot (desktop ≥ 1100) and `tabs?: {key,label,icon,badge?}[]` (phone/tablet bottom bar, safe-area padded). It keeps the header. Add `accent` for the role hairline (exists). |
| `DashboardCard` / `GlassCard` | `variant: 'sheer' \| 'frosted' \| 'drawer'`. `drawer` is opaque sheer (`rgba(52,58,70,.96)` gradient) for the student detail drawer and the call Tools drawer. These are surfaces that hold gold/green, which frosted can't. Add `attention?: boolean` for the gold border. |
| `ProgressBar` | No visual change. Add `size: 'sm' \| 'md' \| 'lg'` if it isn't there yet (7 / 10 / 14px). The student UI keeps its current usage. |
| `SegmentedToggle` | `counts?: Record<key, number>` rendered after the label ("Online 3"). It already supports `disabled` + `badge: 'soon'`. |
| `CurriculumTabs` | Unchanged. Reused in T3 and T8. |
| `StudentProgressRow` | Add `variant: 'table'`: one 52px row with fixed-width cells (name, status, overall bar, per-group "21/26"), plus `onPress` (open detail) and `trailing` (Call / ⋯). The card variant stays for phone. |
| `ActionButton` | `variant: 'primary'` uses `actionPrimaryFill`. Add `size: 'sm' \| 'md' \| 'lg'` (36 / 44 / 52). Add `'callDanger'` and `'accept'` variants. |
| `Avatar` | Strip a trailing "(you)" before computing initials (fixes "T(" in the admin list). |
| `RoleBadge` | Unchanged. |
| `StatTile` | Unchanged. It's only used on Today (class average) and the call summary. Admin stops using it. |
| `Notice` | `onRetry?: () => void` adds a "Try again" button on error notices. Success notices auto-dismiss after 6 s. Errors persist. |
| `ConfirmInline` | Unchanged API. It's used for Remove from class, Turn down, delete module, and the role-change consequences (with `message` as a list → add `details?: string[]`). |
| `ChoicePills` | `variant: 'cards'` with `description` per option and radio semantics (admin role picker). |
| `SearchField` | Add a clear (×) button when it has text. |
| `CheckRow` / `CheckBox` | Add `indeterminate` (plan categories already render a "–" state; formalise it). |
| `KidButton` | Used for all child-facing call buttons. Add `size: 'xl'` (64px) for Accept/Decline/Back. |
| `LanguagePicker` | Unchanged (Speak in). |
| `PhaseChip` (in VideoCallScreen) | Add a leading icon per phase (hand for Hold still, check for Added, alert for Not sure / Can't read signs). Keep the labels. |
| `QualityBadge` | Add `variant: 'inline' \| 'banner'`. The banner shows once when entering `poor`. |
| `CaptionCard` | Replace the two caption cards + the on-video strip with **one `CaptionStrip`** (below). Keep `CaptionCard`'s internals (reader status, transcript, Space/⌫/Clear) as its body. |
| `TeacherPracticePanel` | Becomes the Practice tab of `CallToolsDrawer`. Add a tries timeline and `triedNotLearned?: string[]` to ring letters. |
| `StudentPracticeCard` | Big target (`kidTarget`), hold ring, `SignReference` inline, and result states (`passed` / `notYet`) with kind copy. |
| `ControlButton` | Labelled 56px (adult) / 64px (child) / 52px (phone) neumorphic toggle. Off = inset + `needsPracticeText` icon and label. |
| `StateCard` | Props `icon`, `title`, `body`, `actions`, `ringing?` (full-screen incoming variant). It's used for calling / incoming / errors. |
| `CallNotes` | Becomes `CallSummary` (C7): count tiles, practice list, transcript, Save / Download. The data is the same `notes` object. |
| `ClassPlanEditor` | Wrapped by `LearnSection` step 1. Add a sticky `SaveBar` when dirty. Add a `+N / −N` diff vs the saved plan. |
| `TeacherModules` / `ModulePlanner` | Wrapped by `LearnSection` step 2. The form moves into `ModuleEditorDrawer`. Due date uses `DatePickerField`. Add a picker filter `In the plan \| All words`. Delete moves into ⋯. |
| `InviteStudents` | Opened from Students → Invite students as a sheet. Unchanged logic. |
| `CallHistory` | Missed calls feed Today. Saved notes feed Today, T3 and the summary. Unchanged queries. |

### New components

| Component | Where | Notes |
|---|---|---|
| `TeacherRail` | T1–T10 | Class switcher (Modal popover list + "New class"), nav items with an optional count badge, class code card (Copy). |
| `TodayPanel`, `NeedsYouRow` | T1, T11 | A row = icon tile + title + subline + one action. Items are computed client side from loaded data. |
| `RosterTable` | T2 | Header row with sort buttons (`accessibilityRole="button"`, label includes the sort state) + `StudentProgressRow variant="table"`. Use a `FlatList` for 40+ rows. |
| `RowMenu` | T2, T5, T8 | ⋯ button → anchored popover in an RN `Modal`. 44px items. Destructive items last, in `needsPracticeText`. |
| `StudentDetailDrawer` | T3 / T11c | Right drawer (desktop, 600 wide) or full-screen page (phone). Reuses the student tile component at teacher size (52×60, read-only). |
| `StepTabs` | T4, T5 | Two step cards acting as tabs. |
| `SaveBar` | T4 | Sticky bottom bar shown when there are unsaved changes. |
| `ModuleEditorDrawer`, `DatePickerField` | T6 | Month grid of 40×40 days, arrow-key navigation on web, "Clear date". It stores the same `due_date`. |
| `ModulesByCategoryDialog` | T7 | Runs the existing generator without saving to preview it, then creates. |
| `ClassSignGrid`, `SignCompletionChart` | T8 | Rows of `View` cells (no CSS grid). Each row gets one accessibility label listing learned / tried signs. SVG rects for the chart. |
| `ReviewSignRow` | T8 | 3-part stacked strip + counts in words. |
| `ApprovalsInbox` | A1 | Renders only when pending > 0. Otherwise a one-line "No one is waiting for approval". |
| `AccountsTable`, `ClassFilter` | A1 | Rows: avatar + name/email, `RoleBadge`, class/status, joined, edit. |
| `AccountDrawer`, `RoleConsequences` | A2 | Consequences built from the account's role, `class_id` → class name → that class's teacher. |
| `CallStage` | C1–C9 | Owns both `<video>` elements, **mounted once**. Layout props (`layout: 'focus' \| 'practice' \| 'showBig' \| 'phone' \| 'phoneSheet'`) only change wrapper styles. |
| `CaptionStrip` | C2–C9 | One strip: hold ring + phase chip + transcript text (36 / 44 / 28 / 34px by role and size) + tools. A second row "You: …" when reading both. |
| `CallTopBar` | C2–C8 | Peer, status + timer, `QualityBadge`. For teachers, the read-only "Reading … " chip + Tools toggle. |
| `CallControlBar` | C2–C9 | Fixed. Mute / Camera / Captions / Speak in (+ Tools on teacher phone), Leave apart. |
| `CallToolsDrawer` | C2, C8, C9c | Tabs: Practice / Reading. 388 desktop, 360 laptop, bottom sheet on phone. |
| `ShowBigOverlay` | C5 | Full-screen text with **both videos kept visible as tiles**. "Close for both" (teacher) / "Close" (student). |
| `CallSummary` | C7 | See `CallNotes` above. |

---

## RN implementation notes

1. **Videos never remount.** `CallStage` renders the remote and self `<video>` elements once, at a stable position in the tree. Layout changes swap wrapper `style` objects only (size, absolute position, `zIndex`, border). Do not render different element trees per breakpoint or per state (practice, show big, phone sheet). This is also the fix for the black phone videos. Re-attach `srcObject` only when the stream changes.
2. **A visible video is a readable video.** Any state that covers a video (Show big, Tools sheet on phone, practice) keeps the video it reads on screen at ≥ 160px wide. During a practice request the student's self view becomes the big container.
3. **`minWidth: 0`** on every flex child that holds a video or a table (material-pass note 1).
4. **Drawers and sheets** are RN `Modal` with `transparent`, a `Pressable` scrim (`overlay`) and `animationType="slide"`, or `"none"` with reduced motion. Focus moves into the drawer on open and returns to the opener on close. Esc closes on web.
5. **Tables** are a header `View` + `FlatList` rows with fixed-width cells. Sorting happens client side. Sort headers announce their state.
6. **Grid of signs (T8):** each student row is one `View` with `accessibilityLabel`. Cells are decorative (`importantForAccessibility="no-hide-descendants"`). Provide the "By student" list as the screen-reader path.
7. **Motion:** only (a) ringing halos (one 1.6 s scale loop), (b) the connecting arc (1 rev/s), (c) the hold ring fill (driven by the reader, not a timer), (d) drawer slides. All are off with `AccessibilityInfo.isReduceMotionEnabled()` / `prefers-reduced-motion`. **Nothing animates continuously during a connected call** (CPU note §4.3).
8. **Ringing without sound:** full-screen state + band + `document.title = "Call from {name}"` while ringing on web (restore after). Vibration on phones is a PROPOSAL.
9. **Focus ring:** 2px `focusRing` (gold) outline, offset 2, on every `Pressable` on web. Use `onFocus` / `onBlur` state since there's no `:focus-visible` in RN.
10. **Hover:** nothing depends on it. Row highlight on hover is decorative only.
11. **Breakpoints:** desktop ≥ 1100 uses the rail; 768–1099 uses the phone tab bar with 24px gutters; < 768 is phone. At 1100–1399 the rail is 216 wide and Today's side column 300 (T10). The call Tools drawer is 360 at < 1400.
12. **Dates:** display with `toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })` and relative text ("in 5 days", "was due Oct 20") from `formatDue` / `isOverdue`.

---

## Data used per screen (all exists unless tagged)

| UI | Source |
|---|---|
| Today: missed calls | Missed call (`caller`, `created_at`, `seen_at`). Dismiss sets `seen_at`. |
| Today: under 25%, class average, per group | `computeOverall` over progress rows + class plan |
| Today / Progress: signs to review | Progress rows: attempts, passes, best_confidence (existing "to review" query) |
| Today: modules due | Module `due_date` + per-module completion (existing) |
| Today: waiting for a class | InviteStudents list (students with no class) |
| Online now / Status column | Presence (online / on a call / offline) |
| Roster per-group columns | Progress rows ÷ available signs (plan for words) |
| Student detail | Progress rows (+ stars from best_confidence vs reference), modules, saved call notes for that student |
| Plan diff (+N / −N) | Draft vs saved plan, client side |
| Admin: classes per teacher, class filter | `listAllClasses()` (`teacher_id`, `name`) + account `class_id` |
| Admin: joined | profile `created_at` |
| Call: everything in C2–C7 | Live call state, practice results, notes object |
| **PROPOSAL** peer camera/mic state | Needs two flags sent over the existing signalling/data channel |
| **PROPOSAL** reconnecting | Needs ICE restart + a grace period in `useVideoCall` |

---

## Copy deck (English)

Strings that are **new** or **changed**. "Was" quotes the current source, and "—" means new. Placeholders: `{name}`, `{n}`, `{class}`, `{sign}`.

### Teacher: shell and Today

| Key | Text | Was |
|---|---|---|
| nav.today | Today | — |
| nav.students | Students | Students |
| nav.learn | What they learn | Learning plan / Modules |
| nav.progress | Progress | Progress |
| rail.classCount | {n} students | (count only) |
| rail.code.help | Students with no class type this to join. | Students type this on their dashboard to join {class}. It only works for students who aren't in a class yet. |
| rail.badge.a11y | {n} things need you | — |
| today.title | Today in {class} | — |
| today.avg.caption | Over the learning plan · same figure students see | average across groups, over the learning plan |
| today.needs.title | Needs you | — |
| today.needs.sort | Most urgent first | — |
| today.missed.title | You missed a call from {name} | You missed a call |
| today.missed.sub | Called today at {time} · {presence} | Called today at {time} |
| today.missed.action | Call back | Call back |
| today.missed.dismiss | Dismiss | (✓ icon) |
| today.under25.title | {n} students are under 25% | (stat tile "Under 25%") |
| today.under25.action | See them | — |
| today.stuck.title | The class is stuck on {n} letters / words | — |
| today.stuck.action | Make a module | — |
| today.due.title | “{module}” is due {weekday}, {date} | — |
| today.due.sub | In {n} days · {x} of {total} students finished · {n} signs | — |
| today.overdue.title | “{module}” was due {date} | — |
| today.waiting.title | {n} students are waiting for a class | — |
| today.waiting.sub | {names} signed up and have no class yet | — |
| today.waiting.action | Add both / Add all {n} | Add to class |
| today.online.title | Online now | — |
| today.online.busy | Busy | — |
| today.where.title | Where the class is | — |
| today.where.soon | ASL Numbers, FSL Letters and FSL Numbers: soon. No model yet. | — |
| today.notes.title | Last call notes | Call notes ({n}) |
| today.caughtUp.title | All caught up | — |
| today.caughtUp.body | No missed calls, nobody waiting for a class and no modules due this week. | — |

### Teacher: Students and student detail

| Key | Text | Was |
|---|---|---|
| students.sub | {n} in {class}. Lowest overall first, so whoever needs help is at the top. | Students ({n}) |
| students.search | Search students | — |
| students.filter | All {n} · Online {n} · Under 25% · {n} · Not started · {n} | — |
| students.col.* | Name · Status · Overall · ASL Letters · ASL Words · FSL Words · Actions | — |
| students.soon | Numbers and FSL Letters: soon | — |
| students.print | Print class code | — |
| students.invite | Invite students | Invite students |
| students.call | Call | Call |
| students.call.a11yOffline | Call {name} (offline). It will ring, and they'll see a missed call. | — |
| students.menu.open | Open details | — |
| students.menu.call | Call {first name} | — |
| students.menu.remove | Remove from class… | (trash icon) |
| students.remove.confirm | Remove {name} from {class}? Their account and progress stay; they just won't be in your class. | unchanged |
| students.empty.title | No students yet | No students yet. Share the class code, or tick students under Invite students. |
| students.empty.body | Students type this code on their dashboard to join. | — |
| students.empty.action | Add students who signed up | — |
| detail.call | Call {first name} | — |
| detail.overall | Overall | — |
| detail.legend | learned · ★ how well · ◯ tried | — |
| detail.tile.notYet | not yet | — |
| detail.modules | Modules | — |
| detail.calls | Calls with {first name} | — |
| detail.calls.note | Only notes you saved after a call appear here. | — |

### Teacher: What they learn

| Key | Text | Was |
|---|---|---|
| learn.title | What they learn | Learning plan |
| learn.sub | Two steps. The plan is every word the class can practise. Modules take words from the plan, put them in order and give them a due date. | Pick the word categories and words {class} learns… |
| learn.step1 | Words in the plan | — |
| learn.step1.sub | ASL {x} of {y} · FSL all {n} | Words in the plan - ASL: {x}/{y} · FSL: all {n}. |
| learn.step2 | Modules | Modules |
| learn.step2.sub | {n} modules · {n} due this week | {n} modules in {class} |
| plan.effect.title | What changes for students | — |
| plan.effect.body | They'll see the new plan the next time their dashboard loads. Their progress on removed words is kept. It just stops counting toward their overall. | (save notice) |
| plan.lettersNote.title | Letters and numbers | — |
| plan.lettersNote.body | Always the whole group. Only words can be picked. | Letters are always included. |
| plan.unsaved | Unsaved changes to the {language} plan | — |
| modules.sub | Students see modules on their dashboard in this order. | Sorted by language and category. Students see your modules in this order. |
| modules.byCategory | Modules by category… | Modules by category |
| modules.due | Due {weekday}, {date} · in {n} days | due {date} |
| modules.overdue | Overdue · was due {date} | — |
| modules.noDue | No due date | — |
| modules.deleteHint | Delete is in each module's ⋯ menu. Students keep the progress they made; only the module goes. | — |
| editor.title | Edit “{title}” / New module | Edit "{title}" |
| editor.due | Due date (optional) | Due date (optional, YYYY-MM-DD) |
| editor.due.clear | Clear date | — |
| editor.due.today | Today is {weekday}, {date} | — |
| editor.filter | In the plan · {n} / All words · {n} | — |
| editor.notInPlan | ‘{word}’ isn't in the plan, so students won't see it until you add it. | — |
| editor.addToPlan | Add to plan | — |
| editor.order | Order students will practise in · {n} signs | Order students will practise in |
| editor.move.a11y | Move {sign} earlier / later | — |
| gen.title | Make modules by category | — |
| gen.body | One module for each part of speech in the plan, split into parts when a category is long. Your existing modules aren't changed. | — |
| gen.create | Create {n} modules | — |
| modules.empty.body | A module is a set of signs to learn in order, like “Greetings” or “Family words”. Students see it on their dashboard. | No modules yet. A module is a set of signs… |

### Teacher: Progress and states

| Key | Text | Was |
|---|---|---|
| progress.sub | The same figures students see on their own dashboard. One good try learns a sign. | Overall is the average across groups… |
| progress.grid.title | Who learned which {group} | — |
| progress.legend | Learned · Tried, not yet · Not tried | — |
| progress.chart | % of class learned | — |
| progress.review.title | {Group} to review | {Group} to review |
| progress.review.body | Most tried but not learned. Good for a whole-class demo, a module or a call. | Signs the most students have tried but not learned yet… |
| progress.review.row | {x} of {n} learned · {y} still learning · {t} tries · best {p}% (pass 80%) | {x} of {n} learned · {y} still learning · {t} attempts · their best {p}% (pass: 80%) |
| progress.review.menu | Make a module from these · Practise in a call | — |
| firstRun.title | Create your first class | Create your class |
| firstRun.body | Give it a name. Then students can join with its class code, or you can add students who've signed up. | You don't have a class yet. Create one, then… |
| firstRun.steps | Create the class · Invite students · Choose what they learn | — |
| approval.title | Waiting for approval | Waiting for approval |
| approval.body | An admin at Liloan Central School needs to approve your teacher account. Until then you can't make classes or calls. Once they have, choose Check again. | — |
| approval.check | Check again | — |
| approval.wrongRole | Signed up as a student by mistake? Ask an admin to change your role. | — |
| error.load.title | Couldn't load your students | (raw error) |
| error.load.body | Check the internet connection, then try again. Nothing you saved was lost. | — |
| error.retry | Try again | — |

### Admin

| Key | Text | Was |
|---|---|---|
| admin.title | Accounts | — |
| admin.sub | Teachers make their own classes and invite students. Here you decide who has which kind of account. | Teachers create their own classes and invite students. Here you manage who has which kind of account. |
| admin.inbox.title | Waiting for approval | Teacher accounts waiting for approval ({n}) |
| admin.inbox.body | Approve only people you know are teachers. An approved teacher can see the names and emails of students who aren't in a class yet. | (same, dash → full stop) |
| admin.inbox.row | {email} · signed up {date} as a teacher | {email} · signed up {date} |
| admin.approve | Approve teacher | Approve |
| admin.turnDown | Turn down… | Make student |
| admin.turnDown.confirm | Turn down {name}? Their account becomes a student account with no class. They can still sign in, and you can make them a teacher later. | — |
| admin.turnDown.do | Make student | — |
| admin.inbox.empty | No one is waiting for approval. | — |
| admin.filter.class | Class: All / {class} / No class | — |
| admin.groupBy | Group by class | — |
| admin.col.* | Name · Role · Class · Joined | — |
| admin.teaches | Teaches {class list} | — |
| admin.noClasses | No classes yet | — |
| drawer.role | Kind of account | Role |
| role.student.desc | Practises signs. Can be in one class. | — |
| role.teacher.desc | Makes classes, sees their students’ progress, calls them. | — |
| role.admin.desc | Manages accounts like you do. | — |
| consequence.title | What changes if {first} becomes {a role} | — |
| consequence.leaveClass | She/He leaves {class}. Only students are in classes. | They'll leave {class} - only students are in classes. |
| consequence.teacherLoses | {teacher}, her/his teacher, stops seeing her/him in the class. | — |
| consequence.teacherPower | She/He can see the names and emails of students who aren't in a class yet. | — |
| consequence.confirm | Yes, make {first} {a role} | Save |
| lock.self | You can't change your own role. Ask another admin to do it. | You'd lose access to this dashboard. Ask another admin to change your role. |
| lock.lastAdmin | This is the only admin account. Make someone else an admin first. | — |
| search.empty.title | No accounts match “{query}” | No accounts match. |
| search.empty.body | Check the spelling, or search by email. Admins can't create accounts: people sign up themselves, then appear here. | — |
| search.clear | Clear search | — |
| save.error | Couldn't save {name}. Nothing was changed. Check the connection and try again. | (raw error) |

Pronouns: use the person's first name instead if gender isn't known ("Ana leaves Grade 5 – Mabini"). The mock uses "she" for readability.

### Video call

| Key | Text | Was |
|---|---|---|
| calling.title | Calling {name}… | {name} / Calling… waiting for them to answer |
| calling.sub | Waiting for {them} to answer. | — |
| calling.selfHint | Your camera is on. Check you're in the frame while you wait. | — |
| calling.cancel | Cancel call | Cancel |
| incoming.band | Incoming video call | — |
| incoming.title | {name} is calling you | {name} / is calling you |
| incoming.sub.student | Your teacher wants to practise signs with you. | — |
| incoming.sub.teacher | {name} from {class} is calling. | — |
| incoming.ringing | Ringing · {m:ss} | — |
| tab.title | Call from {name} | — |
| connecting.sub | This usually takes a few seconds. | — |
| top.student | {name} · your teacher | {name} |
| top.reading | Reading {who} · {model} | (pill bar) |
| top.tools | Tools | — |
| tools.tabs | Practice · Reading | — |
| practice.title | Ask {first} to sign | Practice a sign |
| practice.body | Her/His device checks it and counts it toward her/his plan. Signs from {model}. | Tap a sign to ask {name} for it. Their device checks it and counts it toward their learning plan. |
| practice.legend | Gold outline: letters {first} has tried but not learned yet | — |
| practice.earlier | Earlier in this call | — |
| practice.asked | Asked {first} to sign | Asked {name} to sign “{sign}” |
| practice.waiting.sub | Her/His screen shows the sign and how to make it. | — |
| practice.passed | Got it! | Got it! {p} sure. |
| practice.passed.sub | {p}% sure · {n} tries / Counted toward {first}'s plan. | — |
| practice.notYet | Not yet | Not yet - the computer saw “{seen}”. {tries}. |
| practice.notYet.seen | The computer saw “{seen}” | — |
| practice.notYet.best | Best so far {p}% · needs 80% | Close - {p} sure, needs 80%. {tries}. |
| practice.tries | Tries for this sign · Try {n} | — |
| practice.stop | Stop | Stop |
| reading.model.title | Which signs to read | — |
| reading.model.letters | ASL Letters · Fingerspelling, one letter at a time | ASL Letters |
| reading.model.words | ASL Words · Whole signs, pause between them | ASL Words |
| reading.model.fsl | FSL Words · Filipino Sign Language words | FSL Words |
| reading.model.numbers | ASL Numbers · Soon · no model yet | ASL Numbers (soon) |
| reading.from | Read signs from: {first} · Me · Both of us | Them · Me · Both |
| reading.cost | Reading both uses twice the computer's effort. Pick one if the call feels slow. | — |
| caption.label | {first} is signing | {name} is signing |
| caption.showBig | Show big to both | Show big to both |
| student.yourSigns | Your signs | (second caption card) |
| student.asked.title | Your teacher asks you to sign | Your teacher asks you to sign |
| student.asked.hold | Hold it still… | — |
| student.asked.holdSub | Keep your hand in front of the camera until the ring is full. | — |
| student.selfTag | You · the computer is watching your hand | You |
| student.reference.title | How to make {sign} | — |
| student.reference.body | Copy the hand in the picture. | — |
| student.reference.none | No picture for this sign yet. | — |
| student.passed.title | Great signing! | Great signing! That counts. |
| student.passed.body | That counts. {sign} is learned. | — |
| student.passed.next | Wait for your teacher to pick the next sign. | — |
| student.notYet.title | Almost! Try again. | — |
| student.notYet.body | The computer thought it looked like a different sign. Look at the picture and try once more. | — |
| student.notYet.unsure | The computer wasn't sure. Try once more, a bit slower. | — |
| showBig.chip.student | Shown big by your teacher | — |
| showBig.chip.teacher | Showing big to {first} too | — |
| showBig.label | {first} signed | — |
| showBig.close.teacher | Close for both | Close big view for both of you |
| showBig.close.student | Close | Close big view |
| quality.reduced | · your video is lowered | · video lowered |
| quality.banner | The connection is weak. Your video is lowered to keep the call going. Captions still work. | — |
| peer.cameraOff | {first}'s camera is off | — (PROPOSAL data) |
| peer.cameraOff.sub | Her/His signs can't be read until it's back on. | — |
| peer.noVideo | {first}'s video isn't coming through | — |
| peer.micOff | {first}'s mic is off | — (PROPOSAL data) |
| control.mute / muted | Mute / Muted | Mute |
| control.camera / off | Camera / Camera off | Camera off / Camera on |
| control.captions / off | Captions / Captions off | Captions on / Captions off |
| control.leave | Leave | Leave |
| caption.paused | {first}'s signs appear here when her/his camera is on. | Their signs appear here as text. |
| reconnecting.title | Reconnecting… | — (PROPOSAL) |
| reconnecting.body | Stay on this screen. If it doesn't come back in 20 seconds the call ends and you can call again. | — (PROPOSAL) |

### Video call: ended and errors

| Key | Text | Was |
|---|---|---|
| ended.teacher.title | Call with {name} ended | Call ended |
| ended.teacher.sub | Today at {time} · {m:ss} long · {reason} | Your call with {name} has ended. |
| ended.reason.left / theyLeft / dropped | you left the call / {first} left the call / the call dropped | — |
| ended.back | Back to {class} | Back |
| ended.tiles | Call length · Signs practised · Got it · Not yet | Call notes · {m:ss} |
| ended.practised | Practised | Practised: |
| ended.signed | What was signed · {first} signed · You signed | (teacher) signed: / (student) signed: |
| ended.save | Save to class notes | Save to class notes |
| ended.saved | Saved to class notes | Saved to class notes |
| ended.saveHint | Saved notes appear on {first}'s page and on Today. | — |
| ended.download | Download notes | Download notes |
| ended.student.title | The call has ended | Call ended |
| ended.student.body | You practised {n} signs and got {x} of them! | — |
| ended.student.none | Thanks for calling! | Nothing was signed or practised in this call. |
| err.declined | {first} declined the call · Try again later, or send a reminder in class. | {name} declined the call |
| err.busy | {first} is on another call · Call her/him again in a few minutes. | {name} is on another call |
| err.noAnswer | {first} didn’t answer · She’ll/He’ll see that you called when she/he opens LCSign. | (missed call) |
| err.cameraBlocked | Your camera is blocked · Allow the camera in the browser’s address bar, then try again. | (raw error) |
| err.cameraBusy | Your camera is busy · Close other apps that use the camera, like Zoom or Meet, then try again. | (raw error) |
| err.dropped | The call dropped · The connection was lost. You can call again. | (raw error) |
| err.webOnly | Calls work in the web app · Open LCSign in Chrome or Edge to make video calls. | Video calls work on the web app / Open LCSign in a browser to make calls. |

Kept verbatim (not repeated above): the reader phases (Paused · Starting… ·
Can't read signs · No hand · Not sure · Hold still · Added · Reading sign… ·
Checking…), the reader hints ("Show a hand to the camera.", "Hold still…
adding the letter.", "Added. To repeat a letter, lower your hand first.",
"Signs are read hands-free. Pause briefly between signs.", "Not sure what
that was. Sign it again."), the student camera/caption prompts ("Turn your
camera on so the computer can see your sign.", "Turn captions on so the
computer can check your sign."), "Show me how" / "Hide how to make it",
module validation ("Add a title." / "Pick at least one sign."), and the
delete/remove/new-code confirms.

---

## Proposals: separate from what can be built today

**Can be built with today's data** (everything in the mockups not listed
below): Today home, roster table, student detail, plan + modules as two
steps, the date picker, the generator preview, the progress grid, the admin
inbox / filters / drawer, and every call layout and state except the two
data proposals.

**Needs new data, a dependency or server work:**

| # | Proposal | Needs |
|---|---|---|
| P-QR | QR code on the printed class code (T2) | A QR library (e.g. `react-native-qrcode-svg`) |
| P-A3 | Reset 2FA, set a temporary password, delete an account from the admin drawer | New server functions (today done by SQL) |
| P-peer | Show the other person's camera-off / mic-off state (C6) | Two flags over the existing signalling / data channel |
| P-reconnect | Reconnecting state with a grace period (C6) | ICE restart handling in `useVideoCall` |
| P-vibrate | Vibrate on incoming calls on phones | `navigator.vibrate` (web, Android only) / native haptics |
| P-confused | "B and D look alike…" tip after a Not yet (C4) | A small table of commonly confused signs + tips |
| P-poll | Waiting-for-approval page that updates itself | Polling or a realtime subscription on the profile row |

Explicitly **not** proposed: last sign-in, time spent, streaks, messaging,
scheduled or group calls, and a call history beyond missed calls and saved
notes.

## Open questions (carried from the brief, with the design's assumption)

- **Class size:** designed for 40, and it still works at 7.
- **Phones or tablets for calls:** designed for both. Tablet uses the phone layout with wider gutters.
- **Language:** English only in this copy deck. All strings are keyed, so a Filipino / Cebuano column can be added.
- **Admin class overview:** the class filter and Group by class only, with no counts or progress, keeping to "accounts only".
- **QR code:** drawn as a proposal.
- **Plan vs module words:** if a module may contain words outside the plan, the "not in the plan" line in T6 explains it. If it may not, the picker should hide "All words". Please confirm which rule the student dashboard follows.
- **Role change and classes:** what happens to a teacher's classes when an admin makes that teacher a student? The drawer needs one more consequence line once this is confirmed.
