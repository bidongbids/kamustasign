// Teacher: author a class's modules (0009_teacher_classroom.sql) - a named
// set of signs from one language + group of the curriculum, in the order the
// teacher picks them, with an optional due date - and see how far each
// student has got through each one. Students practise a module on the same
// screen as its group; "learned" is the curriculum's isMastered(), so the
// numbers here match the student's own tiles. Word modules can be built and
// sorted by part of speech (wordCategories.ts): the editor filters the sign
// picker by category, and ModulePlanner makes a whole set at once.
import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { DashboardCard, dashboardStyles as ds } from "./DashboardShell";
import { ActionButton, ChoicePills, ConfirmInline, FieldLabel, SearchField, type NoticeState } from "./ManageKit";
import SegmentedToggle from "../../components/SegmentedToggle";
import ProgressBar from "../../components/ProgressBar";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "../../components/icons/UiIcons";
import ModulePlanner from "./ModulePlanner";
import { colors, fonts, radii, spacing } from "../../theme/theme";
import {
  deleteModule,
  getClassGroupProgress,
  getModulesForClass,
  moduleSigns,
  saveModule,
  setModuleOrder,
  type ClassRow,
  type ModuleDraft,
  type ModuleRow,
  type ProgressEmbed,
  type StudentProgressSummary,
} from "../../lib/queries";
import { CURRICULUM, getGroup, getLanguage, isMastered, type SignGroup, type SignLanguage } from "../../lib/curriculum";
import {
  WORD_CATEGORIES,
  categoriesIn,
  filterByCategory,
  getWordCategory,
  type WordCategory,
} from "../../lib/wordCategories";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatDue(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function isOverdue(date: string | null, now = new Date()): boolean {
  if (!date) return false;
  const end = new Date(`${date}T23:59:59`);
  return end.getTime() < now.getTime();
}

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

export default function TeacherModules({
  klass,
  students,
  accentColor,
  setNotice,
}: {
  klass: ClassRow;
  students: StudentProgressSummary[];
  accentColor: string;
  setNotice: (n: NoticeState) => void;
}) {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  // null = list; "new" = blank editor; a module = editing that one.
  const [editing, setEditing] = useState<ModuleRow | "new" | null>(null);
  const [planning, setPlanning] = useState(false);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getModulesForClass(klass.id);
    setLoading(false);
    if (error) setNotice({ kind: "error", message: error.message });
    else setModules(data);
  }, [klass.id, setNotice]);

  useEffect(() => {
    setEditing(null);
    setPlanning(false);
    load();
  }, [load]);

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
    reorder(next);
  };

  const sortByCategory = () =>
    reorder(
      [...modules].sort(compareModules),
      "Sorted by language and category. Students see your modules in this order."
    );

  if (planning) {
    return (
      <ModulePlanner
        klass={klass}
        modules={modules}
        accentColor={accentColor}
        setNotice={setNotice}
        onClose={(created) => {
          setPlanning(false);
          if (created) load();
        }}
      />
    );
  }

  if (editing) {
    return (
      <ModuleEditor
        klass={klass}
        module={editing === "new" ? null : editing}
        nextPosition={modules.length}
        accentColor={accentColor}
        setNotice={setNotice}
        onClose={(saved) => {
          setEditing(null);
          if (saved) load();
        }}
      />
    );
  }

  return (
    <>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarText}>
          {modules.length} module{modules.length === 1 ? "" : "s"} in {klass.name}
        </Text>
        <View style={styles.row8}>
          {modules.length > 1 ? (
            <ActionButton label="Sort by category" variant="ghost" onPress={sortByCategory} disabled={reordering} />
          ) : null}
          <ActionButton label="Modules by category" onPress={() => setPlanning(true)} />
          <ActionButton
            label="New module"
            variant="primary"
            accentColor={accentColor}
            icon={(c) => <PlusIcon size={14} color={c} />}
            onPress={() => setEditing("new")}
          />
        </View>
      </View>
      {loading && modules.length === 0 ? (
        <DashboardCard style={styles.card}>
          <Text style={ds.emptyText}>Loading modules…</Text>
        </DashboardCard>
      ) : modules.length === 0 ? (
        <DashboardCard style={styles.card}>
          <Text style={ds.emptyText}>
            No modules yet. A module is a set of signs for your class to learn - e.g. "Greetings" or "Family words".
            Students see it on their dashboard and practise its signs. "Modules by category" makes a set of them for
            you, one per part of speech, like Verbs or Question words.
          </Text>
        </DashboardCard>
      ) : (
        modules.map((m, i) => (
          <ModuleCard
            key={m.id}
            module={m}
            klass={klass}
            students={students}
            setNotice={setNotice}
            onEdit={() => setEditing(m)}
            onDeleted={load}
            onMoveUp={i > 0 && !reordering ? () => move(i, -1) : undefined}
            onMoveDown={i < modules.length - 1 && !reordering ? () => move(i, 1) : undefined}
          />
        ))
      )}
    </>
  );
}

