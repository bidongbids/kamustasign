// Teacher: the class learning plan (class_word_plans, 0012) - which word
// categories, and which words in each, the class learns. Students see only
// these words, grouped by the same categories (WordCategoryList), and every
// progress figure - theirs and the teacher's - counts only them
// (curriculum.ts planSigns). Letters and numbers are always the whole group.
//
// Words inside a category are listed the way students see them: the ones the
// model recognises most reliably first (wordPracticeOrder.json), so "the
// first N of each category" is a sensible starter plan.
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { DashboardCard, dashboardStyles as ds } from "./DashboardShell";
import { ActionButton, CheckBox, SearchField, type NoticeState } from "./ManageKit";
import SegmentedToggle from "../../components/SegmentedToggle";
import ProgressBar from "../../components/ProgressBar";
import { ChevronDownIcon, ChevronUpIcon } from "../../components/icons/UiIcons";
import { colors, fonts, radii, spacing } from "../../theme/theme";
import { neuInset } from "../../theme/shadows";
import { saveClassPlan, type ClassRow } from "../../lib/queries";
import { CURRICULUM, getGroup, planSigns, type ClassPlan, type SignLanguage } from "../../lib/curriculum";
import { WORD_CATEGORIES, getWordCategory, type WordCategory } from "../../lib/wordCategories";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;
const STARTER_PER_CATEGORY = 10;
const LANGUAGES = CURRICULUM.filter((l) => getGroup(l.language, "words").available).map((l) => l.language);

type Drafts = Record<SignLanguage, Set<string>>;

const draftsFrom = (plan: ClassPlan): Drafts =>
  Object.fromEntries(
    CURRICULUM.map((l) => [l.language, new Set(planSigns(l.language, "words", plan))])
  ) as Drafts;

