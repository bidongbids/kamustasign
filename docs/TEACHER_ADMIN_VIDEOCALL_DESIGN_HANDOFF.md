# Design handoff: Teacher dashboard, Admin dashboard and Video call

**For:** Claude Design
**Scope:** a proper UI for the three adult-facing parts of LCSign: the
**Teacher dashboard**, the **Admin dashboard** and the **Video call** (both
the teacher's and the student's side of a call). Redesign the layout,
hierarchy and flows **inside the existing Graphite Aurora design system**.
**Codebase:** React Native + Expo SDK 56, web-first (`npm run web`), also
shipped as an Electron desktop app. The app is called **LCSign** (the repo
and older docs use the working name KamustaSign).

**Screenshots of the current UI** are in
`design/current_teacher_admin_videocall/` (index in Appendix B). They were
taken with sample data and Chrome's fake test camera (the green pattern with
a clock), so the "video" is not a real person.

Companion docs, read these first:

- `design/design_handoff_kamustasign_material_pass/README.md`: the current
  visual system (Graphite Aurora tokens, glass, neumorphic controls). **This
  is the design language to stay inside.**
- `CHILD_LEARNING_DESIGN_HANDOFF.md`: the student-side counterpart of this
  doc. Students are the other person on every call, so read §1 there.
- `CLASSROOM_REDESIGN.md`: why the learning plan exists and the rules it
  follows. (Where it says "3 passes", the rule is now **one pass learns a
  sign**.)
- `KAMUSTASIGN_LIGHT_THEME_HANDOFF.md`: the phone light theme. It applies to
  phones only; these dashboards and the call screen are **dark-only** today.

---

## 1. Who uses these screens

**Teachers** at Liloan Central School, an elementary school in Liloan,
Misamis Occidental.

- They're busy and not technical. They use the app on a **school laptop or
  desktop in Chrome** or in the desktop app, often with a class watching.
  Common laptop screens are 1366×768 and 1280×720. Phones are a secondary
  device, mostly for answering or making a quick call.
- A class can have **30–40 students**; the screenshots show 7. One teacher
  can run several classes.
- Some teachers and many students are **Deaf or hard of hearing**. Nothing
  in a call may depend on sound.
- What they do: run classes, choose what the class learns, follow who is
  stuck, and **video-call a student** to practise signs together.

**Admins** are the school's account managers, such as the principal or IT
staff. They use the dashboard rarely, on a desktop. Their one time-sensitive
job is **approving new teacher accounts**. By adviser decision, admins
manage accounts only: no classes, no progress.

**Students** are children aged roughly 6–12, and they are the other side of
every call. The student's call screen is in scope here; the rest of the
student UI is not.

## 2. What exists now (the baseline to improve)

All of it works and is backed by real data. The descriptions below match
the screenshots.

### 2.1 Shared chrome: `DashboardShell` and the Account panel

```
Header (sheer glass, role-accent hairline)
  [hand mark] LCSign            (tap -> back to the role screen)
                         Liza Mendoza  ⚙   [Sign out]
                         Teacher             (tap name -> Account panel)
Scrolling content, max width 1400 (teacher) / 1100 (admin)
```

The **Account panel** (`AccountPanel.tsx`, a frosted modal) lets a user
change their name and password (the current password is checked first) and
turn two-factor sign-in (2FA) on or off. 2FA is offered to teachers and
admins; students only see it if they already have it. See screenshot
`teacher_05`.

### 2.2 Teacher dashboard: `src/screens/dashboard/TeacherDashboard.tsx`

**Desktop (≥ 1100 px):** a 260 px side rail plus a main column.

```
[You missed a call · Ben Reyes · Called today 9:34 PM]   [Call back] [✓]   <- only when there is one

RAIL                              MAIN
YOUR CLASSES                      CLASS HEADER CARD
 ● Grade 5 - Mabini   7             "Grade 5 - Mabini"   Class code KM7QXP     [✎] [🗑]
 ○ Grade 6 - Rizal                  [7 Students] [4 Under 25%] [Class average ███░ 25%]
 + New class                        "Words in the plan - ASL: 80/344 · FSL: all 105. Change"
THIS CLASS                        SECTION BODY (one of:)
 Students                           Students | Learning plan | Modules | Progress
 Learning plan
 Modules
 Progress
```