function ModuleCard({
  module: m,
  klass,
  students,
  setNotice,
  onEdit,
  onDeleted,
  onMoveUp,
  onMoveDown,
}: {
  module: ModuleRow;
  klass: ClassRow;
  students: StudentProgressSummary[];
  setNotice: (n: NoticeState) => void;
  onEdit: () => void;
  onDeleted: () => void;
  /** Undefined when the module can't move that way (first/last, or a move is saving). */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const signs = moduleSigns(m);
  const categories = m.sign_group === "words" ? categoriesIn(m.language, signs) : [];
  const [rows, setRows] = useState<Map<string, ProgressEmbed[]> | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    getClassGroupProgress(klass.id, m.language, m.sign_group).then(({ data, error }) => {
      if (!live) return;
      if (error) setNotice({ kind: "error", message: error.message });
      else setRows(data);
    });
    return () => {
      live = false;
    };
  }, [klass.id, m.language, m.sign_group, setNotice]);

  const signSet = new Set(signs);
  const learnedBy = (studentId: string) =>
    (rows?.get(studentId) ?? []).filter((r) => signSet.has(r.sign) && isMastered(r)).length;
  const fractions = students.map((s) => (signs.length ? learnedBy(s.id) / signs.length : 0));
  const average = fractions.length ? fractions.reduce((a, b) => a + b, 0) / fractions.length : 0;
  const finished = fractions.filter((f) => f >= 1).length;
  const due = formatDue(m.due_date);
  const overdue = isOverdue(m.due_date);

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

  return (
    <DashboardCard style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.titleBlock}>
          <Text style={styles.moduleTitle}>{m.title}</Text>
          <Text style={ds.itemMeta}>
            {[
              `${getLanguage(m.language).label} ${getGroup(m.language, m.sign_group).label}`,
              `${signs.length} sign${signs.length === 1 ? "" : "s"}`,
              due ? `${overdue ? "was due" : "due"} ${due}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {categories.length ? (
            <Text style={ds.itemMeta}>{categories.map((c) => `${c.label} ${c.count}`).join(" · ")}</Text>
          ) : null}
          {m.description ? <Text style={styles.description}>{m.description}</Text> : null}
        </View>
        <View style={styles.row8}>
          <ActionButton
            label={`Move ${m.title} up`}
            iconOnly
            variant="ghost"
            icon={(c) => <ChevronUpIcon size={16} color={c} />}
            onPress={() => onMoveUp?.()}
            disabled={!onMoveUp}
          />
          <ActionButton
            label={`Move ${m.title} down`}
            iconOnly
            variant="ghost"
            icon={(c) => <ChevronDownIcon size={16} color={c} />}
            onPress={() => onMoveDown?.()}
            disabled={!onMoveDown}
          />
          <ActionButton
            label={open ? "Hide students" : "Students"}
            icon={(c) => <UsersIcon size={16} color={c} />}
            onPress={() => setOpen((v) => !v)}
          />
          <ActionButton label={`Edit ${m.title}`} iconOnly icon={(c) => <PencilIcon size={16} color={c} />} onPress={onEdit} />
          <ActionButton
            label={`Delete ${m.title}`}
            iconOnly
            variant="danger"
            icon={(c) => <TrashIcon size={16} color={c} />}
            onPress={() => setConfirmDelete(true)}
          />
        </View>
      </View>

      <View style={styles.signPreview}>
        {signs.slice(0, 14).map((s) => (
          <View key={s} style={styles.signPill}>
            <Text style={styles.signPillText}>{s}</Text>
          </View>
        ))}
        {signs.length > 14 ? <Text style={ds.itemMeta}>+{signs.length - 14} more</Text> : null}
      </View>

      <View style={styles.gapTop}>
        <ProgressBar
          value={rows ? average : 0}
          label={
            rows
              ? `Class average · ${finished} of ${students.length} student${students.length === 1 ? "" : "s"} finished`
              : "Loading progress…"
          }
        />
      </View>

      {confirmDelete && (
        <ConfirmInline
          message={`Delete "${m.title}"? Students' progress on its signs is kept - only the module goes.`}
          confirmLabel="Delete module"
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
          busy={deleting}
        />
      )}

      {open && (
        <View style={styles.panel}>
          {students.length === 0 ? (
            <Text style={ds.emptyText}>No students in this class yet.</Text>
          ) : (
            [...students]
              .sort((a, b) => learnedBy(a.id) - learnedBy(b.id) || a.full_name.localeCompare(b.full_name))
              .map((s, i) => {
                const n = learnedBy(s.id);
                return (
                  <View key={s.id} style={[ds.listItem, i === 0 && ds.listItemFirst]}>
                    <ProgressBar
                      value={signs.length ? n / signs.length : 0}
                      label={s.full_name || "(no name)"}
                      caption={`${n} of ${signs.length} learned`}
                    />
                  </View>
                );
              })
          )}
          <Text style={[ds.itemMeta, styles.gapTop]}>Lowest first, so whoever needs help is at the top.</Text>
        </View>
      )}
    </DashboardCard>
  );
}

