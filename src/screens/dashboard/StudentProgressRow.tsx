// One student's progress line, shared by the teacher and admin dashboards so
// both show the same overall figure (computeOverall) through the same
// ProgressBar as the student's own dashboard.
//
//   Maria Santos   ██████░░░░ 58%
//                  ASL  L 26/26 · N soon · W 31/133
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import ProgressBar from "../../components/ProgressBar";
import { useDashboardStyles } from "./DashboardShell";
import {
  computeOverall,
  getLanguage,
  groupKey,
  groupOff,
  planSigns,
  type ClassPlan,
  type MasteredCounts,
  type SignGroup,
  type SignLanguage,
} from "../../lib/curriculum";
import { fonts, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";

type Props = {
  name: string;
  mastered: MasteredCounts;
  /** The class's learning plan; totals count only its words. */
  plan?: ClassPlan | null;
  language: SignLanguage;
  /** Emphasised in the counts line (the group tab the viewer picked). */
  highlightGroup?: SignGroup;
  first?: boolean;
};

export default function StudentProgressRow({ name, mastered, plan, language, highlightGroup, first }: Props) {
  const ds = useDashboardStyles();
  const styles = useThemedStyles(makeStyles);
  const lang = getLanguage(language);
  return (
    <View style={[ds.listItem, first && ds.listItemFirst, styles.row]}>
      <Text style={[ds.itemTitle, styles.name]} numberOfLines={1}>
        {name || "(no name)"}
      </Text>
      <View style={styles.detail}>
        <ProgressBar compact value={computeOverall(mastered, plan)} label={`${name} overall progress`} />
        <Text style={ds.itemMeta}>
          {lang.label}
          {"  "}
          {lang.groups.map((g, i) => (
            <Text key={g.group} style={g.group === highlightGroup ? styles.highlight : undefined}>
              {i > 0 ? " · " : ""}
              {g.label[0]}{" "}
              {!g.available
                ? "soon"
                : groupOff(language, g.group, plan)
                  ? "off"
                  : `${mastered[groupKey(language, g.group)] ?? 0}/${planSigns(language, g.group, plan).length}`}
            </Text>
          ))}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  name: { width: 150 },
  detail: { flex: 1, minWidth: 200 },
  highlight: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
});