**Phone and tablet (< 1100 px):** the same pieces stacked vertically. The
four sections become wrapping pills, and classes become pills inside the
class header (`teacher_06`).

**Sections:**

1. **Students** (`teacher_01`). In the main column: a `Students (n)` list
   where each row has an avatar, name, presence (Online / On a call /
   Offline), a progress bar with %, a violet **Call** button and a trash
   icon (remove from class, with an inline confirm). Below it are **Call
   notes (n)**: saved notes from past calls, expandable, deletable. In a
   second column: the **Class code** card (big code, Copy, New code) and
   **Invite students** (search, then tick students who signed up but have
   no class yet, then "Add to class").
2. **Learning plan** (`teacher_02`, `ClassPlanEditor.tsx`). Choose which
   **word categories and words** the class learns, per language (ASL / FSL
   toggle). It shows a summary bar ("80 of 344 ASL words in the plan · 23%"),
   search, "Starter: 10 per category", "Pick all", "Clear all", collapsible
   category rows with tri-state checkboxes and "45 of 169" counts, and
   Save / Discard. Letters are always the whole group.
3. **Modules** (`teacher_03`, `TeacherModules.tsx`, `ModulePlanner.tsx`).
   A module is a named, ordered set of signs from one language + group, with
   an optional due date.
   - Each module card shows its sign chips, a class-average bar with "N of M
     students finished", up/down reorder, a "Students" expander (per-student
     progress), edit and delete.
   - The "New module" form has: title, description, due date (typed as
     YYYY-MM-DD), language + group, a sign picker filtered by category, and
     the order.
   - "Modules by category" generates one module per part of speech, split
     into parts ("Verbs 1", "Verbs 2").
4. **Progress** (`teacher_04`).
   - Controls: ASL / FSL, then Letters / Numbers (soon) / Words tabs
     (`CurriculumTabs`), and Sort by Overall / group / Name.
   - One row per student: name, overall bar and %, and a line like
     "ASL L 21/26 · N soon · W 34/80".
   - A "**Letters to review**" list: the signs most students have tried but
     not learned, each with a bar (% of the class that learned it) and
     "1 of 7 learned · 6 still learning · 20 attempts · their best 55% (pass:
     80%)".

**Other states:**

- First run with no class: a single "Create your class" card
  (`teacher_07`).
- A teacher an admin hasn't approved yet gets a "Waiting for approval"
  screen instead of the dashboard.
- Loading text is shown while data loads.
- Notices (success/error) appear above the content.

### 2.3 Admin dashboard: `src/screens/dashboard/AdminDashboard.tsx`

```
[16 Accounts] [12 Students] [3 Teachers] [1 Admins]        (stat tiles)
"Teachers create their own classes ... Here you manage who has which kind of account."
TEACHER ACCOUNTS WAITING FOR APPROVAL (1)
  "Approve only people you know are teachers - an approved teacher can see ..."
  [JR] Jose Ramirez · jose@school.ph · signed up 10/27/2026      [Approve] [Make student]
[Search by name or email]
(All (16)) (Students) (Teachers) (Admins)
ACCOUNT LIST (one card)
  [AS] Ana Santos [Student]  ana@school.ph · Grade 5 - Mabini        [✎]
  ... (every account, newest first)
  ✎ expands the row inline: Name field, Role pills (Student/Teacher/Admin),
    warnings ("They'll leave Grade 5 - Mabini ..."), [Save] [Cancel]
```

See `admin_01`, `admin_02` and `admin_03` (phone). "Make student" is how a
teacher sign-up is turned down. Admins **cannot** create or delete accounts,
or move students between classes (see §4.2).

### 2.4 Video call: `src/screens/videocall/VideoCallScreen.tsx`

The call screen replaces the dashboard while a call is active. Calls are
always **1:1, teacher ↔ a student in their class**, and the **teacher runs
the call**: which model reads the signs, whose signs are read, and "Show
big". The student sees those settings but can't change them. Each person
controls their own mic, camera, captions and speech language.

**Entry points:**

