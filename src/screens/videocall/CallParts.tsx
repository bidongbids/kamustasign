// Small building blocks of the call screen: the reader's status chip, the
// connection badge, the letter hold ring, the ringing avatar, the connecting
// spinner, the control toggles and the call's pill buttons. Everything says
// its state in words and a shape as well as a colour.
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";
import { AlertCircleIcon, CheckIcon, HandIcon } from "../../components/icons/UiIcons";
import { fonts, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { useReduceMotion } from "../../hooks/useReduceMotion";
import type { CallQuality } from "../../hooks/useVideoCall";
import type { ReaderPhase } from "../../hooks/useCallSignReader";
import { PHASE, initials, toneColor } from "./callUi";

export function PhaseChip({ phase, compact }: { phase: ReaderPhase; compact?: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const p = PHASE[phase];
  const c = toneColor(p.tone, colors);
  const icon =
    p.icon === "hand" ? (
      <HandIcon size={13} color={c} />
    ) : p.icon === "check" ? (
      <CheckIcon size={12} color={c} />
    ) : p.icon === "alert" ? (
      <AlertCircleIcon size={13} color={c} />
    ) : (
      <View style={[styles.chipDot, { backgroundColor: c }]} />
    );
  return (
    <View
      style={[styles.chip, compact && styles.chipCompact, { backgroundColor: p.tone === "neutral" ? "rgba(255,255,255,0.08)" : `${c}24` }]}
      accessibilityLabel={`Status: ${p.chip}`}
    >
      {icon}
      <Text style={[styles.chipText, { color: c }]}>{p.chip}</Text>
    </View>
  );
}

/** Signal bars + words: never colour alone. */
export function QualityBadge({ quality }: { quality: CallQuality }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const bars = quality.level === "good" ? 3 : quality.level === "fair" ? 2 : 1;
  const color = quality.level === "good" ? colors.qualityGood : quality.level === "fair" ? colors.qualityFair : colors.qualityPoor;
  const label = quality.level === "good" ? "Good connection" : quality.level === "fair" ? "OK connection" : "Weak connection";
  const detail = [
    quality.rttMs !== null ? `${quality.rttMs} ms` : null,
    quality.lossPct > 0 ? `${quality.lossPct}% lost` : null,
    quality.relayed ? "via relay" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.quality} accessibilityLabel={`${label}${quality.reduced ? ", your video is lowered to keep the call going" : ""}. ${detail}`}>
      <QualityBars bars={bars} color={color} />
      <Text style={[styles.qualityText, { color }]}>
        {label}
        {quality.reduced ? " · your video is lowered" : ""}
      </Text>
    </View>
  );
}

export function QualityBars({ bars, color }: { bars: number; color: string }) {
  const { colors } = useTheme();
  return (
    <Svg width={14} height={12} viewBox="0 0 14 12">
      {[0, 1, 2].map((i) => (
        <Rect key={i} x={i * 5} y={8 - i * 4} width={3.5} height={4 + i * 4} rx={1} fill={i < bars ? color : colors.holdTrack} />
      ))}
    </Svg>
  );
}

/** A glyph in a raised slab with the reader's hold progress as a ring around it. */
export function HoldRing({
  size,
  progress,
  glyph,
  done,
  glyphSize,
  dim,
}: {
  size: number;
  /** 0-1; the ring fills as a letter is held still. */
  progress: number;
  glyph: string;
  /** The letter was added (green ring). */
  done?: boolean;
  glyphSize?: number;
  dim?: boolean;
}) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const stroke = Math.max(4, Math.round(size / 16));
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const inner = size - stroke * 4;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={[styles.holdSlab, shadows.neuRaised("sm"), { width: inner, height: inner, borderRadius: inner / 2 }]}>
        <Text
          style={[styles.holdGlyph, { fontSize: glyphSize ?? Math.round(inner * 0.5), lineHeight: glyphSize ?? Math.round(inner * 0.5) }, dim && { color: colors.textTertiary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {glyph}
        </Text>
      </View>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.holdTrack} strokeWidth={stroke} />
        {progress > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={done ? colors.success : colors.accentCoral}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - Math.min(1, progress))}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
    </View>
  );
}

/**
 * The calling / incoming avatar with two halo rings. With motion allowed the
 * rings scale 1 -> 1.06 once every 1.6 s (well under 3 flashes a second);
 * with reduced motion they're static.
 */