export default function ClassPlanEditor({
  klass,
  plan,
  accentColor,
  setNotice,
  onSaved,
}: {
  klass: ClassRow;
  plan: ClassPlan;
  accentColor: string;
  setNotice: (n: NoticeState) => void;
  onSaved: (plan: ClassPlan) => void;
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

  const q = search.trim().toLowerCase();
  const categories = WORD_CATEGORIES.map((c) => {
    const signs = all.filter((s) => getWordCategory(language, s) === c.key);
    return { ...c, signs, shown: q ? signs.filter((s) => s.toLowerCase().includes(q)) : signs };
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
    setNotice({ kind: "success", message: `Saved the learning plan for ${klass.name}. Students see it the next time their plan loads.` });
    onSaved(next);
  };

  const langLabel = CURRICULUM.find((l) => l.language === language)!.label;

  return (
    <DashboardCard style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>Learning plan</Text>
          <Text style={ds.itemMeta}>
            Pick the word categories and words {klass.name} learns. Inside each category, words are listed the way
            students see them: the ones the computer checks most reliably first. Letters are always included.
          </Text>
        </View>
        {LANGUAGES.length > 1 ? (
          <SegmentedToggle
            options={LANGUAGES.map((l) => ({
              key: l,
              label: `${CURRICULUM.find((x) => x.language === l)!.label}${dirtyLanguages.includes(l) ? " •" : ""}`,
            }))}
            value={language}
            onChange={(l) => {
              setLanguage(l);
              setOpen(new Set());
            }}
          />
        ) : null}
      </View>

      <View style={[styles.summary, neuInset("sm")]}>
        <View style={styles.flex}>
          <ProgressBar
            value={all.length ? chosen.size / all.length : 0}
            label={`${chosen.size} of ${all.length} ${langLabel} words in the plan`}
            caption={
              chosen.size === all.length
                ? "Every word - nothing is hidden from students."
                : chosen.size === 0
                  ? `Students won't see any ${langLabel} words.`
                  : `${categories.filter((c) => c.signs.some((s) => chosen.has(s))).length} categories with words picked.`
            }
          />
        </View>
      </View>

      <View style={[styles.toolbar, styles.gapTop]}>
        <View style={styles.search}>
          <SearchField value={search} onChangeText={setSearch} placeholder={`Search ${langLabel} words`} />
        </View>
        <View style={styles.row8}>
          <ActionButton label={`Starter: ${STARTER_PER_CATEGORY} per category`} variant="ghost" onPress={starter} />
          <ActionButton label="Pick all" variant="ghost" onPress={() => setMany(all, true)} disabled={chosen.size === all.length} />
          <ActionButton label="Clear all" variant="ghost" onPress={() => setMany(all, false)} disabled={chosen.size === 0} />
        </View>
      </View>

      <View style={styles.gapTop}>
        {categories.length === 0 ? <Text style={ds.emptyText}>No words match "{search}".</Text> : null}
        {categories.map((c, i) => {
          const picked = c.signs.filter((s) => chosen.has(s)).length;
          const state = picked === 0 ? "none" : picked === c.signs.length ? "all" : "some";
          const expanded = open.has(c.key) || q.length > 0;
          return (
            <View key={c.key} style={[ds.listItem, i === 0 && ds.listItemFirst]}>
              <View style={styles.catRow}>
                <Pressable
                  onPress={() => setMany(c.signs, state !== "all")}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: state === "all" ? true : state === "some" ? "mixed" : false }}
                  accessibilityLabel={`${c.label}: ${state === "all" ? "remove" : "add"} all ${c.signs.length} words`}
                  hitSlop={8}
                  style={webCursor}
                >
                  {state === "some" ? (
                    <View style={[styles.mixed, { backgroundColor: accentColor, borderColor: accentColor }]}>
                      <View style={styles.mixedBar} />
                    </View>
                  ) : (
                    <CheckBox checked={state === "all"} accentColor={accentColor} />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => toggleOpen(c.key)}
                  style={[styles.catMain, webCursor]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${c.label}, ${picked} of ${c.signs.length} words picked. ${expanded ? "Hide" : "Show"} words`}
                >
                  <Text style={ds.itemTitle}>{c.label}</Text>
                  <Text style={styles.catCount}>
                    {picked} of {c.signs.length}
                  </Text>
                  {expanded ? (
                    <ChevronUpIcon size={16} color={colors.textSecondary} />
                  ) : (
                    <ChevronDownIcon size={16} color={colors.textSecondary} />
                  )}
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
                        accessibilityLabel={s}
                        style={[
                          styles.chip,
                          on ? { backgroundColor: accentColor, borderColor: accentColor } : styles.chipIdle,
                          changed && styles.chipChanged,
                          webCursor,
                        ]}
                      >
                        <Text style={[styles.chipText, { color: on ? colors.textOnPrimary : colors.textSecondary }]}>{s}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={[styles.footer, styles.gapTop]}>
        <ActionButton
          label={dirty ? "Save learning plan" : "Saved"}
          variant="primary"
          accentColor={accentColor}
          onPress={save}
          loading={saving}
          disabled={!dirty}
        />
        {dirty ? (
          <>
            <ActionButton label="Discard changes" variant="ghost" onPress={() => setDrafts(draftsFrom(plan))} disabled={saving} />
            <Text style={ds.itemMeta}>
              Unsaved changes in {dirtyLanguages.map((l) => CURRICULUM.find((x) => x.language === l)!.label).join(" and ")}.
            </Text>
          </>
        ) : null}
      </View>
    </DashboardCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { marginTop: spacing.md },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 16, flexWrap: "wrap" },
  // Wraps the language toggle underneath on a phone instead of squeezing the text.
  headText: { flexGrow: 1, flexShrink: 1, flexBasis: 320, minWidth: 0 },
  title: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.textPrimary, marginBottom: 4 },
  summary: { marginTop: spacing.md, padding: 14, borderRadius: radii.md, backgroundColor: colors.neuWell },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  search: { flexGrow: 1, flexBasis: 240, maxWidth: 420 },
  row8: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 1 },
  gapTop: { marginTop: spacing.md },
  catRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  catMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  catCount: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary, textAlign: "right" },
  mixed: { width: 20, height: 20, borderRadius: 5.6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  mixedBar: { width: 10, height: 2.6, borderRadius: 2, backgroundColor: colors.textOnPrimary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm, paddingLeft: 32 },
  chip: { borderWidth: 1.5, borderRadius: radii.pill, paddingVertical: 5, paddingHorizontal: 12 },
  chipIdle: { borderColor: colors.border, backgroundColor: colors.neuWell },
  // Changed since the last save: a dashed ring, so unsaved picks are visible.
  chipChanged: { borderStyle: "dashed", borderColor: colors.accentCoral },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  footer: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
});
