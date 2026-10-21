# Design handoff: making the learning plan work for children

**For:** Claude Design
**Scope:** the student learning experience only, meaning the Student dashboard's
learning plan and the Practice screen. Make it suited to children **without
leaving the existing Graphite Aurora design system**.
**Codebase:** React Native + Expo SDK 56, web-first (`npm run web`).

Companion docs, read these first:

- `design_handoff_kamustasign_material_pass/README.md`: the current visual
  system (Graphite Aurora tokens, glass, neumorphic controls). **This is the
  design language to stay inside.**
- `KamustaSign_UI_Design_Brief.md`: product context and RN constraints.
  Its Section 4.3 still describes the old assignment flow, which has since
  been replaced; see `CLASSROOM_REDESIGN.md` for the current one.
- `CLASSROOM_REDESIGN.md`: why the learning plan exists and the rules it
  has to follow.

---

## 1. Who this is for

Students at **Liloan Central School**, an elementary school. Assume:

- **Ages roughly 6–12**, with a wide range of reading levels. Some will
  barely read; few will read a paragraph.
- **Some are Deaf or hard of hearing.** Nothing can depend on sound. Audio is
  a bonus layer, never the only signal.
- **Many are learning a sign language**, not fluent in one. FSL (Filipino
  Sign Language) is the local one, and ASL is there for comparison.
- **They use school laptops/desktops in a browser**, often with a teacher
  nearby. The camera features are web-only today.
- They will be **wrong a lot, and the model will be wrong a lot too**. ASL
  word recognition is about 73% accurate on held-out clips, so a child
  signing correctly will still sometimes be told "try again". How the app
  handles that moment matters more than anything else in this doc.

## 2. What exists now (the baseline to improve)

All of it is working, live, and backed by real data, not mockups. Run the
app, sign in as a student, and use it before designing.

### Student dashboard: `src/screens/dashboard/StudentDashboard.tsx`

```
DashboardShell header (logo · name · "Student" · Sign out)
"My learning plan"
OVERALL ProgressBar  "Overall progress ... 34%" / "average across groups"
SegmentedToggle  ASL | FSL
SegmentedToggle  Letters | Numbers · soon | Words
  "ASL Numbers: Not available yet - ..."           (note per unavailable group)
DashboardCard (frosted)
  GROUP ProgressBar "12 of 26 mastered ... 46%"
  rules paragraph (PROGRESS_RULES_TEXT, one dense sentence block)
  legend: not started / attempted / mastered
  tile grid: 52×52 glyph tiles (letters) or text pills (words)
     not-started = pale, attempted = gold tint + "1/3", mastered = solid green
Video Call card (call your teacher)
```

### Practice screen: `src/screens/dashboard/PracticeScreen.tsx`

A header strip above the **unchanged translator body**:

```
[< Done]  [ PRACTISE · ASL LETTERS ]   Make the sign for "B" and hold it steady.
          [         B             ]   Keep going - best so far 62%
                                      Passes: 1 of 3 · next pass counts after 3:42 PM
rules paragraph again
───────────────────────────────────────────────────────────────
LiveTranslatorScreen / WordTranslatorScreen (instrument-panel layout:
camera device, recognized letter tile, confidence dial, handedness and
commit-speed controls, holding meter, ...)
```

Feedback copy today (from `PracticeScreen.tsx`):

| Moment | Current text |
|---|---|
| Waiting | "Waiting for your first try…" |
| Trying (letters) | "Keep going - best so far 62%" / "Not recognised yet - keep trying" |
| Passed, counted | "Correct! That pass counted (2 of 3)." |
| Passed, cooldown | "Correct! Passes need 10 minutes between them - your next one counts after 3:42 PM." |
| Mastered | "Correct! That pass counted - you've mastered this sign." |
| Wrong word | "That looked like "bad". Try again." |
| Right word, low confidence | "Close - recognised, but only at 64%. Try again." |
| Model unsure | "Not sure what that was - try again." |

### The problems, as we see them

1. **It reads like an instrument panel for adults.** The practice header
   and rules text are dense, percentage-heavy and clock-based. A 7-year-old
   can't parse "passes need 10 minutes between them, next counts after 3:42 PM".
2. **The translator body was designed as an engineering tool** (confidence
   dial, commit speed in ms, holding meter in ms). In practice mode most of
   that is noise for a child. They need the target, the camera, and whether
   they got it.
3. **Percentages everywhere** (overall %, group %, "best so far 62%",
   "only at 64%"). Children read stars, fill and counts better than percentages.
