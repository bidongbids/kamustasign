// Teacher: author a class's modules (0009_teacher_classroom.sql) - a named
// set of signs from one language + group of the curriculum, in the order the
// teacher picks them, with an optional due date - and see how far each
// student has got through each one. Students practice a module on the same
// screen as its group; "learned" is the curriculum's isMastered(), so the
// numbers here match the student's own tiles.
//
// Step 2 of "What they learn" (design T5-T7):
//  - module cards: up/down with a visible position, the due date as words
//    ("Due Sun, Nov 1 · in 5 days", gold within a week, red when overdue),
//    the class average and how many finished; Delete is in the ⋯ menu;
//  - the editor is a drawer in three numbered steps (name it, the kind of
//    signs, pick them): every sign on one side, the module's own ordered
//    list on the other; the picker starts on "In the class plan", tying
//    step 2 back to step 1;
//  - "Modules by category" previews what it will make before making it:
//    one module per part of speech in the plan, split into parts of at most
//    10 when a category is long, leaving out words already in a module.
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import SegmentedToggle from "../../components/SegmentedToggle";
import { ActionButton, ConfirmInline, SearchField, type NoticeState } from "./ManageKit";
import { CloseButton, Dialog, RowMenu, SideDrawer } from "./Overlays";
import { Bar } from "./TeacherToday";
import { LoadErrorCard } from "./TeacherStates";
import DatePickerField from "../../components/DatePickerField";
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  GridIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "../../components/icons/UiIcons";
import { fonts, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import {
  deleteModule,
  moduleSigns,
  saveClassPlan,
  saveModule,
  setModuleOrder,
  withLanguagePlan,
  type ClassRow,
  type ModuleDraft,
  type ModuleRow,
  type ProgressEmbed,
  type StudentProgressSummary,
} from "../../lib/queries";
import { CURRICULUM, getGroup, getLanguage, planSigns, type ClassPlan, type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { WORD_CATEGORIES, categoriesIn, evenChunks, filterByCategory, getWordCategory, type WordCategory } from "../../lib/wordCategories";
import { signName, signMatches } from "../../lib/signNames";
import { dueInfo, moduleCompletion, parseDay } from "../../lib/teacherInsights";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;
const PART_SIZE = 10;

const categoryRank = (c: WordCategory) => WORD_CATEGORIES.findIndex((x) => x.key === c);

/** The category most of a word module's signs belong to (ties go to the earlier one); null for letters/numbers. */
function mainCategory(m: ModuleRow): WordCategory | null {
  if (m.sign_group !== "words") return null;
  const cats = categoriesIn(m.language, moduleSigns(m));
  return cats.length ? cats.reduce((a, b) => (b.count > a.count ? b : a)).key : null;
}

const LANGUAGE_ORDER = CURRICULUM.map((l) => l.language);
const GROUP_ORDER: SignGroup[] = ["letters", "numbers", "words"];

/** "Sort by category": language, then group, then main category, then title ("Verbs 2" before "Verbs 10"). */
function compareModules(a: ModuleRow, b: ModuleRow): number {
  const rank = (m: ModuleRow) => {
    const c = mainCategory(m);
    return [LANGUAGE_ORDER.indexOf(m.language), GROUP_ORDER.indexOf(m.sign_group), c ? categoryRank(c) : -1];
  };
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return a.title.localeCompare(b.title, undefined, { numeric: true });
}

/** What the editor drawer opens with: a module to edit, or a new one (optionally pre-filled, e.g. "Make a module from these"). */
export type ModuleEditorState = {
  module: ModuleRow | null;
  preset?: { language: SignLanguage; group: SignGroup; signs: string[]; title?: string };
};

type Props = {
  klass: ClassRow;
  modules: ModuleRow[];
  loading: boolean;
  /** The list failed to load: an error card with Try again, not the empty state. */
  error?: boolean;
  reload: () => void;
  setModules: (next: ModuleRow[]) => void;
  students: StudentProgressSummary[];
  plan: ClassPlan;
  onPlanSaved: (plan: ClassPlan) => void;
  rowsFor: (language: SignLanguage, group: SignGroup) => Map<string, ProgressEmbed[]> | null;
  ensureGroup: (language: SignLanguage, group: SignGroup) => void;
  setNotice: (n: NoticeState) => void;
  editor: ModuleEditorState | null;
  setEditor: (e: ModuleEditorState | null) => void;
  planning: boolean;
  setPlanning: (open: boolean) => void;
  phone: boolean;
};

export default function TeacherModules(props: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { klass, modules, loading, setModules, setNotice, editor, setEditor, planning, setPlanning, phone } = props;
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    for (const m of modules) props.ensureGroup(m.language, m.sign_group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, props.ensureGroup]);

  // Optimistic: the list moves at once and goes back if saving fails.
  const reorder = async (next: ModuleRow[], message?: string) => {
    const prev = modules;
    setModules(next);
    setReordering(true);
    const { error } = await setModuleOrder(next.map((m) => m.id));
    setReordering(false);
    if (error) {
      setModules(prev);
      setNotice({ kind: "error", message: error.message });
    } else if (message) {
      setNotice({ kind: "success", message });
    }
  };

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= modules.length) return;
    const next = [...modules];
    [next[i], next[j]] = [next[j], next[i]];
    void reorder(next);
  };

  const drawers = (
    <>
      <ModuleEditorDrawer
        klass={klass}
        state={editor}
        nextPosition={modules.length}
        plan={props.plan}
        onPlanSaved={props.onPlanSaved}
        setNotice={setNotice}
        onClose={(saved) => {
          setEditor(null);
          if (saved) props.reload();
        }}
      />
      <ModulesByCategoryDialog
        visible={planning}
        klass={klass}
        modules={modules}
        plan={props.plan}
        setNotice={setNotice}
        onClose={(created) => {
          setPlanning(false);
          if (created) props.reload();
        }}
      />
    </>
  );

  if (loading && modules.length === 0) {
    return (
      <View style={[styles.card, styles.pad]}>
        <Text style={styles.muted}>Loading modules…</Text>
        {drawers}
      </View>
    );
  }

  if (props.error && modules.length === 0) {
    return (
      <View style={[styles.card, styles.pad]}>
        <LoadErrorCard compact title="Couldn't load the modules" onRetry={props.reload} />
        {drawers}
      </View>
    );
  }

  if (modules.length === 0) {
    return (
      <View style={[styles.card, styles.empty]}>
        <View style={[styles.emptyIcon, shadows.neuRaised("sm")]}>
          <GridIcon size={24} color={colors.primaryTealText} />
        </View>
        <Text style={styles.emptyTitle}>No modules yet</Text>
        <Text style={styles.emptyBody}>
          A module is a set of signs to learn in order, like “Greetings” or “Family words”. Students see it on their dashboard.
        </Text>
        <View style={styles.row8}>
          <ActionButton label="New module" variant="primary" size="md" icon={(c) => <PlusIcon size={14} color={c} />} onPress={() => setEditor({ module: null })} />
          <ActionButton label="Modules by category…" size="md" onPress={() => setPlanning(true)} />
        </View>
        {drawers}
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {modules.map((m, i) => (
        <ModuleCard
          key={m.id}
          module={m}
          index={i}
          {...props}
          onEdit={() => setEditor({ module: m })}
          onDeleted={props.reload}
          onMoveUp={i > 0 && !reordering ? () => move(i, -1) : undefined}
          onMoveDown={i < modules.length - 1 && !reordering ? () => move(i, 1) : undefined}
          phone={phone}
        />
      ))}
      <View style={styles.footNote}>
        <Text style={[styles.muted, styles.flex]}>Delete is in each module's ⋯ menu. Students keep the progress they made; only the module goes.</Text>
        {modules.length > 1 ? (
          <ActionButton
            label="Sort by category"
            variant="ghost"
            disabled={reordering}
            onPress={() => void reorder([...modules].sort(compareModules), "Sorted by language and category. Students see your modules in this order.")}
          />
        ) : null}
      </View>
      {drawers}
    </View>
  );
}

