# Handoff: classroom module as a fixed learning plan

Replace the teacher-authored assignment flow with a **fixed curriculum**, split by
sign language and tracked per sign group.

```
Classroom
├── ASL
│   ├── Letters   (A–Z)
│   ├── Numbers   (0–9)
│   └── Words     (133 signs)
└── FSL
    ├── Letters   — no model yet, see §2
    ├── Numbers   — no model yet, see §2
    └── Words     (105 signs)
```

Students work through a plan that already exists rather than waiting for a
teacher to create assignments. Teachers observe progress instead of authoring
content. This is substantially *less* code than the current module, and it ties
the translator to a purpose instead of leaving it a standalone demo.

> **Scope note for the team:** this module was previously slated for removal.
> Reinstating it as a fixed plan is a different, much smaller commitment than the
> assignment/submission/scoring flow that is in the manuscript now — but the
> manuscript still describes the old one, so the adviser conversation that is
> already pending needs to cover this too.

---

## 1. What exists today

| Piece | Where |
|---|---|
| Screens | `src/screens/dashboard/{Student,Teacher,Admin}Dashboard.tsx` |
| Shared chrome | `src/screens/dashboard/DashboardShell.tsx` (`DashboardCard`, `dashboardStyles`) |
| Data layer | `src/lib/queries.ts` |
| Schema | `supabase/migrations/0001_schema.sql`, RLS in `0002`–`0004` |

Current tables: `profiles` (id, full_name, role, class_id), `classes`,
`assignments` (teacher_id, class_id, target_sign, due_date), `submissions`
(assignment_id, student_id, video_url), `scores` (submission_id, predicted_sign,
is_correct, confidence).

**Do not drop the old tables in this change.** Build the new flow alongside,
switch the UI over, demo it working, and only then write a migration that drops
`assignments` / `submissions` / `scores`. Dropping them now means that if the new
flow isn't finished you have nothing to show.

## 2. The curriculum lives in code, not the database

Create `src/lib/curriculum.ts` as the single source of truth:

```ts
export type SignLanguage = "asl" | "fsl";
export type SignGroup = "letters" | "numbers" | "words";

export type GroupDefinition = {
  group: SignGroup;
  label: string;
  signs: string[];
  /** False when no trained model can grade this group yet. */
  available: boolean;
};
```

Build the sign lists from what already ships, so the plan can never promise a
lesson the app cannot grade:

- **ASL letters** — the 26 letters from `public/model/label_classes.json`
  (exclude `del`, `space`, `nothing`; those are UI affordances, not lessons)
- **ASL numbers** — `public/number-model/label_classes.json` once that model
  exists (see `NUMBERS_MODEL_GUIDE.md`); `available: false` until then
- **ASL words** — the 133 in `public/word-model/label_classes.json`
- **FSL words** — the 105 from FSL-105 once trained (see `FSL_MODEL_GUIDE.md`)
- **FSL letters / numbers** — **no model exists and none is planned.** Mark
  `available: false`

**Be honest in the UI about that gap.** An unavailable group should render as a
disabled tab with a short "not available yet" note, not as an empty lesson list
that looks broken. Do not hide it entirely either — the structure is part of the
design and a visible "coming soon" is clearer than a tab that silently isn't there.

Deriving the lists from the deployed `label_classes.json` files rather than
hardcoding them means the curriculum and the models can't drift apart.

### Ordering matters pedagogically

Within Words, don't list signs alphabetically. Order by the model's measured
per-class accuracy (run `ml/scripts/per_class_accuracy.py`) so students meet
reliable signs first. A beginner who fails three times on a sign the model only
recognises 30% of the time will blame themselves.

## 3. New schema

One table. Add it as `supabase/migrations/0005_lesson_progress.sql`:

```sql
create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  language text not null check (language in ('asl','fsl')),
  sign_group text not null check (sign_group in ('letters','numbers','words')),
  sign text not null,
  attempts integer not null default 0,
  passes integer not null default 0,
  best_confidence numeric(5,4) not null default 0
    check (best_confidence >= 0 and best_confidence <= 1),
  first_passed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (student_id, language, sign_group, sign)
);

create index lesson_progress_student_idx
  on public.lesson_progress (student_id, language, sign_group);
```