- Teacher: a **Call** button on each roster row (with presence).
- Student: a "**Call your teacher**" card on their dashboard showing the
  teacher's presence; the button reads "Call (they're on a call)" when busy
  (`student_00`).
- Both: a "**You missed a call**" card with "Call back" (`teacher_01`).

**States** (from `useVideoCall`; `CallState` = idle → ringing-outgoing /
ringing-incoming → connecting → connected → ended):

| State | Today |
|---|---|
| Calling (outgoing) | Centered card: initials avatar, name, "Calling… waiting for them to answer", Cancel (`call_01`). |
| Incoming | Card: avatar, "Liza Mendoza is calling you", Decline / Accept, ringing motion (`call_02`). |
| Connecting | Spinner over the video area: "Connecting to …". |
| Connected (desktop) | See the layout below (`call_03`, `call_04`). |
| Connected (phone) | Everything stacked in one long scroll; controls at the very bottom (`call_08`, `call_09`). |
| Ended | Card: "Call ended", the reason or error, **call notes** (length, signs practised, what each side signed), Download notes, **Save to class notes** (teacher only), Back (`call_10`, `call_11`). |
| Errors | Web-only notice in the native app; camera blocked or busy; "X declined the call" / "X is on another call"; no answer (recorded as a missed call); connection lost. |

**Connected, desktop (`call_03`):**

```
TOP BAR  [AS] Ana Santos ● Connected · 0:06  ▮▮ Good connection
         [ASL Letters | ASL Numbers SOON | ASL Words | FSL Words]   (teacher; student: "ASL Letters · Set by your teacher")
         Speak in [🔊 English ▾]
STAGE (remote video, ~2/3 width)                  SIDE COLUMN (scrolls)
  self-view PiP top-right ("You", "· muted")        Practice a sign ▾  (teacher)  /  Your teacher asks you to sign "B" (student)
  caption strip on the video:                        "Ana Santos is signing"  [No hand]
   [No hand] "Ana Santos's signs appear here as text"   letter guess tile with hold ring · hint
                                                       transcript box
                                                       [Speak aloud] [Show big to both] [Space] [⌫] [Clear]
                                                     "You"  (same card for your own signs)
CONTROLS  (Mute) (Camera off) (Captions on)   Read signs from [Them | Me | Both]   [Leave]
```

- **Captions:** on-device sign reading turns each side's signs into text.
  Letters are added by holding a handshape still (the ring fills); words are
  read hands-free, with a pause between signs. Each card shows a status
  chip: Paused · Starting… · Can't read signs · No hand · Not sure · Hold
  still · Added · Reading sign… · Checking….
- **Speak aloud** reads the text out in the chosen language, for hearing
  people nearby.
- **Show big** opens the text full-screen. If the teacher opens it, it shows
  on **both** screens.
- **Practice in the call:**
  - The teacher opens "Practice a sign" and taps a letter or one of the
    class plan's words (`call_05`).
  - The student sees "Your teacher asks you to sign B" with "Show me how"
    (the reference video/photo) and a status line (`call_07`).
  - The student's device checks the sign with the classroom pass rule
    (≥ 80% confidence) and sends the result back. The teacher sees "Got it!
    92% sure", or "Not yet - the computer saw 'D'", with Ask again / Next /
    Stop (`call_06`).
- **Connection quality** is a badge: Good / OK / Weak connection. On a weak
  link the app lowers the video quality it sends.

### 2.5 The problems, as we see them

**Teacher dashboard**

1. **No hierarchy.** Every part is the same frosted card at the same
   weight. The class header (with stats) repeats on top of every section,
   so on most sections the real content starts halfway down the screen.
2. **Nothing says "what needs me today".** Missed calls, students who are
   stuck, modules coming due and new students without a class are spread
   across four sections, or not shown at all.
3. **The roster doesn't scale.** At 30–40 students, a violet "Call" button on
   every row makes a column of 40 identical buttons. The progress bar is the
   only per-student information. Remove (trash) sits right next to Call.
   **There is no student detail view**: a teacher can't open one child and
   see their signs, stars, modules and call notes.