// ── module card ─────────────────────────────────────────────────────────

function ModuleCard({
  module: m,
  index,
  students,
  rowsFor,
  setNotice,
  onEdit,
  onDeleted,
  onMoveUp,
  onMoveDown,
  phone,
}: Props & {
  module: ModuleRow;
  index: number;
  onEdit: () => void;
  onDeleted: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const signs = moduleSigns(m);
  const rows = rowsFor(m.language, m.sign_group);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ids = useMemo(() => students.map((s) => s.id), [students]);
  const done = moduleCompletion(signs, ids, rows, m.created_at);
  const due = dueInfo(m.due_date);

  const remove = async () => {
    setDeleting(true);
    const { error } = await deleteModule(m.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return;
    }
    setNotice({ kind: "success", message: `Deleted "${m.title}". Students keep the progress they made.` });
    onDeleted();
  };

  const arrow = (dir: "up" | "down", onPress?: () => void) => (
    <Pressable
      onPress={() => onPress?.()}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Move ${m.title} ${dir === "up" ? "earlier" : "later"}`}
      accessibilityState={{ disabled: !onPress }}
      style={[styles.arrow, shadows.neuRaised("sm"), !onPress && styles.disabled, webCursor]}
    >
      {dir === "up" ? <ChevronUpIcon size={16} color={colors.textPrimary} /> : <ChevronDownIcon size={16} color={colors.textPrimary} />}
    </Pressable>
  );

  return (
    <View style={[styles.card, styles.moduleCard]}>
      <View style={[styles.moduleRow, phone && styles.moduleRowPhone]}>
        <View style={styles.order}>
          <View style={styles.arrows}>
            {arrow("up", onMoveUp)}
            {arrow("down", onMoveDown)}
          </View>
          <Text style={styles.position} accessibilityLabel={`Position ${index + 1}`}>
            {index + 1}
          </Text>
        </View>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text style={styles.moduleTitle}>{m.title}</Text>
            <Text style={styles.moduleMeta}>
              {getLanguage(m.language).label} {getGroup(m.language, m.sign_group).label} · {signs.length} sign{signs.length === 1 ? "" : "s"}
            </Text>
            <DueChip date={m.due_date} />
          </View>
          {m.description ? <Text style={styles.description}>{m.description}</Text> : null}
          <View style={styles.signs}>
            {signs.slice(0, 14).map((s) => (
              <View key={s} style={[styles.signPill, m.sign_group !== "words" && styles.signRound]}>
                <Text style={styles.signPillText}>{signName(m.language, s)}</Text>
              </View>
            ))}
            {signs.length > 14 ? <Text style={styles.muted}>+{signs.length - 14} more</Text> : null}
          </View>
          <View style={styles.progressRow} accessible accessibilityLabel={rows ? `Class average ${Math.round(done.average * 100)}%. ${done.finished} of ${students.length} finished` : "Loading progress"}>
            <View style={styles.flex}>
              <Bar value={rows ? done.average : 0} height={8} />
            </View>
            <Text style={styles.pct}>{rows ? `${Math.round(done.average * 100)}%` : "…"}</Text>
            <Text style={styles.finished}>
              {done.finished} of {students.length} finished
            </Text>
          </View>
        </View>
        <View style={styles.cardActions}>
          <ActionButton label={open ? "Hide students" : "Students"} size="md" icon={(c) => <UsersIcon size={16} color={c} />} onPress={() => setOpen((v) => !v)} />
          <ActionButton label="Edit" size="md" icon={(c) => <PencilIcon size={16} color={c} />} onPress={onEdit} />
          <RowMenu
            label={`More for ${m.title}`}
            size={44}
            items={[{ key: "delete", label: "Delete module…", destructive: true, icon: (c) => <TrashIcon size={16} color={c} />, onPress: () => setConfirmDelete(true) }]}
          />
        </View>
      </View>

      {confirmDelete ? (
        <ConfirmInline
          message={`Delete "${m.title}"? Students' progress on its signs is kept - only the module goes.`}
          confirmLabel="Delete module"
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
          busy={deleting}
        />
      ) : null}

      {open ? (
        <View style={styles.panel}>
          {students.length === 0 ? (
            <Text style={styles.muted}>No students in this class yet.</Text>
          ) : (
            [...students]
              .sort((a, b) => (done.perStudent.get(a.id) ?? 0) - (done.perStudent.get(b.id) ?? 0) || a.full_name.localeCompare(b.full_name))
              .map((s) => {
                const n = done.perStudent.get(s.id) ?? 0;
                return (
                  <View key={s.id} style={styles.studentRow} accessible accessibilityLabel={`${s.full_name}: ${n} of ${signs.length} learned`}>
                    <Text style={styles.studentName} numberOfLines={1}>
                      {s.full_name || "(no name)"}
                    </Text>
                    <View style={styles.flex}>
                      <Bar value={signs.length ? n / signs.length : 0} height={6} />
                    </View>
                    <Text style={styles.finished}>
                      {n} of {signs.length}
                    </Text>
                  </View>
                );
              })
          )}
          <Text style={styles.caption}>Lowest first, so whoever needs help is at the top.</Text>
        </View>
      ) : null}
    </View>
  );
}

