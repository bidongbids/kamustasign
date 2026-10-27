// P6: the 3rd counted pass - the only time a sign becomes "learned".
// ~900ms, played once, skippable (tap / Esc jumps to the final frame),
// static under reduced motion. RN Animated only; nothing loops or flashes.
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import GlassCard from "../GlassCard";
import KidButton from "./KidButton";
import { StarRow } from "./Stars";
import { STAR_COUNT } from "../../lib/starReference";
import { ArrowRightIcon, CheckIcon } from "../icons/UiIcons";
import { colors, kidTypography, radii } from "../../theme/theme";

type Props = {
  sign: string;
  /** Accuracy stars at the moment of learning (0-3). */
  stars: number;
  nextSign: string | null;
  groupLabel: string;
  reduceMotion: boolean;
  onNext: () => void;
  onBack: () => void;
  onDismiss: () => void;
};

const DOTS: [number, number, number, string][] = [
  [-250, -150, 9, colors.accentCoral],
  [255, -120, 7, colors.primaryTealLight],
  [-285, 10, 6, colors.primaryTealLight],
  [285, 30, 10, colors.accentCoral],
  [-235, 160, 5, colors.success],
  [240, 175, 6, colors.success],
  [-300, -70, 5, colors.accentCoral],
  [310, -40, 6, colors.accentCoral],
];

export default function MasteryCelebration({ sign, stars, nextSign, groupLabel, reduceMotion, onNext, onBack, onDismiss }: Props) {
  const t = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const [done, setDone] = useState(reduceMotion);
  const nextRef = useRef<View>(null);

  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start(() => setDone(true));
    return () => anim.stop();
  }, [reduceMotion, t]);

  const finish = () => {
    t.stopAnimation();
    t.setValue(1);
    setDone(true);
  };

  useEffect(() => {
    // Move focus to the primary action once it can be pressed.
    if (done) (nextRef.current as any)?.focus?.();
  }, [done]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      done ? onDismiss() : finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cardOpacity = t.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, 1, 1] });
  const cardY = t.interpolate({ inputRange: [0, 0.22, 1], outputRange: [12, 0, 0] });
  const starScale = t.interpolate({ inputRange: [0, 0.22, 0.45, 0.58, 1], outputRange: [0, 0, 1.15, 1, 1] });
  const discScale = t.interpolate({ inputRange: [0, 0.58, 0.8, 1], outputRange: [0.6, 0.6, 1.06, 1] });
  const dotsOut = t.interpolate({ inputRange: [0, 0.58, 1], outputRange: [0, 0, 1] });
  const dotsOpacity = t.interpolate({ inputRange: [0, 0.58, 0.85, 1], outputRange: [0, 1, 1, 0] });

  return (
    <Pressable style={styles.scrim} onPress={done ? undefined : finish} accessible={false}>
      {!reduceMotion &&
        DOTS.map(([x, y, r, c], i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.dot,
              {
                width: r * 2,
                height: r * 2,
                borderRadius: r,
                backgroundColor: c,
                opacity: dotsOpacity,
                transform: [
                  { translateX: dotsOut.interpolate({ inputRange: [0, 1], outputRange: [x * 0.6, x] }) },
                  { translateY: dotsOut.interpolate({ inputRange: [0, 1], outputRange: [y * 0.6, y] }) },
                ],
              },
            ]}
          />
        ))}
      <Animated.View style={{ opacity: cardOpacity, transform: [{ translateY: cardY }] }}>
        <GlassCard
          radius={radii.lg}
          padding={28}
          dropShadow
          style={styles.card}
          contentStyle={styles.cardContent}
        >
          <View accessibilityRole="alert" accessibilityLabel={`You learned ${sign}`} style={styles.cardContent}>
            <Animated.View style={[styles.disc, { transform: [{ scale: discScale }] }]}>
              <CheckIcon size={60} color={colors.textOnFrosted} strokeWidth={3} />
            </Animated.View>
            <Text style={[kidTypography.kidTarget, styles.sign, sign.length > 2 && kidTypography.kidTargetWord]} numberOfLines={2}>
              {sign}
            </Text>
            <Text style={[kidTypography.kidHeadline, styles.head]}>
              {nextSign ? `You learned ${sign}!` : `You finished ${groupLabel}!`}
            </Text>
            <View style={styles.stars}>
              <StarRow filled={stars} size={40} gap={12} animateIndex={Math.max(0, Math.ceil(stars) - 1)} scale={starScale as any} />
            </View>
            <Text style={[kidTypography.kidBody, styles.body]}>
              {stars >= STAR_COUNT ? "All 3 stars - perfect signing!" : "Keep practising to fill your stars."}
            </Text>
            <View style={styles.buttons}>
              {nextSign ? (
                <KidButton
                  ref={nextRef}
                  variant="primary"
                  label={`Next sign: ${nextSign}`}
                  onPress={onNext}
                  iconRight={<ArrowRightIcon size={20} color={colors.textOnAccent} />}
                  style={styles.full}
                />
              ) : null}
              <KidButton
                ref={nextSign ? undefined : nextRef}
                variant={nextSign ? "raised" : "primary"}
                label="Back to my plan"
                onPress={onBack}
                style={styles.full}
              />
            </View>
          </View>
        </GlassCard>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  dot: { position: "absolute", top: "45%", left: "50%" },
  card: { width: 420, maxWidth: "100%" },
  cardContent: { alignItems: "center", alignSelf: "stretch" },
  disc: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    boxShadow: [
      { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 6, color: "rgba(242,178,62,0.22)" },
      { offsetX: 0, offsetY: 0, blurRadius: 28, color: colors.celebrationGlow },
    ],
  } as any,
  sign: { color: colors.accentCoral, fontSize: 64, lineHeight: 68, textAlign: "center" },
  head: { color: colors.textPrimary, textAlign: "center", marginTop: 4 },
  stars: { marginVertical: 10 },
  body: { color: colors.textSecondary, textAlign: "center" },
  buttons: { alignSelf: "stretch", gap: 12, marginTop: 20 },
  full: { alignSelf: "stretch" },
});
