// Teacher: make a set of word modules by part of speech in one go - one
// module per chosen category ("Verbs"), split into parts of a set size when
// the category is big ("Verbs 1", "Verbs 2"). Signs keep the curriculum's
// order, which is easiest-for-the-model first (export_word_practice_order.py),
// so part 1 of a category is the one students are most likely to pass.
// Signs already in one of the class's modules are left out by default, so
// running it again only fills the gaps.
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { DashboardCard, dashboardStyles as ds } from "./DashboardShell";
import { ActionButton, CheckRow, ChoicePills, FieldLabel, type NoticeState } from "./ManageKit";
import SegmentedToggle from "../../components/SegmentedToggle";
import { colors, fonts, radii, spacing } from "../../theme/theme";
import { moduleSigns, saveModule, type ClassRow, type ModuleDraft, type ModuleRow } from "../../lib/queries";
import { CURRICULUM, getGroup, getLanguage, type SignLanguage } from "../../lib/curriculum";
import { WORD_CATEGORIES, categoriesIn, evenChunks, filterByCategory, type WordCategory } from "../../lib/wordCategories";

const SIZES = ["5", "8", "10", "15"] as const;
type Size = (typeof SIZES)[number];
/** More modules than this in one go gets a warning - students see every one. */
const MANY_MODULES = 12;

type PlannedModule = { title: string; description: string; signs: string[] };