4. **The target sign is shown as text only.** A child who doesn't know how
   to make "B" has nothing to copy. See Section 5, proposal P1.
5. **Failure feedback can feel like blame.** "That looked like "bad". Try
   again." is accurate, but when the *model* is the one that's wrong it
   tells the child they're wrong.
6. **Mastery has no moment.** A sign turning green on the dashboard after
   you've left the screen is the only reward.
7. **The tile grid is flat.** 133 word pills in one wrap with no sense of
   "start here, then this". The order is already deliberate (most reliable
   first) but nothing shows it.

## 3. Stay inside the design system (non-negotiable)

Childlike should come from **shape, scale, motion, copy and reward**, not
from a new palette or a cartoon skin.

**Keep:**

- **Graphite Aurora tokens** in `src/theme/theme.ts`. Use the token names
  (`accentCoral`, `primaryTeal`, `success`, `needsPractice`, `neuBase`,
  `neuWell`, `glassTint*`, ...), never raw hex in screens.
  - `accentCoral` (gold) is the **student accent**, the natural "star / reward" colour.
  - `success` green = got it; `needsPractice` red = **use sparingly with
    children**, prefer neutral or gold for "not yet".
- **Materials:** glass for surfaces (`GlassCard`, sheer or frosted),
  neumorphic raised/inset for controls (`neuRaised` / `neuInset` in
  `src/theme/shadows.ts`, never hand-rolled shadows),
  `GradientBackground variant="subtle"`.
- **Type:** `Baloo2` 700/600 for headings and big glyphs (already round and
  friendly, so lean on it at larger sizes), `Inter` for body. Use the
  `typography` scale. No new fonts unless you flag it as a proposal (it needs
  an `@expo-google-fonts/*` package + load change in `App.tsx`).
- **Shared components:** `ProgressBar` (the *only* progress bar, also used by
  teacher/admin views), `SegmentedToggle`, `DashboardShell`/`DashboardCard`,
  `CurriculumTabs`. Restyle or extend them through props. Don't create
  look-alike copies.
- **Spacing/radii scale:** `xs 4 · sm 8 · md 16 · lg 24 · xl 32 · xxl 48`,
  radii `sm 8 · md 16 · lg 24 · pill 999`.

**You may add** new semantic tokens (e.g. `starFilled`, `celebrationGlow`)
if they are derived from existing hues and named by role. List each one
with its value and reason, as the material-pass README did.

## 4. Hard constraints (engineering)

These are things a design must not require changing:

- **Progress rules are fixed** and come from `src/lib/curriculum.ts`:
  pass = target recognised at **≥80% confidence** (letters/numbers must hold
  it **0.5 s**); **mastered = 3 counted passes, each ≥10 minutes apart**,
  enforced in the database. Design how these are *explained*, not what
  they are.
- **One overall figure** (`computeOverall`, the mean of group fractions over
  available groups). Teachers and admins see the same number as the student. If
  you visualise it differently for children (stars, a path, a garden), the
  underlying value must stay the same and the teacher view must still be
  able to say "58%" about the same child.
- **Rewards must be truthful.** Every star, badge or celebration must map to
  real stored data (`attempts`, `passes`, `best_confidence`,
  `first_passed_at`, `last_passed_at`). **Streaks, daily goals, XP and
  collectibles need new data** and must be flagged as proposals (Section 5),
  not drawn as if they exist.
- **Unavailable groups stay visible and honest:** ASL Numbers, FSL Letters,
  FSL Numbers have no model. Show them as "coming soon", never as an empty
  list and never hidden.
- **Do not fork the translator screens.** Practice renders the real
  `LiveTranslatorScreen` / `WordTranslatorScreen` with `targetSign` +
  `onPracticeResult`. A simplified "practice layout" is fine, but it has to
  be a **prop-driven variant** of those screens (e.g. `variant="practice"`
  hiding the dial/commit-speed/holding-meter cells), not a copy. The
  camera and MediaPipe lifecycle in those files is fragile; see
  `useSharedLandmarkers.ts`.
- **Desktop translator layout** is `TranslatorPanel`, a fixed 1600×706
  composition scaled to fit. Practice-mode changes on desktop either fit
  inside that composition or replace bay contents via props.
- **Motion:** RN `Animated` only. No Lottie, no Framer Motion, no CSS
  animation libraries (adding one is a proposal). Respect reduced motion:
  every celebration needs a static equivalent.
- **No sound dependency.** Visual-first; any audio is optional and off by
  default or follows the existing speech setting.

## 5. Proposals we'd welcome (flag each as PROPOSAL)

