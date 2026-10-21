// The one progress bar the classroom uses - student group, student overall,
// and teacher/admin per-student. Kept as a single component so the three
// can't drift apart: a teacher and a student discussing "your progress" must
// be looking at the same thing. Same inset-track / filled-pill material as
// SegmentedToggle and the camera panel's holding meter.
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, kidTypography, typography } from "../theme/theme";
import { neuInset } from "../theme/shadows";

export type ProgressTone = "empty" | "progress" | "nearlyDone" | "complete";

type Props = {
  /** 0-1; clamped. */
  value: number;
  /** Left of the percentage, e.g. "12 of 26 mastered". */
  label?: string;
  /** Under the bar, e.g. how the figure is computed. */
  caption?: string;
  /** Defaults to toneFor(value). */
  tone?: ProgressTone;
  /** Compact: a thinner bar with the percentage beside it, for table rows. */
  compact?: boolean;
  /** Label/caption colour - frosted cards need dark text, the dark ground light. */
  onFrosted?: boolean;
  /**
   * What sits right of the label. "percent" (default) is the teacher/admin
   * view. "count" / "none" hide the % for children - the label carries the
   * words ("41 signs learned") while the fill and accessibilityValue keep the
   * exact same 0-100 value, so a teacher can still say "34%" about it.
   */
  readout?: "percent" | "count" | "none";
  /** "kid": label in kidLabel (16px) for the student learning plan. */
  size?: "default" | "kid";
  style?: StyleProp<ViewStyle>;
};

export function toneFor(value: number): ProgressTone {
  if (value <= 0) return "empty";
  if (value >= 1) return "complete";
  if (value >= 0.8) return "nearlyDone";
  return "progress";
}

const FILL: Record<ProgressTone, [string, string]> = {
  empty: [colors.primaryTealDark, colors.primaryTeal],
  progress: [colors.primaryTealDark, colors.primaryTeal],
  nearlyDone: [colors.accentCoralDark, colors.accentCoral],
  complete: ["#2E8A50", colors.success],
};

export default function ProgressBar({
  value,
  label,
  caption,
  tone,
  compact,
  onFrosted,
  readout = "percent",
  size = "default",
  style,
}: Props) {
  const showPct = readout === "percent";
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const pct = Math.round(clamped * 100);
  const resolvedTone = tone ?? toneFor(clamped);
  const textColor = onFrosted ? colors.textOnFrosted : colors.textPrimary;
  const mutedColor = onFrosted ? colors.textOnFrostedMuted : colors.textSecondary;

  const track = (
    <View
      style={[styles.track, compact ? styles.trackCompact : styles.trackFull, neuInset("sm"), compact && styles.flex]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      accessibilityLabel={label}
    >
      {clamped > 0 && (
        <LinearGradient
          colors={FILL[resolvedTone]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          // A sliver under ~3% would render as a dot; keep it a visible pill.
          style={[styles.fill, { width: `${Math.max(pct, 3)}%` }]}
        />
      )}
    </View>
  );

  if (compact) {
    return (
      <View style={[styles.compactRow, style]}>
        {track}
        {showPct ? <Text style={[styles.pctCompact, { color: textColor }]}>{pct}%</Text> : null}
      </View>
    );
  }

  return (
    <View style={style}>
      <View style={styles.header}>
        <Text style={[size === "kid" ? styles.labelKid : styles.label, { color: textColor }]} numberOfLines={1}>
          {label ?? ""}
        </Text>
        {showPct ? <Text style={[styles.pct, { color: textColor }]}>{pct}%</Text> : null}
      </View>
      {track}
      {caption ? <Text style={[styles.caption, { color: mutedColor }]}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 12,
  },
  label: { ...typography.labelSm, flexShrink: 1, lineHeight: 18 },
  labelKid: { ...kidTypography.kidLabel, flexShrink: 1 },
  pct: { ...typography.label, lineHeight: 18 },
  track: {
    backgroundColor: colors.neuWell,
    borderRadius: 999,
    padding: 3,
    overflow: "hidden",
  },
  trackFull: { height: 16 },
  trackCompact: { height: 10, padding: 2 },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  caption: { ...typography.caption, marginTop: 6 },
  compactRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pctCompact: { ...typography.labelSm, width: 38, textAlign: "right" },
});