function ModuleEditor({
  klass,
  module: m,
  nextPosition,
  accentColor,
  setNotice,
  onClose,
}: {
  klass: ClassRow;
  module: ModuleRow | null;
  nextPosition: number;
  accentColor: string;
  setNotice: (n: NoticeState) => void;
  onClose: (saved: boolean) => void;
}) {
  const [title, setTitle] = useState(m?.title ?? "");
  const [description, setDescription] = useState(m?.description ?? "");
  const [language, setLanguage] = useState<SignLanguage>(m?.language ?? "asl");
  const [group, setGroup] = useState<SignGroup>(m?.sign_group ?? "words");
  const [due, setDue] = useState(m?.due_date ?? "");
  const [picked, setPicked] = useState<string[]>(m ? moduleSigns(m) : []);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<WordCategory | null>(null);
  const [saving, setSaving] = useState(false);

  const lang = getLanguage(language);
  const groupDef = getGroup(language, group);
  const availableGroups = lang.groups.filter((g) => g.available);
  const isWords = group === "words";
  const categories = isWords ? categoriesIn(language, groupDef.signs) : [];
  const pickedSet = new Set(picked);
  const q = search.trim().toLowerCase();
  const visible = filterByCategory(language, groupDef.signs, isWords ? category : null).filter(
    (s) => !q || s.toLowerCase().includes(q)
  );
  const visibleUnpicked = visible.filter((s) => !pickedSet.has(s));
  const visiblePicked = visible.length - visibleUnpicked.length;
  // With no filter, words show under a heading per category.
  const sections =
    isWords && !category && !q
      ? categories.map((c) => ({ key: c.key, label: c.label, signs: filterByCategory(language, visible, c.key) }))
      : [{ key: "all", label: "", signs: visible }];
  const dueValid = !due.trim() || (DATE_RE.test(due.trim()) && !Number.isNaN(new Date(`${due.trim()}T00:00:00`).getTime()));
  const canSave = title.trim().length > 0 && picked.length > 0 && dueValid && groupDef.available;

  // Switching language or group starts a fresh pick: a module's signs all
  // come from one group, so they'd be meaningless in another.
  const changeScope = (l: SignLanguage, g: SignGroup) => {
    if (l === language && g === group) return;
    const groups = getLanguage(l).groups;
    const nextGroup = groups.find((x) => x.group === g && x.available)?.group ?? groups.find((x) => x.available)?.group ?? g;
    setLanguage(l);
    setGroup(nextGroup);
    setPicked([]);
    setCategory(null);
  };

  const toggle = (sign: string) =>
    setPicked((prev) => (prev.includes(sign) ? prev.filter((s) => s !== sign) : [...prev, sign]));

  const addVisible = () => setPicked((prev) => [...prev, ...visibleUnpicked]);
  const removeVisible = () => {
    const drop = new Set(visible);
    setPicked((prev) => prev.filter((s) => !drop.has(s)));
  };
  // Stable: keeps the teacher's order inside each category.
  const groupPickedByCategory = () =>
    setPicked((prev) =>
      prev
        .map((s, i) => ({ s, i, r: categoryRank(getWordCategory(language, s)) }))
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map((x) => x.s)
    );

  const renderChip = (s: string) => {
    const on = pickedSet.has(s);
    return (
      <Pressable
        key={s}
        onPress={() => toggle(s)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={s}
        style={[styles.chip, on ? { backgroundColor: accentColor, borderColor: accentColor } : styles.chipIdle, webCursor]}
      >
        <Text style={[styles.chipText, { color: on ? colors.textOnPrimary : colors.textSecondary }]}>{s}</Text>
      </Pressable>
    );
  };

  const move = (sign: string, delta: number) =>
    setPicked((prev) => {
      const i = prev.indexOf(sign);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const draft: ModuleDraft & { position?: number } = {
      title: title.trim(),
      description: description.trim() || null,
      language,
      sign_group: group,
      due_date: due.trim() || null,
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

  return (
    <DashboardCard title={m ? `Edit "${m.title}"` : "New module"} style={styles.card}>
      <FieldLabel>Title</FieldLabel>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Greetings"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Module title"
        style={styles.input}
        autoFocus={!m}
      />

      <View style={styles.gapTop}>
        <FieldLabel>Description (optional)</FieldLabel>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What students will learn"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Module description"
          style={[styles.input, styles.inputWide]}
        />
      </View>

      <View style={styles.gapTop}>
        <FieldLabel>Signs from</FieldLabel>
        <View style={styles.scopeRow}>
          <SegmentedToggle
            options={CURRICULUM.map((l) => ({ key: l.language, label: l.label }))}
            value={language}
            onChange={(l) => changeScope(l, group)}
          />
          <ChoicePills
            options={availableGroups.map((g) => ({ key: g.group, label: g.label }))}
            value={group}
            onChange={(g) => changeScope(language, g)}
            accentColor={accentColor}
          />
        </View>
        {m && (m.language !== language || m.sign_group !== group) ? (
          <Text style={styles.warn}>Changing where signs come from clears the signs picked so far.</Text>
        ) : null}
      </View>

      <View style={styles.gapTop}>
        <FieldLabel>Due date (optional, YYYY-MM-DD)</FieldLabel>
        <TextInput
          value={due}
          onChangeText={setDue}
          placeholder="2026-11-30"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Due date"
          autoCapitalize="none"
          style={[styles.input, styles.inputShort, !dueValid && styles.inputError]}
          {...(Platform.OS === "web" ? ({ type: "date" } as any) : null)}
        />
        {!dueValid ? <Text style={styles.warn}>Use the form YYYY-MM-DD, or leave it empty.</Text> : null}
      </View>

      <View style={styles.gapTop}>
        <FieldLabel>
          Signs · {picked.length} picked of {groupDef.signs.length}
        </FieldLabel>
        <SearchField value={search} onChangeText={setSearch} placeholder={`Search ${groupDef.label.toLowerCase()}`} />
        {isWords ? (
          <View style={styles.gapTopSm}>
            <ChoicePills
              options={[
                { key: "all" as const, label: `All (${groupDef.signs.length})` },
                ...categories.map((c) => ({ key: c.key, label: `${c.label} (${c.count})` })),
              ]}
              value={category ?? "all"}
              onChange={(k) => setCategory(k === "all" ? null : k)}
              accentColor={accentColor}
            />
          </View>
        ) : null}
        {(category || q) && visible.length > 0 ? (
          <View style={[styles.row8, styles.gapTopSm]}>
            <ActionButton
              label={`Add all ${visibleUnpicked.length} shown`}
              variant="ghost"
              icon={(c) => <PlusIcon size={14} color={c} />}
              onPress={addVisible}
              disabled={visibleUnpicked.length === 0}
            />
            {visiblePicked > 0 ? <ActionButton label={`Remove ${visiblePicked} shown`} variant="ghost" onPress={removeVisible} /> : null}
          </View>
        ) : null}
        <View style={styles.chipsScroll}>
          {sections.map((sec) => (
            <View key={sec.key}>
              {sec.label ? <Text style={styles.sectionLabel}>{sec.label}</Text> : null}
              <View style={styles.chips}>{sec.signs.map(renderChip)}</View>
            </View>
          ))}
          {visible.length === 0 ? <Text style={ds.emptyText}>No signs match.</Text> : null}
        </View>
      </View>

      {picked.length > 0 && (
        <View style={styles.gapTop}>
          <View style={styles.orderHead}>
            <FieldLabel>Order students will practise in</FieldLabel>
            {isWords && picked.length > 1 ? (
              <ActionButton label="Group by category" variant="ghost" onPress={groupPickedByCategory} />
            ) : null}
          </View>
          {picked.map((s, i) => (
            <View key={s} style={styles.orderRow}>
              <Text style={styles.orderNum}>{i + 1}</Text>
              <Text style={styles.orderSign} numberOfLines={1}>
                {s}
                {isWords ? (
                  <Text style={styles.orderCategory}>
                    {"  "}
                    {WORD_CATEGORIES[categoryRank(getWordCategory(language, s))].singular}
                  </Text>
                ) : null}
              </Text>
              <ActionButton label="Up" variant="ghost" onPress={() => move(s, -1)} disabled={i === 0} />
              <ActionButton label="Down" variant="ghost" onPress={() => move(s, 1)} disabled={i === picked.length - 1} />
              <ActionButton label={`Remove ${s}`} iconOnly variant="ghost" icon={(c) => <CloseIcon size={14} color={c} />} onPress={() => toggle(s)} />
            </View>
          ))}
        </View>
      )}

      <View style={[styles.row8, styles.gapTop]}>
        <ActionButton
          label={m ? "Save module" : "Create module"}
          variant="primary"
          accentColor={accentColor}
          onPress={save}
          loading={saving}
          disabled={!canSave}
        />
        <ActionButton label="Cancel" variant="ghost" onPress={() => onClose(false)} disabled={saving} />
        {!canSave && !saving ? (
          <Text style={ds.itemMeta}>{!title.trim() ? "Add a title." : picked.length === 0 ? "Pick at least one sign." : ""}</Text>
        ) : null}
      </View>
    </DashboardCard>
  );
}

const styles = StyleSheet.create({
  row8: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  gapTop: { marginTop: spacing.md },
  card: { marginTop: spacing.md },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  toolbarText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  titleBlock: { flexGrow: 1, flexShrink: 1, flexBasis: 240, minWidth: 0 },
  moduleTitle: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.textPrimary },
  description: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  signPreview: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm, alignItems: "center" },
  signPill: { borderRadius: radii.pill, backgroundColor: colors.neuWell, paddingHorizontal: 10, paddingVertical: 3 },
  signPillText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textPrimary },
  panel: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  scopeRow: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  input: {
    minHeight: 42,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    maxWidth: 420,
  },
  inputWide: { maxWidth: 640 },
  inputShort: { maxWidth: 200 },
  inputError: { borderColor: colors.needsPractice },
  warn: { fontFamily: fonts.body, fontSize: 12, color: colors.needsPractice, marginTop: 6 },
  gapTopSm: { marginTop: spacing.sm },
  chipsScroll: { maxHeight: 360, overflow: "scroll" as any },
  sectionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textSecondary, marginTop: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  chip: { borderWidth: 1.5, borderRadius: radii.pill, paddingVertical: 5, paddingHorizontal: 12 },
  chipIdle: { borderColor: colors.border, backgroundColor: colors.neuWell },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  orderNum: { width: 24, fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textSecondary, textAlign: "right" },
  orderSign: { flex: 1, minWidth: 0, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  orderCategory: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  orderHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
});
