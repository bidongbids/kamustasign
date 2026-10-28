// Teacher: the class learning plan (class_word_plans, 0012) - which word
// categories, and which words in each, the class learns. Students see only
// these words, grouped by the same categories (WordCategoryList), and every
// progress figure - theirs and the teacher's - counts only them
// (curriculum.ts planSigns). Letters and numbers are always the whole group.
//
// Words inside a category are listed the way students see them: the ones the
// model recognises most reliably first (wordPracticeOrder.json), so "the
// first N of each category" is a sensible starter plan.
//
// Step 1 of "What they learn" (design T4): the editor beside two cards that
// say what saving changes (with the +N / -N against the saved plan). Unsaved
// changes show in a save bar pinned to the bottom of the page (`onSaveBar`,
// rendered by the dashboard) rather than a button at the end of a long list.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ActionButton, CheckBox, SearchField, type NoticeState } from "./ManageKit";
import SegmentedToggle from "../../components/SegmentedToggle";
import { Bar } from "./TeacherToday";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon } from "../../components/icons/UiIcons";
import { colors, fonts, radii } from "../../theme/theme";
import { neuInset } from "../../theme/shadows";
import { saveClassPlan, type ClassRow } from "../../lib/queries";
import { CURRICULUM, getGroup, planSigns, type ClassPlan, type SignLanguage } from "../../lib/curriculum";
import { WORD_CATEGORIES, getWordCategory, type WordCategory } from "../../lib/wordCategories";
import { signName, signMatches } from "../../lib/signNames";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;
const STARTER_PER_CATEGORY = 10;
const LANGUAGES = CURRICULUM.filter((l) => getGroup(l.language, "words").available).map((l) => l.language);
const labelOf = (l: SignLanguage) => CURRICULUM.find((x) => x.language === l)!.label;

type Drafts = Record<SignLanguage, Set<string>>;

const draftsFrom = (plan: ClassPlan): Drafts =>
  Object.fromEntries(
    CURRICULUM.map((l) => [l.language, new Set(planSigns(l.language, "words", plan))])
  ) as Drafts;

export type SaveBarState = { message: string; saving: boolean; onSave: () => void; onDiscard: () => void } | null;