export function RingingAvatar({ name, size, color }: { name: string; size: number; color: string }) {
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, scale]);
  const outer = Math.round(size * 1.72);
  const mid = Math.round(size * 1.36);
  return (
    <View style={{ width: outer, height: outer, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.halo, { width: outer, height: outer, borderRadius: outer / 2, transform: [{ scale }] }]} />
      <Animated.View style={[styles.halo, styles.haloMid, { width: mid, height: mid, borderRadius: mid / 2, transform: [{ scale }] }]} />
      <View style={[styles.avatarBig, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
        <Text style={[styles.avatarBigText, { color, fontSize: Math.round(size * 0.36) }]}>{initials(name)}</Text>
      </View>
    </View>
  );
}

export function CallAvatar({ name, size = 44, color }: { name: string; size?: number; color: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.avatarSmall, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
      <Text style={[styles.avatarSmallText, { color, fontSize: Math.round(size * 0.34) }]}>{initials(name)}</Text>
    </View>
  );
}

/** One arc that turns once a second; a still arc with reduced motion. */
export function SpinnerArc({ size = 40 }: { size?: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }} accessibilityElementsHidden>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.holdTrack} strokeWidth={4} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors.accentCoral}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${c * 0.28} ${c}`}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * Mute / Camera / Captions. On = raised; off = inset with a red icon and
 * label ("Muted", "Camera off", "Captions off"). Sizes: 56 adult, 64 child,
 * 52 phone. `inlineLabel` puts the label beside the button (laptop height).
 */
export function ControlToggle({
  label,
  offLabel,
  on,
  onPress,
  icon,
  size,
  inlineLabel,
}: {
  label: string;
  offLabel: string;
  on: boolean;
  onPress: () => void;
  icon: (color: string) => React.ReactNode;
  size: number;
  inlineLabel?: boolean;
}) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const color = on ? colors.textPrimary : colors.needsPracticeText;
  const text = on ? label : offLabel;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      style={[styles.ctrlWrap, inlineLabel && styles.ctrlWrapInline]}
      hitSlop={4}
    >
      <View
        style={[
          styles.ctrl,
          { width: size, height: size, borderRadius: size / 2 },
          on ? shadows.neuRaised("md") : [styles.ctrlOff, shadows.neuInset("sm")],
        ]}
      >
        {icon(color)}
      </View>
      <Text style={[styles.ctrlLabel, inlineLabel && styles.ctrlLabelInline, { color: on ? colors.textOnGlass : colors.needsPracticeText }]}>{text}</Text>
    </Pressable>
  );
}

export type PillVariant = "danger" | "dangerOutline" | "accept" | "primary" | "gold" | "raised" | "ghost";

/** The call screen's buttons. Heights: md 44, lg 52, xl 64 (anything a child taps). */
export function CallPill({
  label,
  onPress,
  variant = "raised",
  icon,
  size = "md",
  disabled,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: PillVariant;
  icon?: (color: string) => React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const h = size === "xl" ? 64 : size === "lg" ? 52 : size === "sm" ? 36 : 44;
  const fg =
    variant === "danger" || variant === "primary"
      ? "#FFFFFF"
      : variant === "accept"
        ? colors.textOnCallAccept
        : variant === "gold"
          ? colors.textOnAccent
          : variant === "dangerOutline"
            ? colors.needsPracticeText
            : colors.textPrimary;
  const bg =
    variant === "danger"
      ? colors.callDanger
      : variant === "accept"
        ? colors.callAccept
        : variant === "primary"
          ? colors.actionPrimaryFill
          : variant === "gold"
            ? colors.accentCoral
            : variant === "raised"
              ? colors.neuBase
              : "transparent";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.pill,
        {
          height: h,
          paddingHorizontal: size === "sm" ? 14 : size === "xl" ? 28 : 20,
          backgroundColor: bg,
          borderRadius: h / 2,
        },
        variant === "raised" && shadows.neuRaised("sm"),
        variant === "dangerOutline" && styles.pillDangerOutline,
        variant === "ghost" && styles.pillGhost,
        pressed && !disabled && { opacity: 0.85 },
        disabled && styles.pillDisabled,
        style,
      ]}
    >
      {icon ? icon(fg) : null}
      <Text style={[styles.pillText, size === "xl" && styles.pillTextXl, size === "sm" && styles.pillTextSm, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    alignSelf: "flex-start",
  },
  chipCompact: { paddingVertical: 3, paddingHorizontal: 8 },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  quality: { flexDirection: "row", alignItems: "center", gap: 6 },
  qualityText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  holdSlab: { alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  holdGlyph: { fontFamily: fonts.heading, color: colors.textPrimary },
  halo: { position: "absolute", borderWidth: 2, borderColor: colors.ringHalo },
  haloMid: { borderColor: colors.ringHalo, borderWidth: 3 },
  avatarBig: { alignItems: "center", justifyContent: "center", borderWidth: 2, backgroundColor: colors.neuBase },
  avatarBigText: { fontFamily: fonts.heading },
  avatarSmall: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, backgroundColor: colors.neuBase },
  avatarSmallText: { fontFamily: fonts.heading },
  ctrlWrap: { alignItems: "center", gap: 6 },
  ctrlWrapInline: { flexDirection: "row", gap: 10 },
  ctrl: { alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  ctrlOff: { backgroundColor: colors.neuWell },
  ctrlLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
  ctrlLabelInline: { fontSize: 14 },
  pill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  pillDangerOutline: { borderWidth: 1.5, borderColor: colors.needsPracticeText },
  pillGhost: { borderWidth: 1.5, borderColor: colors.border },
  pillDisabled: { opacity: 0.45 },
  pillText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  pillTextXl: { fontFamily: fonts.heading, fontSize: 20 },
  pillTextSm: { fontSize: 13 },
});