/** "Due Sun, Nov 1 · in 5 days" (gold within a week), "Overdue · was due Oct 20" (red), "No due date". */
export function DueChip({ date }: { date: string | null }) {
  const { colors, name } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const d = dueInfo(date);
  const tone =
    d.tone === "overdue"
      ? { border: "rgba(255,122,133,0.6)", bg: "rgba(224,82,95,0.12)", text: colors.needsPracticeText }
      : d.tone === "soon"
        ? { border: "rgba(242,178,62,0.6)", bg: "rgba(242,178,62,0.1)", text: colors.accentCoralText }
        : { border: name === "dark" ? "rgba(255,255,255,0.18)" : colors.border, bg: "transparent", text: colors.textOnGlass };
  return (
    <View style={[styles.dueChip, { borderColor: tone.border, backgroundColor: tone.bg }]} accessible accessibilityLabel={d.text}>
      {d.tone === "overdue" ? <AlertCircleIcon size={13} color={tone.text} /> : <CalendarIcon size={13} color={tone.text} />}
      <Text style={[styles.dueText, { color: tone.text }]}>{d.text}</Text>
    </View>
  );
}

// ── editor drawer ───────────────────────────────────────────────────────
// Three numbered steps, top to bottom: name it, choose the kind of signs,
// pick the signs. Picking is two columns on a wide screen - every sign on
// the left (tap to add), the module's own list on the right in the order
// students will practice it (move up / down, remove) - and one under the
// other on a narrow one. Save is pinned at the bottom.

function ModuleEditorDrawer({
  klass,
  state,
  nextPosition,
  plan,
  onPlanSaved,
  setNotice,
  onClose,
}: {
  klass: ClassRow;
  state: ModuleEditorState | null;
  nextPosition: number;
  plan: ClassPlan;
  onPlanSaved: (plan: ClassPlan) => void;
  setNotice: (n: NoticeState) => void;
  onClose: (saved: boolean) => void;
}) {
  return (
    <SideDrawer visible={!!state} onClose={() => onClose(false)} width={EDITOR_W} bare>
      {state ? (
        <ModuleForm
          key={state.module?.id ?? `new-${state.preset?.signs.join(",") ?? ""}`}
          klass={klass}
          state={state}
          nextPosition={nextPosition}
          plan={plan}
          onPlanSaved={onPlanSaved}
          setNotice={setNotice}
          onClose={onClose}
        />
      ) : null}
    </SideDrawer>
  );
}

const EDITOR_W = 980;
// "Add all" only for a short list (letters, a category, a search): never 300 words by one slip.
const ADD_ALL_MAX = 40;