export default function ClassPlanEditor({
  klass,
  plan,
  accentColor,
  setNotice,
  onSaved,
  onSaveBar,
  wide,
}: {
  klass: ClassRow;
  plan: ClassPlan;
  accentColor: string;
  setNotice: (n: NoticeState) => void;
  onSaved: (plan: ClassPlan) => void;
  /** Unsaved changes are shown by the dashboard's pinned save bar; without it, inline. */
  onSaveBar?: (bar: SaveBarState) => void;
  /** Desktop: the side cards sit beside the editor. */
  wide: boolean;
}) {
  const [language, setLanguage] = useState<SignLanguage>(LANGUAGES[0] ?? "asl");
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(plan));
  const [open, setOpen] = useState<Set<WordCategory>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Another class, or a plan saved elsewhere: start from what is stored.
  useEffect(() => {
    setDrafts(draftsFrom(plan));
  }, [plan, klass.id]);

  const all = getGroup(language, "words").signs;
  const chosen = drafts[language];
  const saved = useMemo(() => new Set(planSigns(language, "words", plan)), [plan, language]);
  const dirtyLanguages = LANGUAGES.filter((l) => {
    const a = drafts[l];
    const b = new Set(planSigns(l, "words", plan));
    return a.size !== b.size || [...a].some((s) => !b.has(s));
  });
  const dirty = dirtyLanguages.length > 0;
  const added = [...chosen].filter((s) => !saved.has(s)).length;
  const removed = [...saved].filter((s) => !chosen.has(s)).length;

  const q = search.trim();
  const categories = WORD_CATEGORIES.map((c) => {
    const signs = all.filter((s) => getWordCategory(language, s) === c.key);
    return { ...c, signs, shown: q ? signs.filter((s) => signMatches(language, s, q)) : signs };
  }).filter((c) => c.signs.length > 0 && c.shown.length > 0);

  const update = (fn: (set: Set<string>) => void) =>
    setDrafts((prev) => {
      const next = new Set(prev[language]);
      fn(next);
      return { ...prev, [language]: next };
    });

  const toggleSign = (s: string) => update((set) => (set.has(s) ? set.delete(s) : set.add(s)));
  const setMany = (signs: string[], on: boolean) => update((set) => signs.forEach((s) => (on ? set.add(s) : set.delete(s))));
  const toggleOpen = (k: WordCategory) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const starter = () =>
    update((set) => {
      set.clear();
      for (const c of WORD_CATEGORIES) {
        all.filter((s) => getWordCategory(language, s) === c.key).slice(0, STARTER_PER_CATEGORY).forEach((s) => set.add(s));
      }
    });

  const save = async () => {
    setSaving(true);
    const next: ClassPlan = { ...plan };
    for (const l of dirtyLanguages) {
      const set = drafts[l];
      const every = getGroup(l, "words").signs;
      // Every word picked = no plan, so words from a future model show up too.
      const signs = set.size === every.length ? null : every.filter((s) => set.has(s));
      const { error } = await saveClassPlan(klass.id, l, signs);
      if (error) {
        setSaving(false);
        setNotice({
          kind: "error",
          message: error.code === "42P01" || error.code === "PGRST205"
            ? "Learning plans need the 0012 database update. Ask your admin to apply it."
            : error.message,
        });
        return;
      }
      if (signs) next[l] = signs;
      else delete next[l];
    }
    setSaving(false);
    setNotice({ kind: "success", message: `Saved the learning plan for ${klass.name}. Students see it the next time their dashboard loads.` });
    onSaved(next);
  };
  const discard = () => setDrafts(draftsFrom(plan));

  // The pinned save bar calls whatever save / discard are current.
  const saveRef = useRef(save);
  saveRef.current = save;
  const discardRef = useRef(discard);
  discardRef.current = discard;
  const dirtyText = dirtyLanguages.map(labelOf).join(" and ");
  useEffect(() => {
    onSaveBar?.(
      dirty
        ? {
            message: `Unsaved changes to the ${dirtyText} plan${dirtyLanguages.length > 1 ? "s" : ""}`,
            saving,
            onSave: () => void saveRef.current(),
            onDiscard: () => discardRef.current(),
          }
        : null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving, dirtyText]);
  useEffect(() => () => onSaveBar?.(null), [onSaveBar]);

  const langLabel = labelOf(language);
  const share = all.length ? chosen.size / all.length : 0;

  const editor = (
    <View style={[styles.card, styles.main]}>
      <View style={styles.topRow}>
        {LANGUAGES.length > 1 ? (
          <SegmentedToggle
            options={LANGUAGES.map((l) => ({ key: l, label: `${labelOf(l)}${dirtyLanguages.includes(l) ? " •" : ""}` }))}
            value={language}
            onChange={(l) => {
              setLanguage(l);
              setOpen(new Set());
            }}
          />
        ) : null}
        <View
          style={[styles.summary, neuInset("sm")]}
          accessible
          accessibilityLabel={`${chosen.size} of ${all.length} ${langLabel} words in the plan, ${Math.round(share * 100)}%`}
        >
          <Text style={styles.summaryText} numberOfLines={1}>
            {chosen.size} of {all.length} {langLabel} words in the plan
          </Text>
          <View style={styles.summaryBar}>
            <Bar value={share} height={8} tone="violet" />
          </View>
          <Text style={styles.summaryPct}>{Math.round(share * 100)}%</Text>
        </View>
      </View>

      <View style={styles.toolRow}>
        <View style={styles.search}>
          <SearchField value={search} onChangeText={setSearch} placeholder={`Search ${langLabel} words`} />
        </View>
        <View style={styles.row8}>
          <ActionButton label={`Starter: ${STARTER_PER_CATEGORY} per category`} size="md" onPress={starter} />
          <ActionButton label="Pick all" size="md" onPress={() => setMany(all, true)} disabled={chosen.size === all.length} />
          <ActionButton label="Clear all" size="md" onPress={() => setMany(all, false)} disabled={chosen.size === 0} />
        </View>
      </View>

      <View>
        {categories.length === 0 ? <Text style={styles.muted}>No words match "{search}".</Text> : null}
        {categories.map((c, i) => {
          const picked = c.signs.filter((s) => chosen.has(s)).length;
          const state = picked === 0 ? "none" : picked === c.signs.length ? "all" : "some";
          const expanded = open.has(c.key) || q.length > 0;
          return (
            <View key={c.key} style={[styles.cat, i > 0 && styles.rule]}>
              <View style={styles.catRow}>
                <Pressable
                  onPress={() => setMany(c.signs, state !== "all")}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: state === "all" ? true : state === "some" ? "mixed" : false }}
                  accessibilityLabel={`${c.label}: ${state === "all" ? "remove" : "add"} all ${c.signs.length} words`}
                  hitSlop={10}
                  style={[styles.catCheck, webCursor]}
                >
                  <CheckBox checked={state === "all"} indeterminate={state === "some"} accentColor={accentColor} />
                </Pressable>
                <Pressable
                  onPress={() => toggleOpen(c.key)}
                  style={[styles.catMain, webCursor]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${c.label}, ${picked} of ${c.signs.length} words picked. ${expanded ? "Hide" : "Show"} words`}
                >
                  <Text style={styles.catLabel}>{c.label}</Text>
                  <Text style={styles.catCount}>
                    {picked} of {c.signs.length}
                  </Text>
                  {expanded ? <ChevronUpIcon size={16} color={colors.textOnGlass} /> : <ChevronDownIcon size={16} color={colors.textOnGlass} />}
                </Pressable>
              </View>
              {expanded ? (
                <View style={styles.chips}>
                  {c.shown.map((s) => {
                    const on = chosen.has(s);
                    const changed = on !== saved.has(s);
                    return (
                      <Pressable
                        key={s}
                        onPress={() => toggleSign(s)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${signName(language, s)}${changed ? ", not saved yet" : ""}`}
                        style={[styles.chip, on ? styles.chipOn : styles.chipOff, changed && styles.chipChanged, webCursor]}
                      >
                        {on ? <CheckIcon size={12} color="#FFFFFF" strokeWidth={3} /> : <PlusIcon size={12} color={colors.textOnGlass} />}
                        <Text style={[styles.chipText, { color: on ? "#FFFFFF" : colors.textOnGlass }]}>{signName(language, s)}</Text>
                      </Pressable>
                    );
                  })}
                  <Text style={styles.chipNote}>Listed the way students see them: most reliably checked first.</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {!onSaveBar && dirty ? (
        <View style={styles.inlineSave}>
          <ActionButton label="Save learning plan" variant="primary" accentColor={accentColor} onPress={save} loading={saving} />
          <ActionButton label="Discard changes" variant="ghost" onPress={discard} disabled={saving} />
        </View>
      ) : null}
    </View>
  );

  const side = (
    <View style={[styles.side, wide && styles.sideWide]}>
      <View style={styles.card}>
        <Text style={styles.sideTitle}>What changes for students</Text>
        <Text style={styles.sideBody}>
          They'll see the new plan the next time their dashboard loads. Their progress on removed words is kept. It just
          stops counting toward their overall.
        </Text>
        <View style={styles.diffRow} accessible accessibilityLabel={`${added} words added and ${removed} removed since the last save, in ${langLabel}`}>
          <View style={[styles.diff, styles.diffAdd]}>
            <Text style={[styles.diffText, { color: colors.successText }]}>+{added} words</Text>
          </View>
          <View style={[styles.diff, styles.diffRemove]}>
            <Text style={[styles.diffText, { color: colors.needsPracticeText }]}>−{removed} words</Text>
          </View>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.sideTitle}>Letters and numbers</Text>
        <Text style={styles.sideBody}>Always the whole group. Only words can be picked.</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.layout, wide && styles.layoutWide]}>
      {editor}
      {side}
    </View>
  );
}