No curriculum table — totals come from `curriculum.ts`, so "7 of 26" is a
client-side count. That keeps one source of truth and avoids a seed migration
that would need re-running every time a model's vocabulary changes.

**RLS** (follow the patterns already in `0002_rls.sql`):
- a student may select/insert/update **only their own** rows
- a teacher may select rows for students whose `profiles.class_id` matches a
  class they own
- an admin may select all

Write it as `0006_lesson_progress_rls.sql`. Do not leave the table open.

## 4. Progress rules

Define these in one place and state them in the UI, because an invisible rule
feels like a bug:

- **Attempted** — the student practised the sign at least once
- **Passed** — recognised as the target sign at **≥ 80% confidence**
- **Mastered** — passed on **3 separate occasions**

Three passes rather than one because a single lucky frame is not learning, and
the letters model predicts continuously at ~30 fps — one frame of agreement is
nearly free. Count a pass at most once per practice session.

Group progress = mastered ÷ total signs in the group.

## 5. UI

### Nested tabs

Reuse `src/components/SegmentedToggle.tsx` — it already drives the
Letters/Numbers switch in `FingerspellingScreen` and the look should match.

```
StudentDashboard
  └─ OVERALL progress bar                      ← spans both languages, always visible
  └─ SegmentedToggle: ASL | FSL
       └─ SegmentedToggle: Letters | Numbers | Words   (disabled where unavailable)
            └─ GROUP progress bar  ("12 of 26 mastered")
            └─ grid of sign tiles: not-started / attempted / mastered
            └─ tapping a tile starts practice for that sign
```

Keep the existing `DashboardShell` / `DashboardCard` chrome so it stays visually
part of the app.

### Progress bars

Build **one** `src/components/ProgressBar.tsx` and use it in all three places
(student group, student overall, teacher/admin per-student). Three hand-rolled
bars will drift apart. Props: `value` 0–1, optional `label`, optional `caption`,
and a `tone` so a nearly-complete bar can read differently from an empty one.
Use the existing `neuInset` track / filled-pill treatment so it matches
`SegmentedToggle` and the camera panel rather than looking like a stock widget.

**Group bar** — sits directly above the sign grid, reads
`12 of 26 mastered · 46%`. Scoped to the selected language *and* group.

**Overall bar** — sits above the language tabs, because it spans both. Visible to
students, teachers (per student) and admins (per student).

### Two decisions the overall bar forces

**1. Unavailable groups must be excluded from the denominator.** FSL letters and
numbers have no model. If they count toward the total, a student can never reach
100% no matter how much they learn, and the number is a lie. Overall =
mastered ÷ signs in **available** groups only. When a group becomes available
later the denominator grows — that is correct, and the UI should not pretend
otherwise.

**2. Weight groups equally; do not pool raw counts.** ASL has 133 words against
26 letters and 10 numbers. Pooling counts means the whole bar is really "percent
of words", and mastering the entire alphabet moves it about 15%. Use the mean of
the group percentages instead:

```
overall = average( mastered/total for each AVAILABLE group, across both languages )
```

So a student who has finished ASL letters and nothing else shows meaningful
movement rather than a bar that looks stuck. **Label it** — "average across
groups" — because an unexplained percentage that doesn't match the visible
group numbers reads as a bug.

Practical note: with 133 words at the word model's real accuracy, mastering words
is slow. Pooled counts would leave the overall bar near zero through an entire
demo. This is partly a presentation decision and it is worth being deliberate
about it rather than discovering it the day before.

### Practice mode — the part that makes this a learning plan

A sign tile must lead somewhere. Add a practice route that opens the translator
**with a target sign**, and returns a result:

- Letters/Numbers → `LiveTranslatorScreen` with the matching `alphabet`, plus a
  `targetSign` prop. It already classifies every frame; practice mode compares
  the prediction to the target and records a pass at ≥80%.
- Words → `WordTranslatorScreen` with a `targetSign`; the student records a clip
  and the top prediction is compared.

Show the target prominently, give immediate feedback (correct / try again), and
write one `lesson_progress` upsert per attempt.