function ModuleForm({
  klass,
  state,
  nextPosition,
  plan,
  onPlanSaved,
  setNotice,
  onClose,
}: {
  klass: ClassRow;
  state: ModuleEditorState;
  nextPosition: number;
  plan: ClassPlan;
  onPlanSaved: (plan: ClassPlan) => void;
  setNotice: (n: NoticeState) => void;
  onClose: (saved: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { width: W } = useWindowDimensions();
  const phone = W < 768;
  // The drawer's own width (SideDrawer: full width on a phone, else up to EDITOR_W).
  const panelW = phone ? W : Math.min(EDITOR_W, W - 48);
  const twoCol = panelW >= 820;
  const m = state.module;
  const preset = state.preset;
  const [title, setTitle] = useState(m?.title ?? preset?.title ?? "");
  const [description, setDescription] = useState(m?.description ?? "");
  const [language, setLanguage] = useState<SignLanguage>(m?.language ?? preset?.language ?? "asl");
  const [group, setGroup] = useState<SignGroup>(m?.sign_group ?? preset?.group ?? "words");
  const [due, setDue] = useState(m?.due_date ?? "");
  const [picked, setPicked] = useState<string[]>(m ? moduleSigns(m) : preset?.signs ?? []);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<WordCategory | null>(null);
  const [inPlanOnly, setInPlanOnly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const [addingToPlan, setAddingToPlan] = useState(false);
  const [confirmScope, setConfirmScope] = useState<{ language: SignLanguage; group: SignGroup } | null>(null);

  const lang = getLanguage(language);
  const groupDef = getGroup(language, group);
  const isWords = group === "words";
  const kindWord = groupDef.label.toLowerCase(); // "letters", "numbers", "words"
  const planned = useMemo(() => new Set(planSigns(language, group, plan)), [language, group, plan]);
  const plannedCount = groupDef.signs.filter((s) => planned.has(s)).length;
  const source = isWords && inPlanOnly ? groupDef.signs.filter((s) => planned.has(s)) : groupDef.signs;
  const categories = isWords ? categoriesIn(language, source) : [];
  const pickedSet = new Set(picked);
  const visible = filterByCategory(language, source, isWords ? category : null).filter((s) => signMatches(language, s, search));
  const notPickedVisible = visible.filter((s) => !pickedSet.has(s));
  const notInPlan = isWords ? picked.filter((s) => !planned.has(s)) : [];
  const titleMissing = !title.trim();
  const signsMissing = picked.length === 0;
  const dueValid = !due || parseDay(due) !== null;
  const canSave = !titleMissing && !signsMissing && dueValid && groupDef.available;
  const name = (s: string) => signName(language, s);

  // A module's signs all come from one kind, so switching starts a fresh
  // list - after a confirm when there is a list to lose.
  const applyScope = (l: SignLanguage, g: SignGroup) => {
    setLanguage(l);
    setGroup(resolveGroup(l, g));
    setPicked([]);
    setCategory(null);
    setSearch("");
    setConfirmScope(null);
  };
  const changeScope = (l: SignLanguage, g: SignGroup) => {
    if (l === language && g === group) return;
    if (picked.length > 0) setConfirmScope({ language: l, group: g });
    else applyScope(l, g);
  };

  const toggle = (sign: string) => setPicked((prev) => (prev.includes(sign) ? prev.filter((s) => s !== sign) : [...prev, sign]));
  const move = (i: number, delta: number) =>
    setPicked((prev) => {
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const addAllShown = () => setPicked((prev) => [...prev, ...notPickedVisible]);
  const sortByCategory = () =>
    setPicked((prev) =>
      prev
        .map((s, i) => ({ s, i, r: categoryRank(getWordCategory(language, s)) }))
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map((x) => x.s)
    );

  const addToPlan = async (words: string[]) => {
    setAddingToPlan(true);
    const every = getGroup(language, "words").signs;
    const nextSet = new Set([...planSigns(language, "words", plan), ...words]);
    const signs = nextSet.size >= every.length ? null : every.filter((s) => nextSet.has(s));
    const off = plan.off?.[language] ?? [];
    const { error } = await saveClassPlan(klass.id, language, signs, off);
    setAddingToPlan(false);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return;
    }
    onPlanSaved(withLanguagePlan(plan, language, signs, off));
  };

  const save = async () => {
    setTried(true);
    if (!canSave) return;
    setSaving(true);
    const draft: ModuleDraft & { position?: number } = {
      title: title.trim(),
      description: description.trim() || null,
      language,
      sign_group: group,
      due_date: due || null,
    };
    if (!m) draft.position = nextPosition;
    const { error } = await saveModule(klass.id, draft, picked, m?.id);
    setSaving(false);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return;
    }
    setNotice({ kind: "success", message: `${m ? "Saved" : "Created"} "${draft.title}" for ${klass.name}.` });
    onClose(true);
  };

  const picker = (
    <View style={[styles.pickCol, twoCol && styles.flex]}>
      <Text style={styles.colTitle}>
        All {isWords && inPlanOnly ? "words in the plan" : kindWord}
      </Text>
      <SearchField value={search} onChangeText={setSearch} placeholder={`Search ${kindWord}`} />
      {isWords ? (
        <>
          <SegmentedToggle
            kind="radio"
            inline
            size="sm"
            accessibilityLabel="Which words to show"
            options={[
              { key: "plan", label: "In the class plan", count: String(plannedCount) },
              { key: "all", label: "All words", count: String(groupDef.signs.length) },
            ]}
            value={inPlanOnly ? "plan" : "all"}
            onChange={(k) => {
              setInPlanOnly(k === "plan");
              setCategory(null);
            }}
          />
          {categories.length > 1 ? (
            <View style={styles.catRow} accessibilityRole="radiogroup" accessibilityLabel="Kind of word">
              {[{ key: null as WordCategory | null, label: "Every kind" }, ...categories.map((c) => ({ key: c.key as WordCategory | null, label: c.label }))].map((c) => {
                const on = category === c.key;
                return (
                  <Pressable
                    key={c.label}
                    onPress={() => setCategory(c.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={({ hovered }: any) => [styles.catPill, on ? styles.catPillOn : styles.catPillOff, hovered && !on && styles.hover, webCursor]}
                  >
                    <Text style={[styles.catText, on && styles.catTextOn]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}
      <View style={styles.pickBar}>
        <Text style={[styles.edMuted, styles.flex]}>
          {visible.length === 0 ? "" : notPickedVisible.length === 0 ? "All of these are in the module." : `Tap to add. ${notPickedVisible.length} not added yet.`}
        </Text>
        {notPickedVisible.length > 1 && notPickedVisible.length <= ADD_ALL_MAX ? (
          <ActionButton label={`Add all ${notPickedVisible.length}`} size="sm" icon={(c) => <PlusIcon size={13} color={c} />} onPress={addAllShown} />
        ) : null}
      </View>
      <ScrollView style={[styles.chipScroll, !twoCol && styles.chipScrollNarrow]} contentContainerStyle={styles.signChips} nestedScrollEnabled>
        {visible.map((s) => {
          const on = pickedSet.has(s);
          return (
            <Pressable
              key={s}
              onPress={() => toggle(s)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={on ? `${name(s)}, in the module. Tap to take it out` : `Add ${name(s)}`}
              style={({ hovered }: any) => [styles.signChip, !isWords && styles.signChipLetter, on ? styles.signChipOn : styles.signChipOff, hovered && !on && styles.hover, webCursor]}
            >
              {on ? <CheckIcon size={13} color={colors.textOnPrimary} strokeWidth={3} /> : <PlusIcon size={13} color={colors.textSecondary} />}
              <Text style={[styles.signChipText, on && styles.signChipTextOn]}>{name(s)}</Text>
            </Pressable>
          );
        })}
        {visible.length === 0 ? (
          <Text style={styles.edMuted}>
            {isWords && inPlanOnly && planned.size === 0 ? "No words in the class plan yet. Choose All words, or add words in step 1 of What they learn." : "No signs match."}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );

  const selected = (
    <View style={[styles.selCol, twoCol && styles.selColWide]}>
      <View style={styles.selHead}>
        <Text style={[styles.colTitle, styles.flex]}>
          In this module <Text style={styles.selCount}>· {picked.length}</Text>
        </Text>
        {picked.length > 0 ? <ActionButton label="Remove all" size="sm" variant="ghost" onPress={() => setPicked([])} /> : null}
      </View>
      <Text style={styles.edMuted}>Students practice them in this order.</Text>
      {picked.length === 0 ? (
        <View style={[styles.selEmpty, tried && styles.selEmptyProblem]}>
          <Text style={styles.selEmptyText}>{tried ? "Pick at least one sign." : `No ${kindWord} yet. Tap ${kindWord} ${twoCol ? "on the left" : "above"} to add them here.`}</Text>
        </View>
      ) : (
        <ScrollView style={[styles.selScroll, !twoCol && styles.selScrollNarrow]} nestedScrollEnabled>
          {picked.map((s, i) => (
            <View key={s} style={[styles.selRow, i > 0 && styles.selRule]}>
              <Text style={styles.selNo}>{i + 1}</Text>
              <Text style={styles.selName} numberOfLines={1}>
                {name(s)}
              </Text>
              {isWords && !planned.has(s) ? <Text style={styles.selFlag}>not in plan</Text> : null}
              <RowBtn label={`Move ${name(s)} up`} disabled={i === 0} onPress={() => move(i, -1)}>
                <ChevronUpIcon size={15} color={colors.textPrimary} />
              </RowBtn>
              <RowBtn label={`Move ${name(s)} down`} disabled={i === picked.length - 1} onPress={() => move(i, 1)}>
                <ChevronDownIcon size={15} color={colors.textPrimary} />
              </RowBtn>
              <RowBtn label={`Remove ${name(s)}`} onPress={() => toggle(s)}>
                <CloseIcon size={13} color={colors.textPrimary} />
              </RowBtn>
            </View>
          ))}
        </ScrollView>
      )}
      {isWords && picked.length > 1 ? (
        <ActionButton label="Sort by kind of word" size="sm" variant="ghost" onPress={sortByCategory} style={styles.selfStart} />
      ) : null}
      {notInPlan.length > 0 ? (
        <View style={styles.planWarn}>
          <AlertCircleIcon size={16} color={colors.accentCoralText} />
          <Text style={[styles.warnText, styles.flex]}>
            {notInPlan.length === 1 ? `‘${name(notInPlan[0])}’ isn't` : `${notInPlan.length} words aren't`} in the class plan, so{" "}
            {notInPlan.length === 1 ? "it won't" : "they won't"} count toward overall progress.
          </Text>
          <ActionButton label="Add to plan" size="sm" loading={addingToPlan} onPress={() => void addToPlan(notInPlan)} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.flex}>
      <View style={[styles.editorHead, phone && styles.editorHeadPhone]}>
        <View style={styles.flex}>
          <Text style={styles.edTitle} accessibilityRole="header">
            {m ? `Edit “${m.title}”` : "New module"}
          </Text>
          <Text style={styles.edSub}>A module is a list of signs for the class to practice in order. Students see it on their dashboard.</Text>
        </View>
        <CloseButton onPress={() => onClose(false)} />
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={[styles.form, phone ? styles.formPadPhone : styles.formPad]} keyboardShouldPersistTaps="handled">
        <Step n={1} title="Name it">
          <View style={styles.fieldRow}>
            <View style={[styles.flex, styles.minField]}>
              <Text style={styles.edLabel}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Greetings"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Module title"
                style={[styles.edInput, tried && titleMissing && styles.edInputProblem]}
                autoFocus={!m && !phone}
              />
              {tried && titleMissing ? <Problem text="Add a title." /> : null}
            </View>
            <View style={styles.dueCol}>
              <Text style={styles.edLabel}>
                Due date <Text style={styles.optional}>(optional)</Text>
              </Text>
              <DatePickerField value={due} onChange={setDue} label="Due date" />
            </View>
          </View>
          <View>
            <Text style={styles.edLabel}>
              Description <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What students will learn"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Module description"
              style={styles.edInput}
            />
          </View>
        </Step>

        <Step n={2} title="Choose the kind of signs" hint="One module, one kind of sign.">
          <View style={styles.scopeRow}>
            <View style={styles.scopeGroup}>
              <Text style={styles.edLabel}>Sign language</Text>
              <SegmentedToggle
                kind="radio"
                inline
                size="md"
                accessibilityLabel="Sign language"
                options={CURRICULUM.map((l) => ({ key: l.language, label: l.label }))}
                value={language}
                onChange={(l) => changeScope(l, group)}
              />
            </View>
            <View style={styles.scopeGroup}>
              <Text style={styles.edLabel}>Kind</Text>
              <SegmentedToggle
                kind="radio"
                inline
                size="md"
                accessibilityLabel="Kind of sign"
                options={lang.groups.map((g) => ({ key: g.group, label: g.label, disabled: !g.available, badge: g.available ? undefined : ("soon" as const) }))}
                value={group}
                onChange={(g) => changeScope(language, g)}
              />
            </View>
          </View>
          {confirmScope ? (
            <ConfirmInline
              message={`Switch to ${getLanguage(confirmScope.language).label} ${getGroup(confirmScope.language, resolveGroup(confirmScope.language, confirmScope.group)).label.toLowerCase()}? The ${picked.length} sign${picked.length === 1 ? "" : "s"} picked so far will be taken out.`}
              confirmLabel="Switch"
              onConfirm={() => applyScope(confirmScope.language, confirmScope.group)}
              onCancel={() => setConfirmScope(null)}
            />
          ) : null}
        </Step>

        <Step n={3} title="Pick the signs">
          <View style={[styles.pickArea, twoCol && styles.pickAreaWide]}>
            {picker}
            {selected}
          </View>
        </Step>
      </ScrollView>
      {/* Pinned, so Save is always in reach however long the sign list is. */}
      <View style={[styles.formFootPinned, phone && styles.formFootPhone]}>
        {tried && !canSave ? (
          <Text style={[styles.edProblemText, styles.flex]}>{titleMissing ? "Add a title (step 1)." : signsMissing ? "Pick at least one sign (step 3)." : !dueValid ? "Check the due date." : ""}</Text>
        ) : (
          <Text style={[styles.edMuted, styles.flex]} numberOfLines={1}>
            {picked.length ? `${picked.length} ${picked.length === 1 ? groupNoun(group) : kindWord} · ${lang.label}` : ""}
          </Text>
        )}
        <ActionButton label="Cancel" size="lg" variant="ghost" onPress={() => onClose(false)} disabled={saving} />
        <ActionButton label={m ? "Save module" : "Create module"} size="lg" variant="primary" onPress={save} loading={saving} />
      </View>
    </View>
  );
}

/** `g` in language `l`, or the language's first group that has a model. */
function resolveGroup(l: SignLanguage, g: SignGroup): SignGroup {
  const groups = getLanguage(l).groups;
  return groups.find((x) => x.group === g && x.available)?.group ?? groups.find((x) => x.available)?.group ?? g;
}

const groupNoun = (g: SignGroup) => (g === "letters" ? "letter" : g === "numbers" ? "number" : "word");

/** A numbered step of the editor: "1  Name it". */
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const { width: W } = useWindowDimensions();
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={styles.stepNo}>
          <Text style={styles.stepNoText}>{n}</Text>
        </View>
        <Text style={styles.stepTitle} accessibilityRole="header">
          {title}
        </Text>
        {hint ? <Text style={styles.stepHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.stepBody, W >= 768 && styles.stepBodyIndent]}>{children}</View>
    </View>
  );
}

function RowBtn({ label, disabled, onPress, children }: { label: string; disabled?: boolean; onPress: () => void; children: React.ReactNode }) {
  const { shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => [styles.rowBtn, !disabled && shadows.neuRaised("sm"), disabled && styles.disabled, pressed && styles.pressed, webCursor]}
    >
      {children}
    </Pressable>
  );
}

function Problem({ text }: { text: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.problem} accessibilityLiveRegion="polite">
      <AlertCircleIcon size={14} color={colors.needsPracticeText} />
      <Text style={styles.edProblemText}>{text}</Text>
    </View>
  );
}

// ── Modules by category (T7) ────────────────────────────────────────────

type Planned = { category: WordCategory; label: string; parts: string[][] };
const signCount = (n: number) => `${n} sign${n === 1 ? "" : "s"}`;

function ModulesByCategoryDialog({
  visible,
  klass,
  modules,
  plan,
  setNotice,
  onClose,
}: {
  visible: boolean;
  klass: ClassRow;
  modules: ModuleRow[];
  plan: ClassPlan;
  setNotice: (n: NoticeState) => void;
  onClose: (created: boolean) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const wordLanguages = CURRICULUM.filter((l) => l.groups.some((g) => g.group === "words" && g.available));
  const [language, setLanguage] = useState<SignLanguage>(wordLanguages[0]?.language ?? "asl");
  const [saving, setSaving] = useState(false);
  const [made, setMade] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const langLabel = getLanguage(language).label;

  // Words in the plan that aren't in a module yet, by part of speech.
  const used = new Set(modules.filter((m) => m.language === language && m.sign_group === "words").flatMap((m) => moduleSigns(m)));
  const pool = planSigns(language, "words", plan).filter((s) => !used.has(s));
  const planned: Planned[] = WORD_CATEGORIES.map((c) => ({ category: c.key, label: c.label, parts: evenChunks(filterByCategory(language, pool, c.key), PART_SIZE) })).filter(
    (p) => p.parts.length > 0
  );
  const total = planned.reduce((n, p) => n + p.parts.length, 0);
  const shown = showAll ? planned : planned.slice(0, 5);
  const hidden = planned.slice(shown.length);

  const titleOf = (p: Planned, i: number) => (p.parts.length > 1 ? `${p.label} ${i + 1}` : p.label);

  const create = async () => {
    if (total === 0) return;
    setSaving(true);
    setMade(0);
    let i = 0;
    for (const p of planned) {
      for (let k = 0; k < p.parts.length; k++) {
        const draft: ModuleDraft & { position: number } = {
          title: titleOf(p, k),
          description:
            p.parts.length > 1 ? `${langLabel} ${p.label.toLowerCase()}, part ${k + 1} of ${p.parts.length}.` : `${langLabel} ${p.label.toLowerCase()}.`,
          language,
          sign_group: "words",
          due_date: null,
          position: modules.length + i,
        };
        const { error } = await saveModule(klass.id, draft, p.parts[k]);
        if (error) {
          setSaving(false);
          setNotice({ kind: "error", message: `Made ${i} of ${total} modules, then "${draft.title}" failed: ${error.message}` });
          onClose(i > 0);
          return;
        }
        i += 1;
        setMade(i);
      }
    }
    setSaving(false);
    setNotice({ kind: "success", message: `Made ${total} module${total === 1 ? "" : "s"} for ${klass.name}. Edit any of them to change signs or add a due date.` });
    onClose(true);
  };

  return (
    <Dialog visible={visible} onClose={() => !saving && onClose(false)} width={720}>
      <Text style={styles.formTitle} accessibilityRole="header">
        Make modules by category
      </Text>
      <Text style={[styles.dialogBody]}>
        One module for each part of speech in the plan, split into parts when a category is long. Your existing modules aren't changed.
      </Text>
      {wordLanguages.length > 1 ? (
        <View style={styles.pillRow} accessibilityRole="radiogroup">
          {wordLanguages.map((l) => (
            <Pressable
              key={l.language}
              onPress={() => {
                setLanguage(l.language);
                setShowAll(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: l.language === language }}
              style={[styles.fPill, l.language === language ? styles.fPillOn : styles.fPillOff, webCursor]}
            >
              <Text style={[styles.fPillText, l.language === language && styles.fPillTextOn]}>{l.label} Words</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.preview}>
        {planned.length === 0 ? (
          <Text style={styles.formMuted}>
            {planSigns(language, "words", plan).length === 0
              ? `There are no ${langLabel} words in the plan yet.`
              : `Every ${langLabel} word in the plan is already in a module.`}
          </Text>
        ) : null}
        {shown.map((p, i) => (
          <View key={p.category} style={[styles.previewRow, i > 0 && styles.previewRule]}>
            <Text style={[styles.previewCat, styles.flex]}>{p.label}</Text>
            <Text style={[styles.previewMid, styles.flex]}>
              {p.parts.length === 1 ? "1 module" : `${titleOf(p, 0)} – ${titleOf(p, p.parts.length - 1)}`}
            </Text>
            <Text style={styles.previewN}>{signCount(p.parts.flat().length)}</Text>
          </View>
        ))}
        {hidden.length ? (
          <Pressable onPress={() => setShowAll(true)} accessibilityRole="button" style={[styles.previewRow, styles.previewRule, webCursor]}>
            <Text style={[styles.previewCat, styles.flex]}>
              + {hidden.length} more categor{hidden.length === 1 ? "y" : "ies"}
            </Text>
            <Text style={[styles.previewMid, styles.flex]}>
              {hidden.reduce((n, p) => n + p.parts.length, 0)} modules
            </Text>
            <Text style={styles.previewN}>{signCount(hidden.reduce((n, p) => n + p.parts.flat().length, 0))}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.formFoot}>
        <ActionButton label="Cancel" size="lg" variant="ghost" onFrosted style={styles.outlineDark} onPress={() => onClose(false)} disabled={saving} />
        <ActionButton
          label={saving ? `Making ${made + 1} of ${total}…` : total ? `Create ${total} module${total === 1 ? "" : "s"}` : "Create modules"}
          size="lg"
          variant="primary"
          onPress={create}
          disabled={total === 0 || saving}
        />
      </View>
    </Dialog>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pad: { padding: 20 },
  row8: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  disabled: { opacity: 0.4 },
  list: { gap: 16 },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.name === "dark" ? "rgba(255,255,255,0.1)" : colors.border,
    backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.05)" : colors.surface,
  },
  muted: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnGlass },
  caption: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnGlass, marginTop: 8 },
  empty: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 12 },
  emptyIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.textPrimary },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textOnGlass, textAlign: "center", maxWidth: 440 },
  moduleCard: { padding: 18, gap: 12 },
  moduleRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  moduleRowPhone: { flexWrap: "wrap" },
  order: { flexDirection: "row", alignItems: "center", gap: 10 },
  arrows: { gap: 10 },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  position: { width: 22, textAlign: "center", fontFamily: fonts.heading, fontSize: 20, color: colors.textOnGlass },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  moduleTitle: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.textPrimary },
  moduleMeta: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textOnGlass },
  description: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnGlass, marginTop: 4 },
  signs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 10 },
  signPill: { minHeight: 30, paddingHorizontal: 12, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuWell },
  signRound: { minWidth: 30, paddingHorizontal: 8 },
  signPillText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  pct: { width: 44, textAlign: "right", fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  finished: { fontFamily: fonts.body, fontSize: 13, color: colors.textOnGlass },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  dueChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, borderWidth: 1.5 },
  dueText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
  panel: { paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.name === "dark" ? "rgba(255,255,255,0.08)" : colors.border, gap: 8 },
  studentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  studentName: { width: 180, fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.textPrimary },
  footNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.name === "dark" ? "rgba(255,255,255,0.16)" : colors.border,
  },
  // module editor (themed drawer)
  editorHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.name === "dark" ? "rgba(255,255,255,0.1)" : colors.border,
  },
  editorHeadPhone: { paddingHorizontal: 16, paddingTop: 16 },
  edTitle: { fontFamily: fonts.heading, fontSize: 25, lineHeight: 31, color: colors.textPrimary },
  edSub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textOnGlass, marginTop: 4 },
  form: { gap: 30 },
  formPad: { padding: 28, paddingBottom: 36 },
  formPadPhone: { padding: 16, paddingBottom: 28 },
  step: { gap: 14 },
  stepHead: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  stepNo: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.actionPrimaryFill },
  stepNoText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: "#FFFFFF" },
  stepTitle: { fontFamily: fonts.heading, fontSize: 19, color: colors.textPrimary },
  stepHint: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnGlass },
  stepBody: { gap: 16 },
  stepBodyIndent: { paddingLeft: 42 },
  edLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary, marginBottom: 8 },
  optional: { fontFamily: fonts.body, color: colors.textOnGlass },
  edInput: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.name === "dark" ? "rgba(255,255,255,0.16)" : colors.border,
    backgroundColor: theme.name === "dark" ? colors.neuWell : colors.surface,
    fontFamily: fonts.bodyMedium,
    fontSize: 15.5,
    color: colors.textPrimary,
    ...(Platform.OS === "web" ? ({ outlineColor: colors.primaryTealLight } as any) : null),
  },
  edInputProblem: { borderColor: colors.needsPracticeText },
  minField: { minWidth: 240 },
  scopeRow: { flexDirection: "row", gap: 28, flexWrap: "wrap" },
  scopeGroup: {},
  pickArea: { gap: 16 },
  pickAreaWide: { flexDirection: "row", alignItems: "flex-start" },
  pickCol: { gap: 12 },
  colTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: colors.textPrimary },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catPill: { minHeight: 34, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1.5, justifyContent: "center" },
  catPillOn: { backgroundColor: colors.neuBase, borderColor: colors.primaryTealLight },
  catPillOff: { borderColor: theme.name === "dark" ? "rgba(255,255,255,0.14)" : colors.border },
  catText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  catTextOn: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
  hover: { backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.05)" : colors.surfacePressed },
  pressed: { opacity: 0.8 },
  pickBar: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
  chipScroll: { maxHeight: 360 },
  chipScrollNarrow: { maxHeight: 280 },
  signChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 4 },
  signChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 42, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1.5 },
  signChipLetter: { minWidth: 58, justifyContent: "center" },
  signChipOn: { backgroundColor: colors.actionPrimaryFill, borderColor: colors.actionPrimaryFill },
  signChipOff: { borderColor: theme.name === "dark" ? "rgba(255,255,255,0.16)" : colors.border },
  signChipText: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
  signChipTextOn: { color: colors.textOnPrimary },
  selCol: {
    gap: 10,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.name === "dark" ? "rgba(255,255,255,0.1)" : colors.border,
    backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.03)" : colors.surface,
  },
  selColWide: { width: 340 },
  selHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  selCount: { fontFamily: fonts.bodyMedium, color: colors.textOnGlass },
  selEmpty: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.name === "dark" ? "rgba(255,255,255,0.16)" : colors.border,
    alignItems: "center",
  },
  selEmptyProblem: { borderColor: colors.needsPracticeText },
  selEmptyText: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnGlass, textAlign: "center" },
  selScroll: { maxHeight: 380 },
  selScrollNarrow: { maxHeight: 320 },
  selRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48 },
  selRule: { borderTopWidth: 1, borderTopColor: theme.name === "dark" ? "rgba(255,255,255,0.08)" : colors.border },
  selNo: { width: 24, textAlign: "right", fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textOnGlass },
  selName: { flex: 1, minWidth: 0, fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textPrimary },
  selFlag: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.accentCoralText },
  rowBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  selfStart: { alignSelf: "flex-start" },
  planWarn: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(242,178,62,0.45)",
    backgroundColor: "rgba(242,178,62,0.08)",
  },
  warnText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, lineHeight: 19, color: colors.textPrimary, minWidth: 160 },
  edMuted: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnGlass },
  edProblemText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.needsPracticeText },
  formFootPinned: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: theme.name === "dark" ? "rgba(255,255,255,0.1)" : colors.border,
  },
  formFootPhone: { paddingHorizontal: 16 },
  // "Modules by category" dialog: frosted (textOnFrosted only, no gold / green)
  formTitle: { fontFamily: fonts.heading, fontSize: 25, lineHeight: 31, color: colors.textOnFrosted },
  fieldRow: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  dueCol: { width: 250 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  fPill: { minHeight: 40, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  fPillOn: { backgroundColor: colors.actionPrimaryFill, borderColor: colors.actionPrimaryFill },
  fPillOff: { borderColor: "rgba(30,31,38,0.35)", backgroundColor: "transparent" },
  fPillText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textOnFrosted },
  fPillTextOn: { color: "#FFFFFF" },
  formMuted: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnFrosted },
  problem: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  formFoot: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 6 },
  outlineDark: { borderWidth: 1.5, borderColor: "rgba(30,31,38,0.4)" },
  dialogBody: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: colors.textOnFrosted, marginTop: 10, marginBottom: 14 },
  preview: { marginVertical: 16, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 18, backgroundColor: "rgba(30,31,38,0.1)" },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46 },
  previewRule: { borderTopWidth: 1, borderTopColor: "rgba(30,31,38,0.12)" },
  previewCat: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textOnFrosted },
  previewMid: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnFrosted },
  previewN: { width: 80, textAlign: "right", fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnFrosted },
});