/** The pinned bar under the page while the plan has unsaved changes. */
export function SaveBar({ bar }: { bar: NonNullable<SaveBarState> }) {
  return (
    <View style={styles.saveBar} accessibilityLiveRegion="polite">
      <View style={styles.saveIcon}>
        <Text style={styles.saveIconText}>!</Text>
      </View>
      <Text style={styles.saveText} numberOfLines={2}>
        {bar.message}
      </Text>
      <ActionButton label="Discard changes" size="lg" variant="ghost" style={styles.outline} onPress={bar.onDiscard} disabled={bar.saving} />
      <ActionButton label="Save learning plan" size="lg" variant="primary" onPress={bar.onSave} loading={bar.saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { gap: 18 },
  layoutWide: { flexDirection: "row", alignItems: "flex-start" },
  main: { flex: 1, minWidth: 0 },
  card: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap" },
  summary: {
    flex: 1,
    minWidth: 280,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.neuWell,
  },
  summaryText: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
  summaryBar: { flex: 1, minWidth: 60 },
  summaryPct: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  toolRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 16, marginBottom: 6 },
  search: { flexGrow: 1, flexBasis: 240, maxWidth: 320 },
  row8: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  muted: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnGlass, paddingVertical: 12 },
  cat: { paddingVertical: 2 },
  rule: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  catRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 52 },
  catCheck: { padding: 8 },
  catMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  catLabel: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: colors.textPrimary },
  catCount: { flex: 1, textAlign: "right", fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.textOnGlass },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingLeft: 42, paddingBottom: 14 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1.5 },
  chipOn: { backgroundColor: colors.actionPrimaryFill, borderColor: colors.actionPrimaryFill },
  chipOff: { borderColor: "rgba(255,255,255,0.16)", backgroundColor: "transparent" },
  // Changed since the last save: a dashed gold ring, so unsaved picks are visible.
  chipChanged: { borderStyle: "dashed", borderColor: colors.accentCoral },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5 },
  chipNote: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnGlass, marginLeft: 6 },
  inlineSave: { flexDirection: "row", gap: 10, marginTop: 16 },
  side: { gap: 18 },
  sideWide: { width: 330 },
  sideTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.textPrimary, marginBottom: 8 },
  sideBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textOnGlass },
  diffRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  diff: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill, borderWidth: 1 },
  diffAdd: { borderColor: "rgba(95,208,138,0.4)", backgroundColor: "rgba(63,181,106,0.12)" },
  diffRemove: { borderColor: "rgba(255,122,133,0.4)", backgroundColor: "rgba(224,82,95,0.1)" },
  diffText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
  saveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(22,25,32,0.97)",
  },
  saveIcon: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.8, borderColor: colors.attention, alignItems: "center", justifyContent: "center" },
  saveIconText: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 16, color: colors.attention },
  saveText: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textPrimary },
  outline: { borderWidth: 1.5, borderColor: colors.border },
});