**Do not fork the translator screens to do this.** Add an optional `targetSign`
prop and a small results callback. A second copy of either screen will drift from
the original, and the camera and landmarker lifecycle in those files is already
delicate — see `useSharedLandmarkers.ts` for what went wrong last time two things
touched the MediaPipe graph.

### Teacher view

One row per student in the teacher's class:

```
Maria Santos    overall ██████░░░░ 58%    ASL  L 26/26  N 4/10  W 31/133
Jose Cruz       overall ███░░░░░░░ 31%    ASL  L 14/26  N 0/10  W 12/133
```

Same overall figure, same rule, same `ProgressBar` component as the student sees
— a teacher and a student discussing "your progress" must be looking at the same
number. Sortable by overall, so whoever is stuck surfaces without hunting.

Keep the language/group tabs here too, so a teacher can narrow to e.g. ASL
Numbers and see that column for the whole class.

### Admin view

Add a system-wide progress section alongside the existing user/class management
— that part is untouched. Admins see the same per-student overall bar, grouped
by class, plus a class-level average. This is the "is the system actually being
used" view rather than a teaching tool.

Admin RLS already selects all rows, so no extra policy is needed beyond §3.

## 6. Data layer

Add to `src/lib/queries.ts`, matching the existing style (return the Supabase
builder, let callers await):

```ts
getLessonProgress(studentId, language, group)
recordAttempt(studentId, language, group, sign, passed, confidence)
getMasteredCounts(studentId)                        // all languages+groups, for the overall bar
getClassProgressSummary(classId)                    // teacher view, one row per student
getAllClassesProgressSummary()                      // admin view
```

`getMasteredCounts` should return mastered counts keyed by language+group in a
**single** query — don't issue six round trips to fill one bar. Totals come from
`curriculum.ts`, so the percentage is computed client-side from those counts.

Put the overall-percentage maths in **one exported function** in `curriculum.ts`
(something like `computeOverall(masteredCounts)`), and call it from the student,
teacher and admin views alike. Three separate implementations of the weighting
rule will disagree eventually, and a teacher seeing a different number from the
student is worse than having no bar at all.

`recordAttempt` should be an upsert on the unique key that increments `attempts`,
conditionally increments `passes`, raises `best_confidence` only when the new
value is higher, and sets `first_passed_at` on the first pass. Do that in SQL (a
Postgres function or an `on conflict do update`), not by read-modify-write from
the client — two rapid attempts would otherwise race and lose one.

## 7. Don't break

- **The translator screens' camera and landmarker lifecycle.** `useSharedCameraStream`
  owns one stream; `useSharedLandmarkers` serialises graph creation because two
  MediaPipe graphs alive at once deadlock the WASM runtime. Practice mode must go
  through those same hooks.
- **`App.tsx` role routing.** Students/teachers/admins reach dashboards through it;
  the Translator is a separate role branch.
- **RLS.** Every new table gets policies in the same migration series.

## 8. Definition of done

1. A student sees ASL/FSL tabs, each with Letters/Numbers/Words, unavailable
   groups clearly disabled rather than empty or missing.
2. Tapping a sign opens practice with that target; a successful attempt updates
   progress and is visible after a refresh.
3. Mastery requires 3 passes at ≥80%, and the rule is stated in the UI.
4. A teacher sees per-student progress for their class, and only their class —
   verify by signing in as a teacher from a different class.
5. Old assignment UI is gone from the dashboards; the tables still exist, unused.
6. `npx tsc --noEmit` shows no new errors (there are 5 pre-existing).
7. Camera still works across Fingerspelling → Words → practice → back.
8. **The same student shows the same overall percentage in all three views**
   (student, teacher, admin). Check one real account in all three — this is the
   single likeliest thing to silently diverge.
9. Unavailable groups are excluded from the overall denominator: a student who
   masters every *available* sign reaches 100%, not 60-something.
10. One `ProgressBar` component, used in all three places.

## 9. Report back

- Which groups ended up `available: false`, so the demo script can avoid them
- Whether per-class-accuracy ordering was applied to the Words list
- Any RLS policy that needed a different shape than the existing ones
