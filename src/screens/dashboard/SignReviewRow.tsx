// One sign in the teacher's "to review" card - laid out like
// StudentProgressRow so the two lists read as one table style.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import ProgressBar from "../../components/ProgressBar";
import { dashboardStyles as ds } from "./DashboardShell";
import { PASS_CONFIDENCE } from "../../lib/curriculum";
import type { SignInsight } from "../../lib/classInsights";

type Props = { insight: SignInsight; first?: boolean };

export default function SignReviewRow({ insight: s, first }: Props) {
  const best = s.stuckBest !== null ? Math.round(s.stuckBest * 100) : null;
  return (
    <View style={[ds.listItem, first && ds.listItemFirst, styles.row]}>
      <Text style={[ds.itemTitle, styles.sign]} numberOfLines={1}>
        {s.sign}
      </Text>
      <View style={styles.detail}>
        <ProgressBar compact value={s.tried ? s.learned / s.tried : 0} label={`${s.sign}: share of students who learned it`} />
        <Text style={ds.itemMeta}>
          {s.learned} of {s.tried} learned · {s.stuck} still learning · {s.attempts} attempts
          {best !== null ? ` · their best ${best}% (pass: ${Math.round(PASS_CONFIDENCE * 100)}%)` : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  sign: { width: 150 },
  detail: { flex: 1, minWidth: 200 },
});
