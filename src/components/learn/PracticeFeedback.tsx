// The one big feedback area on the practice screen (P7). Copy lives in
// src/lib/learnCopy.ts; this only draws a FeedbackModel. A wrong sign is
// never red - needsPractice only marks a save error.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import GlassCard from "../GlassCard";
import KidButton from "./KidButton";
import {
  AlertCircleIcon,
  ClockIcon,
  HandIcon,
  HelpCircleIcon,
  LightbulbIcon,
  MoonIcon,
  StarIcon,
} from "../icons/UiIcons";
import { colors, kidTypography, radii } from "../../theme/theme";
import { neuInset } from "../../theme/shadows";
import type { FeedbackModel } from "../../lib/learnCopy";

type Props = {
  model: FeedbackModel;
  compact?: boolean;
  /** Fill the parent's height (desktop bottom row), content centred vertically. */
  fill?: boolean;
  /** Smaller type for the one-row desktop strip, so everything fits one screen. */
  dense?: boolean;
};

export default function PracticeFeedback({ model, compact, fill, dense }: Props) {
  const iconSize = compact ? 24 : 28;
  const icon = (() => {
    switch (model.icon) {
      case "hand":
        return <HandIcon size={iconSize} color={colors.textSecondary} />;
      case "handGold":
        return <HandIcon size={iconSize} color={colors.accentCoral} />;
      case "star":
        return <StarIcon size={iconSize} color={colors.starFilled} />;
      case "moon":
        return <MoonIcon size={iconSize} color={colors.starResting} />;
      case "question":
        return <HelpCircleIcon size={iconSize} color={colors.textSecondary} />;
      case "alert":
        return <AlertCircleIcon size={iconSize} color={colors.needsPractice} />;
    }
  })();
  const headColor =
    model.tone === "success" ? colors.success : model.tone === "gold" ? colors.accentCoral : colors.textPrimary;

  return (
    <GlassCard
      radius={radii.lg}
      padding={dense ? 12 : compact ? 14 : 20}
      style={[fill && { flex: 1 }, model.icon === "alert" ? { borderColor: "rgba(224,82,95,0.5)" } : null]}
      contentStyle={[styles.row, fill && styles.rowFill]}
    >
      <View
        style={[styles.icon, neuInset("sm"), compact && { width: 44, height: 44 }, dense && { width: 40, height: 40 }]}
        accessible={false}
      >
        {icon}
      </View>
      <View style={styles.text} accessibilityLiveRegion="polite" accessible>
        <Text style={[kidTypography.kidHeadline, { color: headColor }, compact && styles.headCompact, dense && styles.headDense]} numberOfLines={dense ? 1 : undefined}>
          {model.headline}
        </Text>
        {model.body ? (
          <Text style={[kidTypography.kidBody, styles.body, dense && styles.bodyDense]} numberOfLines={dense ? 2 : undefined}>
            {model.body}
          </Text>
        ) : null}
        {model.chip ? (
          <View style={styles.chip}>
            <ClockIcon size={14} color={colors.textPrimary} />
            <Text style={styles.chipText}>{model.chip}</Text>
          </View>
        ) : null}
        {model.tip ? (
          <View style={[styles.tip, neuInset("sm"), dense && styles.tipDense]}>
            <LightbulbIcon size={dense ? 16 : 20} color={colors.tipAccent} />
            <Text style={[styles.tipText, dense && styles.tipTextDense]} numberOfLines={dense ? 1 : undefined}>
              <Text style={styles.tipLabel}>Tip: </Text>
              {model.tip}
            </Text>
          </View>
        ) : null}
        {model.action ? (
          <KidButton small label={model.action.label} onPress={model.action.onPress} style={styles.action} />
        ) : null}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  rowFill: { flex: 1, alignItems: "center" },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.neuWell,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0 },
  headCompact: { fontSize: 22, lineHeight: 26 },
  headDense: { fontSize: 19, lineHeight: 23 },
  bodyDense: { fontSize: 14, lineHeight: 19 },
  tipDense: { marginTop: 6, paddingVertical: 5, paddingHorizontal: 10 },
  tipTextDense: { fontSize: 13, lineHeight: 18 },
  body: { color: colors.textSecondary, marginTop: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 8,
  },
  chipText: { ...kidTypography.kidLabel, fontSize: 15, color: colors.textPrimary },
  tip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: colors.neuWell,
  },
  tipText: { ...kidTypography.kidBody, fontSize: 15, lineHeight: 22, color: colors.textPrimary, flex: 1 },
  tipLabel: { color: colors.tipAccent, fontFamily: kidTypography.kidLabel.fontFamily },
  action: { alignSelf: "flex-start", marginTop: 12 },
});