**P1. A reference for the target sign.** The biggest learning gap. Options
in rough order of effort:
- a static illustration or SVG handshape per letter/number
- a short looping clip per word; the FSL-105 and ASL datasets in
  `ml/data/` contain real signer videos, but licensing must be checked
  before shipping clips
- the 3D signer (`SignerScreen`, `KamustaSign_3D_Signer_Roadmap.md`)
  performing the sign

Design the slot and its states (loading / not available for this sign)
even if the content comes later.

**P2. A practice variant of the translator.** Big target + reference on one
side, camera on the other, one large feedback area. Hide or collapse the
confidence dial, commit-speed and holding-meter controls (still reachable
for a teacher, e.g. behind a "grown-up settings" disclosure).

**P3. Three stars instead of "Passes: 1 of 3".** Each counted pass fills a
star (gold, `accentCoral`). All three = mastered. This maps 1:1 to
`passes`, with no new data.

**P4. A "hold it" ring instead of milliseconds.** For letters, the 0.5 s hold
could be a ring that fills around the target or the camera as the sign
holds. The live screen already tracks hold timing internally.

**P5. A friendly cooldown.** Replace "next pass counts after 3:42 PM" with
something a child gets: a resting star / sleeping icon with a simple
countdown ("ready again in 8 min"), or just "Come back later to earn your
next star!" while the exact time stays available to teachers.

**P6. A mastery celebration.** A short, skippable moment on the 3rd counted
pass (glass burst, star fill, big ✓). Static version for reduced motion.
Nothing on non-counting passes beyond a calm "Correct!".

**P7. Kind failure copy.** Distinguish "the computer wasn't sure" from
"that looked like a different sign", and never imply the child is bad at
it. Tips over verdicts: "Try moving your hand a bit closer to the camera",
"Keep your hand inside the box". Add a short, readable copy deck. English
first; consider Filipino/Cebuano variants as a proposal.

**P8. A path instead of a wall of tiles.** The Words list is already
ordered easiest-first. Show it as stages ("Start here" → "Next" → "Challenge"),
a path, or chunks of ~10, so a child sees what to do next. **The order
must stay the same**; it comes from
`ml/scripts/export_word_practice_order.py`.

**P9. "Next sign" flow.** After a pass, offer "Next sign →" so a child can
keep going without returning to the dashboard (the next not-mastered tile
in order).

**P10. Needs new data, design and label clearly as future:** daily streaks,
"signs practised today", badges for finishing a group, avatar/character.

## 6. Accessibility requirements

- **Tap targets ≥ 48×48** (current letter tiles are 52, word pills are
  ~40 tall, too small for young children).
- **WCAG AA contrast** on both the dark ground and frosted glass (frosted
  glass needs `textOnFrosted`, not `textPrimary`). Check gold-on-glass
  especially.
- **State never by colour alone.** Tile states need a shape/icon difference
  (empty / half / star / check), not just pale/gold/green.
- **Screen-reader labels** on every tile and control (tiles already have
  `accessibilityLabel`; keep it accurate if the visual changes).
- **Keyboard navigable** on web; visible focus ring (`focusRing` token).
- **Reduced motion** respected; nothing flashes more than 3×/sec.
- **Reading level:** short sentences, common words, icons with labels
  (not icons alone).

## 7. Deliverables

1. **Mockups** of the Student learning plan and the Practice screen
   (letters and words), **desktop 1180×740** and **mobile 390×844**, in the
   same HTML-reference format as `design_handoff_kamustasign_material_pass/`.
2. **Every state:** tile not-started / attempted (0–2 stars) / mastered;
   unavailable group; loading; save error; no class; practice waiting /
   trying / passed-counted / passed-cooldown / mastered / wrong / unsure /
   camera loading / camera error.
3. **Copy deck** for all student-facing text in these two screens (P7).
4. **Token additions** table (if any) and a component change list in RN
   terms (which existing component gets which prop), like the material-pass
   README's "RN implementation notes".
5. **Proposals** clearly separated from what can be built with today's data.

## 8. Out of scope

Teacher and admin dashboards (they keep the percentage-based view; just
don't break `ProgressBar` or `StudentProgressRow` for them), auth screens,
role select, the free Translator hub, video calls, and model accuracy itself.

## 9. Open questions for the team

- Practice copy language: English only, or English + Filipino/Cebuano?
- Is a character/mascot acceptable within the brand, or should rewards
  stay abstract (stars, glass, checkmarks)?
- Reference media (P1): who sources or approves sign illustrations/clips,
  and is dataset footage licensed for in-app use?
- Should children see percentages at all, or only stars/fill (with
  percentages kept for teachers)?