export default function ModulePlanner({
  klass,
  modules,
  accentColor,
  setNotice,
  onClose,
}: {
  klass: ClassRow;
  modules: ModuleRow[];
  accentColor: string;
  setNotice: (n: NoticeState) => void;
  onClose: (created: boolean) => void;
}) {
  const wordLanguages = CURRICULUM.filter((l) => l.groups.some((g) => g.group === "words" && g.available));
  const [language, setLanguage] = useState<SignLanguage>(wordLanguages[0]?.language ?? "asl");
  const [chosen, setChosen] = useState<Set<WordCategory>>(new Set());
  const [size, setSize] = useState<Size>("10");
  const [skipUsed, setSkipUsed] = useState(true);
  const [saving, setSaving] = useState(false);
  const [made, setMade] = useState(0);

  const langLabel = getLanguage(language).label;
  const allSigns = getGroup(language, "words").signs;
  const used = new Set(
    modules.filter((m) => m.language === language && m.sign_group === "words").flatMap((m) => moduleSigns(m))
  );
  const pool = skipUsed ? allSigns.filter((s) => !used.has(s)) : allSigns;
  const totals = categoriesIn(language, allSigns);
  const left = new Map(categoriesIn(language, pool).map((c) => [c.key, c.count]));

  const plan: PlannedModule[] = WORD_CATEGORIES.filter((c) => chosen.has(c.key)).flatMap((c) => {
    const parts = evenChunks(filterByCategory(language, pool, c.key), Number(size));
    return parts.map((signs, i) => ({
      title: parts.length > 1 ? `${c.label} ${i + 1}` : c.label,
      description:
        parts.length > 1
          ? `${langLabel} ${c.label.toLowerCase()}, part ${i + 1} of ${parts.length}.`
          : `${langLabel} ${c.label.toLowerCase()}.`,
      signs,
    }));
  });

  const toggle = (c: WordCategory) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const changeLanguage = (l: SignLanguage) => {
    if (l === language) return;
    setLanguage(l);
    setChosen(new Set());
  };

  // One module at a time, so a failure part-way says exactly how far it got.
  const create = async () => {
    if (plan.length === 0) return;
    setSaving(true);
    setMade(0);
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      const draft: ModuleDraft & { position: number } = {
        title: p.title,
        description: p.description,
        language,
        sign_group: "words",
        due_date: null,
        position: modules.length + i,
      };
      const { error } = await saveModule(klass.id, draft, p.signs);
      if (error) {
        setSaving(false);
        setNotice({
          kind: "error",
          message: `Made ${i} of ${plan.length} modules, then "${p.title}" failed: ${error.message}`,
        });
        if (i > 0) onClose(true);
        return;
      }
      setMade(i + 1);
    }
    setSaving(false);
    setNotice({
      kind: "success",
      message: `Made ${plan.length} module${plan.length === 1 ? "" : "s"} for ${klass.name}. Edit any of them to change signs or add a due date.`,
    });
    onClose(true);
  };

  return (
    <DashboardCard title="Modules by category" style={styles.card}>
      <Text style={styles.intro}>
        Pick parts of speech and the app makes one module for each, split into smaller parts when a category is big.
        Signs go easiest first. You can edit, reorder or delete the modules afterwards.
      </Text>

      {wordLanguages.length > 1 ? (
        <View style={styles.gapTop}>
          <FieldLabel>Language</FieldLabel>
          <SegmentedToggle
            options={wordLanguages.map((l) => ({ key: l.language, label: l.label }))}
            value={language}
            onChange={changeLanguage}
          />
        </View>
      ) : null}

      <View style={styles.gapTop}>
        <View style={styles.headRow}>
          <FieldLabel>Categories</FieldLabel>
          <View style={styles.row8}>
            <ActionButton
              label="All"
              variant="ghost"
              onPress={() => setChosen(new Set(totals.filter((c) => (left.get(c.key) ?? 0) > 0).map((c) => c.key)))}
            />
            <ActionButton label="None" variant="ghost" onPress={() => setChosen(new Set())} disabled={chosen.size === 0} />
          </View>
        </View>
        <View style={styles.checkGrid}>
          {totals.map((c) => {
            const remaining = left.get(c.key) ?? 0;
            return (
              <CheckRow
                key={c.key}
                checked={chosen.has(c.key)}
                onToggle={() => toggle(c.key)}
                label={`${c.label}, ${remaining} signs`}
                accentColor={accentColor}
                disabled={remaining === 0}
                style={styles.checkItem}
              >
                <View style={styles.checkText}>
                  <Text style={styles.checkLabel}>{c.label}</Text>
                  <Text style={ds.itemMeta}>
                    {remaining === 0
                      ? "all already in modules"
                      : remaining < c.count
                        ? `${remaining} of ${c.count} not in a module yet`
                        : `${c.count} sign${c.count === 1 ? "" : "s"}`}
                  </Text>
                </View>
              </CheckRow>
            );
          })}
        </View>
      </View>

      <View style={styles.gapTop}>
        <FieldLabel>Signs per module (at most)</FieldLabel>
        <ChoicePills
          options={SIZES.map((s) => ({ key: s, label: s }))}
          value={size}
          onChange={setSize}
          accentColor={accentColor}
        />
      </View>

      <View style={styles.gapTop}>
        <CheckRow
          checked={skipUsed}
          onToggle={() => setSkipUsed((v) => !v)}
          label="Leave out signs already in a module"
          accentColor={accentColor}
        >
          <Text style={styles.checkLabel}>
            Leave out signs already in a module{used.size ? ` (${used.size} ${langLabel} words)` : ""}
          </Text>
        </CheckRow>
      </View>

      <View style={styles.gapTop}>
        <FieldLabel>
          {plan.length === 0 ? "Preview" : `Preview · ${plan.length} module${plan.length === 1 ? "" : "s"}`}
        </FieldLabel>
        {plan.length === 0 ? (
          <Text style={ds.emptyText}>Pick at least one category.</Text>
        ) : (
          <View style={styles.preview}>
            {plan.map((p) => (
              <View key={p.title} style={styles.previewRow}>
                <Text style={styles.previewTitle}>
                  {p.title} <Text style={ds.itemMeta}>· {p.signs.length} signs</Text>
                </Text>
                <Text style={ds.itemMeta} numberOfLines={1}>
                  {p.signs.join(", ")}
                </Text>
              </View>
            ))}
          </View>
        )}
        {plan.length > MANY_MODULES ? (
          <Text style={styles.warn}>
            That's {plan.length} modules - students see every one. Pick fewer categories or bigger modules if that's a
            lot for your class.
          </Text>
        ) : null}
      </View>

      <View style={[styles.row8, styles.gapTop]}>
        <ActionButton
          label={
            saving
              ? `Making ${made + 1} of ${plan.length}…`
              : plan.length
                ? `Make ${plan.length} module${plan.length === 1 ? "" : "s"}`
                : "Make modules"
          }
          variant="primary"
          accentColor={accentColor}
          onPress={create}
          disabled={plan.length === 0 || saving}
        />
        <ActionButton label="Cancel" variant="ghost" onPress={() => onClose(false)} disabled={saving} />
      </View>
    </DashboardCard>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.md },
  gapTop: { marginTop: spacing.md },
  row8: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  intro: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, maxWidth: 640 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  checkGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.xs },
  checkItem: { flexBasis: 220, flexGrow: 1, maxWidth: 320 },
  checkText: { flexShrink: 1, minWidth: 0 },
  checkLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  preview: {
    marginTop: spacing.xs,
    maxHeight: 320,
    overflow: "scroll" as any,
    borderRadius: radii.sm,
    backgroundColor: colors.neuWell,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  previewRow: { paddingVertical: 6 },
  previewTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  warn: { fontFamily: fonts.body, fontSize: 12, color: colors.needsPractice, marginTop: 6 },
});
