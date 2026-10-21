// The classroom's nested tabs - ASL | FSL, then Letters | Numbers | Words -
// on the same SegmentedToggle the translator uses for Letters/Numbers, so
// the two look like one app. Shared by the student and teacher dashboards.
//
// Groups with no model behind them are shown but disabled, with a line saying
// so, rather than hidden or rendered as an empty lesson list that looks broken
// (docs/CLASSROOM_REDESIGN.md section 2).
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import SegmentedToggle from "../../components/SegmentedToggle";
import { CURRICULUM, getLanguage, type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { colors, typography } from "../../theme/theme";

type Props = {
  language: SignLanguage;
  group: SignGroup;
  onChange: (language: SignLanguage, group: SignGroup) => void;
  /**
   * "student": kid-size tabs, and a group with no model is SELECTABLE with a
   * "soon" badge - the dashboard shows its coming-soon panel in place of the
   * grid (nothing is graded or counted). "teacher" (default): unchanged.
   */
  audience?: "student" | "teacher";
  /** "row": both toggles side by side, left-aligned (student desktop). */
  layout?: "stacked" | "row";
};

/** The group to land on in `language`: `preferred` if gradable, else the first that is. */
export function availableGroupFor(language: SignLanguage, preferred: SignGroup): SignGroup {
  const groups = getLanguage(language).groups;
  if (groups.find((g) => g.group === preferred)?.available) return preferred;
  return groups.find((g) => g.available)?.group ?? preferred;
}

export default function CurriculumTabs({ language, group, onChange, audience = "teacher", layout = "stacked" }: Props) {
  const student = audience === "student";
  const lang = getLanguage(language);
  const unavailable = lang.groups.filter((g) => !g.available);

  return (
    <View style={layout === "row" ? styles.row : undefined}>
      <SegmentedToggle
        size={student ? "kid" : "default"}
        options={CURRICULUM.map((l) => ({ key: l.language, label: l.label }))}
        value={language}
        onChange={(next) => onChange(next, availableGroupFor(next, group))}
      />
      <SegmentedToggle
        size={student ? "kid" : "default"}
        options={lang.groups.map((g) =>
          student
            ? { key: g.group, label: g.label, badge: g.available ? undefined : ("soon" as const) }
            : {
                key: g.group,
                label: g.available ? g.label : `${g.label} · soon`,
                disabled: !g.available,
              }
        )}
        value={group}
        onChange={(next) => onChange(language, next)}
      />
      {!student && unavailable.map((g) => (
        <Text key={g.group} style={styles.note}>
          {lang.label} {g.label}: {g.unavailableNote ?? "Not available yet."}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
});