4. **Plan vs modules is confusing.** "Learning plan" (which words the class
   learns) and "Modules" (ordered sets with due dates) are separate
   sections with similar pickers, and teachers mix them up.
5. **Progress is hard to scan.** It's a long list of bars per student, plus a
   "to review" list that uses the same bar for a different meaning (share of
   the class). There's no class-wide view of which signs are learned.
6. **Phone is a long stack.** Names get truncated ("Ana…"), the four section
   pills wrap onto two lines, and the call button competes with everything
   else.
7. **Dates are typed** as YYYY-MM-DD in the module form.

**Admin dashboard**

1. **Approvals don't stand out**, even though they're the only urgent task.
2. **The list is flat**: every account in one card, newest first, with role
   badges. Nothing is grouped by class or teacher.
3. **Role changes are a pill switch** inside an inline expander. Their
   consequences (a student leaving their class, a teacher losing their
   classes' access) appear only as small red warning text.
4. **The stat tiles take the top of the page** but can't be acted on.

**Video call**

1. **Too much at once.** Model tabs, the speech language, two caption cards,
   the practice panel, a three-way read-from toggle and the controls are all
   visible together. The child on the video gets about half the screen.
2. **Captions appear twice**: in the strip over the video and in the "is
   signing" card.
3. **The student sees teacher-only controls** as disabled pills ("Set by
   your teacher"). That's noise for a 7-year-old, whose screen should be
   mostly the teacher, the request and the captions.
4. **The phone layout is one long scroll.** The video is small and Leave /
   Mute are at the bottom of the scroll, not fixed.
5. **Practice is buried**: a collapsible card of chips, and the result is a
   single line of text.
6. **The ringing and ended screens are plain cards.** For Deaf users,
   ringing has to be unmissable without sound.

## 3. Stay inside the design system (non-negotiable)

**Keep:**

- **Graphite Aurora tokens** in `src/theme/theme.ts`. Use token names, never
  raw hex in screens. Role accents: **teacher = `primaryTeal` (#7C6CF5,
  violet)**, **admin = `adminGray` (#7D8799)**, **student = `accentCoral`
  (#F2B23E, gold)**. Feedback: `success` #3FB56A, `needsPractice` #E0525F.
  Text: `textPrimary` / `textSecondary` / `textTertiary` on the dark ground;
  `textOnFrosted` / `textOnFrostedMuted` on frosted glass.
- **Materials:** glass surfaces (`GlassCard`, `tint="sheer"` on the dark
  ground; `"frosted"` for modals and forms, which need dark text) and
  neumorphic controls (`neuRaised` / `neuInset` in `src/theme/shadows.ts`,
  never hand-rolled shadows). Use `GradientBackground variant="subtle"`.
- **Type:** Baloo 2 (700/600) for headings, Inter (400/500/600) for body.
  Only these weights are loaded. Use the `typography` scale (`display`,
  `h1`–`h3`, `body`, `bodySm`, `label`, `caption`, `meta`).
- **Spacing / radii:** `xs 4 · sm 8 · md 16 · lg 24 · xl 32 · xxl 48`;
  radii `sm 8 · md 16 · lg 24 · pill 999`. **Breakpoints:** phone < 768,
  tablet 768–1099, desktop ≥ 1100. Today tablets get the phone layout.
- **Shared components:** restyle or extend them through props rather than
  making look-alike copies:
  - `DashboardShell` / `DashboardCard`, `ProgressBar` (the only progress bar,
    shared with the student UI), `SegmentedToggle`, `CurriculumTabs`,
    `StudentProgressRow`, `KidButton`, `LanguagePicker`
  - from `ManageKit.tsx`: `ActionButton` (primary / ghost / danger,
    icon-only), `Avatar`, `RoleBadge`, `StatTile`, `Notice`, `ConfirmInline`,
    `ChoicePills`, `SearchField`, `InlineField`, `CheckRow`
- **Icons:** `src/components/icons/UiIcons.tsx`, small stroke SVGs. Add new
  ones in the same style.

**You may add** semantic tokens derived from existing hues and named by role
(for example `presenceOnline`, `callDanger`). List each one with its value
and reason, as the material-pass README did. Proposing a **light variant**
of these screens for phones is welcome but optional, and must map onto the
existing light palette.

## 4. Hard constraints (engineering)

### 4.1 Platform

- **React Native `StyleSheet` only.** Flexbox, no CSS Grid, no media
  queries, no `:hover`-only affordances (it runs on touch screens too).
  Web-only effects need an RN equivalent.
- **Motion:** RN `Animated` only (no Lottie or Framer). Respect reduced
  motion: every animation needs a static version, and nothing may flash more
  than 3 times a second.
- **Confirmations are inline** (`ConfirmInline`), never browser
  `confirm()`/`alert()`. Modals use RN `Modal`.
- **Tables** are built from rows; there is no native table element.

### 4.2 Data and permissions shape the UI

The database enforces these rules (Row Level Security); the UI can't show
what a user can't read:

- A teacher sees **only their own classes and those classes' students**.
  The "invite" list shows **students with no class** (name and email) and
  nobody else. A teacher **can't take** a student from another class; that
  teacher removes them first.
- A student **joins with the class code only while they have no class**.
- New **teacher accounts start unapproved**: an unapproved teacher has no
  classes, students or calls until an admin approves them.
- **Admins** see every account (name, email, role, class name, approved
  flag) and can change a name or role. They **can't create or delete
  accounts**, can't demote the **last admin** or themselves, and can't edit
  classes. Making someone a non-student removes them from their class.
- All **progress figures** come from `src/lib/curriculum.ts`.
  - **One good try learns a sign** (confidence ≥ 80%; letters must be held
    0.5 s).
  - "Overall" is the mean across available groups, **counting only words in
    the class's learning plan**.
  - The teacher's numbers must equal what each student sees on their own
    dashboard.
  - **Stars** (0–3, in quarter steps) show how well a sign was made,
    relative to the model.
- **Unavailable groups** (ASL Numbers, FSL Letters, FSL Numbers) have no
  model. Show them as "soon", never hidden.
- Appendix A lists every field that exists. **Anything not in it needs new
  data** and must be marked as a PROPOSAL. For example: last sign-in, time
  spent, daily activity, streaks, parent contacts, messaging, scheduled
  calls, group calls, and a call history beyond missed calls and saved
  notes.

### 4.3 Video call contracts

- **Web only** (Chrome/Edge, the desktop app). The native app shows a "use
  the web app" notice.
- **1:1 only, teacher ↔ student in that teacher's class.** No group calls
  (PROPOSAL if you want them).
- **The two videos are real `<video>` elements.** The on-device sign reader
  reads their frames.
  - Keep a remote video and a self view.
  - They may be resized, cropped (`objectFit: cover`) or swapped, but a
    layout must not hide the video it is reading.
  - Implementation note: the two elements must stay mounted when the layout
    changes.
- **Sign reading is CPU-heavy** on school laptops (word reading runs at
  about 12–15 frames a second). Don't design animation that runs alongside
  it all the time, such as constant pulsing during a call. Reading both
  people's signs at once doubles the cost; that's why "Read signs from"
  exists.
- **Teacher-only settings:** which model reads the signs (ASL Letters /
  ASL Words / FSL Words; ASL Numbers is not available yet), whose signs are
  read (Them / Me / Both), and Show big (opens on both screens).
- **Each person's own settings:** mic, camera, captions on/off, and the
  speech language.
- **Practice results** come from the student's device: passed or not,
  confidence, what the computer saw instead, and the number of tries.
- **Deaf-first:** every state is shown in words; sound is a bonus. Ringing
  must be visible. Captions must be big enough to read across a classroom.
- **Presence** is Online / On a call / Offline for the student and their
  teacher. **Connection quality** is good / fair / poor. On a poor link the
  app lowers the video quality it sends, and the UI should say so.

## 5. Proposals we'd welcome (flag each as PROPOSAL where it needs new data)

**Teacher**

- **T1. A class "Today" home:** missed calls, students under 25%, signs the
  class is stuck on, modules due this week and students waiting for an
  invite, each with its action. All of this exists today.
- **T2. A student detail view** (drawer or page): one student's tiles and
  stars per group, module progress, call notes with them, and a Call
  button. All of this data exists.
- **T3. A roster that scales to 40:** a compact table with sortable columns
  (name, overall, per group, presence) and row actions behind a menu,
  keeping Call one tap away for online students.
- **T4. One flow for "what the class learns":** pick the words (plan), then
  group them into modules with due dates. Or make it clearer that these are
  two different things.
- **T5. Class-wide progress at a glance**, for example a heatmap of signs ×
  students or per-group completion. It must stay readable without colour.
- **T6.** A date picker for module due dates, and a **printable class
  code** (a QR code is a PROPOSAL; it needs a QR library).
- **T7.** A phone layout focused on what teachers do on phones: answer or
  start calls, and check who needs help.

**Admin**

- **A1.** An approvals inbox at the top, with clear Approve / Turn down.
- **A2.** An accounts table with role and class filters, and an account
  drawer where a role change spells out its consequences and asks for
  confirmation.
- **A3 (PROPOSAL, needs server functions):** reset a user's 2FA, set a
  temporary password, delete an account. Today these are done by SQL (see
  the README's "Admin help").

**Video call**

- **V1. Focus layout:** a big remote video, a self-view PiP, one caption
  strip, and the tools (practice, reading settings) in a collapsible side
  drawer or bottom sheet.
- **V2. A simpler student view:** hide teacher-only settings, big captions,
  and a big "Your teacher asks you to sign ___" card with the reference
  media.
- **V3. Phone:** a fixed bottom control bar (Mute, Camera, Captions,
  Leave); the video fills the screen; captions overlay it.
- **V4. Visible ringing:** full-screen incoming call, a pulsing avatar
  (with a reduced-motion version) and big Accept/Decline. Vibration on
  phones is a PROPOSAL.
- **V5. A practice panel:** a letter grid and word search as a sheet, and
  a small results timeline (tries, best %, what the computer saw).
- **V6. An end-of-call summary** worth keeping: duration, signs practised
  with their results, the transcript, and Save / Download.
- **V7. Connection states:** weak link, reconnecting, the other person's
  camera off or mic muted.

## 6. Accessibility requirements

- **Touch targets ≥ 44×44** (48 for anything a child taps in a call).
- **WCAG AA contrast** on both the dark ground and frosted glass. Gold and
  green never sit on frosted glass (theme.ts notes 1.35:1 and 1.03:1).
- **State never by colour alone:** presence, quality, practice results and
  progress need text or a shape.
- **Keyboard navigable** on web, with a visible focus ring (`focusRing`
  token), and **screen-reader labels** on every control. Icon-only buttons
  need a label.
- **Reduced motion** respected everywhere.
- **Deaf-first calls:** captions, visual ringing and visual status; nothing
  audio-only.

## 7. Deliverables

1. **Mockups** of each screen at **desktop 1440×900** and **phone 390×844**,
   with a check at **1366×768** laptop. Use the same HTML-reference format as
   `design/design_handoff_kamustasign_material_pass/` (one HTML file of
   frames plus a README).
2. **Screens and states:**
   - Teacher:
     - home (if T1)
     - roster
     - student detail (if T2)
     - learning plan, modules (list, editor, generator), progress
     - first run, waiting for approval
     - loading, empty and error states
     - phone versions
   - Admin:
     - approvals, list
     - editing a role (with consequences), search with no results
     - phone version
   - Call:
     - calling, incoming, connecting
     - connected for **teacher and student**, at desktop and phone sizes
     - practice asked / passed / not yet
     - Show big
     - weak connection, camera off, muted
     - ended with notes, errors
3. **Component change list in RN terms:** which existing component gets
   which prop or variant, and which components are new. Write it like the
   material-pass README's "RN implementation notes".
4. **Token additions** (if any), each with its value and reason.
5. **A copy deck** for every changed or added string (English).
6. **Proposals** clearly separated from what can be built with today's data.

## 8. Out of scope

- The student learning plan and Practice screen (see
  `CHILD_LEARNING_DESIGN_HANDOFF.md`). Just don't break `ProgressBar`,
  `CurriculumTabs` or `StudentProgressRow` for them.
- The Translator, the role screen and the login/registration screens.
- Desktop light theme.
- Model accuracy.
- Database changes, unless flagged as a PROPOSAL.

## 9. Open questions for the team

- What is the real class size? Design for 40 if unsure.
- Do teachers make calls from phones or tablets, or only from laptops?
- English only, or English + Filipino/Cebuano for teacher and admin copy?
- Should admins see any class-level overview (counts per class), given the
  "accounts only" decision?
- Is a QR code for the class code wanted (new dependency)?

---

## Appendix A: Data that exists today

| Thing | Fields |
|---|---|
| Account (profile) | id, full_name, role (`student` / `teacher` / `admin`), class_id (students only), approved (teachers), created_at. Email is visible to admins, and to teachers only for students with no class. |
| Class | id, name, teacher_id, join_code (6 characters, no 0/O/1/I/L), created_at |
| Progress, per student per sign | language (`asl` / `fsl`), group (`letters` / `numbers` / `words`), sign, attempts, passes, best_confidence (0–1), first_passed_at, last_passed_at, updated_at. Learned = 1 pass. Stars come from best_confidence relative to the model's per-sign reference. |
| Class learning plan | per class + language: the list of planned words (none = every word). Letters and numbers are always the whole group. |
| Word categories | each word's part of speech: noun, verb, pronoun, adjective, adverb, question word, greeting/phrase, … (`src/lib/wordCategories.ts`) |
| Module | title, description, language, group, due_date (date), position, signs (ordered) |
| Missed call | class, caller, callee, created_at, seen_at |
| Call notes | class, teacher, student, started_at, duration_seconds, teacher_text, student_text, practice[ {sign, language, group, passed, confidence, tries} ], created_at |
| Live call state | state (calling / incoming / connecting / connected / ended + reason), timer, presence (online / on a call / offline), quality (good / fair / poor), per-side caption text and reader status, letter guess + hold progress, the practice request and its results, mic/camera/captions on/off, model, read-from, speech language |
| Reference media | a photo (ASL letters) or a looping clip (most words) for "Show me how"; 328 of 344 ASL words and the FSL words have one |

## Appendix B: Screenshot index (`design/current_teacher_admin_videocall/`)

| File | What it shows |
|---|---|
| `teacher_01_students.jpg` | Teacher, desktop: missed-call banner, rail, class header, roster with presence and Call, class code, invite list, call notes |
| `teacher_02_learning_plan.jpg` | Learning plan editor (ASL), categories with counts |
| `teacher_03_modules.jpg` | Modules list: sign chips, class average, reorder/edit/delete |
| `teacher_04_progress.jpg` | Progress: tabs, sort, per-student rows, "Letters to review" |
| `teacher_05_account_panel.jpg` | Account panel (name, password, 2FA) over the dashboard |
| `teacher_06_phone_students.jpg` | Teacher on a phone (390 px, tall capture) |
| `teacher_07_first_run_no_class.jpg` | Teacher with no class yet |
| `admin_01_accounts.jpg` | Admin: stats, approval queue, full account list |
| `admin_02_editing_account.jpg` | Admin editing an account inline (name, role) |
| `admin_03_phone.jpg` | Admin on a phone |
| `student_00_dashboard_call_card.jpg` | Student dashboard: the "Call your teacher" card (top right) |
| `call_01_teacher_calling.jpg` | Teacher calling a student |
| `call_02_student_incoming.jpg` | Student receiving the call |
| `call_03_teacher_connected.jpg` | Connected call, teacher side, desktop |
| `call_04_student_connected.jpg` | Connected call, student side, desktop |
| `call_05_teacher_practice_picker.jpg` | Teacher opening "Practice a sign" |
| `call_06_teacher_practice_asked.jpg` | Teacher after asking for "B" |
| `call_07_student_practice_asked.jpg` | Student asked to sign "B" |
| `call_08_student_phone.jpg` | Connected call on a phone, student side |
| `call_09_teacher_phone.jpg` | Connected call on a phone, teacher side |
| `call_10_teacher_ended_notes.jpg` | Call ended, teacher side, with notes |
| `call_11_student_ended.jpg` | Call ended, student side |

In the phone call screenshots the videos are black. That's a known bug
(the video elements are rebuilt when the layout changes), not the intended
design.
