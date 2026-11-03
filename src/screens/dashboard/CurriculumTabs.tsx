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
import { typography, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";

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
  /** Teacher: the line naming a group with no model. Off where the tab's "· soon" says enough. */
  note?: boolean;
  /** Student: "21/26" inside each group's tab. */
  counts?: Partial<Record<SignGroup, string>>;
  /** In a row with other controls (no padding above, not centred). */
  inline?: boolean;
  /**
   * Student: which groups to offer (the class plan can switch groups off).
   * A language with none is left out; with one language left, its toggle is too.
   */
  shown?: (language: SignLanguage, group: SignGroup) => boolean;
};

/** The group to land on in `language`: `preferred` if gradable, else the first that is. */
export function availableGroupFor(language: SignLanguage, preferred: SignGroup): SignGroup {
  const groups = getLanguage(language).groups;
  if (groups.find((g) => g.group === preferred)?.available) return preferred;
  return groups.find((g) => g.available)?.group ?? preferred;
}

export default function CurriculumTabs({ language, group, onChange, audience = "teacher", layout = "stacked", note = true, counts, inline, shown }: Props) {
  const styles = useThemedStyles(makeStyles);
  const student = audience === "student";
  const lang = getLanguage(language);
  const unavailable = lang.groups.filter((g) => !g.available);
  const isShown = (l: SignLanguage, g: SignGroup) => !shown || shown(l, g);
  const languages = CURRICULUM.filter((l) => l.groups.some((g) => isShown(l.language, g.group)));
  const groupIn = (l: SignLanguage) => {
    const preferred = availableGroupFor(l, group);
    if (isShown(l, preferred)) return preferred;
    return getLanguage(l).groups.find((g) => g.available && isShown(l, g.group))?.group ?? preferred;
  };

  return (
    <View style={layout === "row" ? styles.row : inline ? styles.stack : undefined}>
      {languages.length > 1 || !shown ? (
        <SegmentedToggle
          size={student ? "kid" : "default"}
          inline={inline}
          options={languages.map((l) => ({ key: l.language, label: l.label }))}
          value={language}
          onChange={(next) => onChange(next, groupIn(next))}
        />
      ) : null}
      <SegmentedToggle
        size={student ? "kid" : "default"}
        inline={inline}
        options={lang.groups.filter((g) => isShown(language, g.group)).map((g) =>
          student
            ? { key: g.group, label: g.label, badge: g.available ? undefined : ("soon" as const), count: g.available ? counts?.[g.group] : undefined }
            : {
                key: g.group,
                label: g.available ? g.label : `${g.label} · soon`,
                disabled: !g.available,
              }
        )}
        value={group}
        onChange={(next) => onChange(language, next)}
      />
      {!student && note && unavailable.map((g) => (
        <Text key={g.group} style={styles.note}>
          {lang.label} {g.label}: {g.unavailableNote ?? "Not available yet."}
        </Text>
      ))}
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" },
  stack: { gap: 10, alignItems: "flex-start" },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
});
