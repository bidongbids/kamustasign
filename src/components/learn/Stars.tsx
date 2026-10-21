// Stars = counted passes (lesson_progress.passes), one each, three to learn
// a sign. Filled starFilled; not yet = starEmpty outline; the newest one in
// starResting while its cooldown runs (always shown with the moon elsewhere).
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { StarIcon } from "../icons/UiIcons";
import { colors, kidTypography, sizes } from "../../theme/theme";
import { neuInset } from "../../theme/shadows";
import { MASTERY_PASSES } from "../../lib/curriculum";

export function StarRow({
  filled,
  resting = false,
  size = sizes.starSm,
  gap = 3,
  animateIndex,
  scale,
}: {
  filled: number;
  resting?: boolean;
  size?: number;
  gap?: number;
  animateIndex?: number;
  scale?: Animated.Value;
}) {
  return (
    <View style={{ flexDirection: "row", gap }} accessible={false}>
      {Array.from({ length: MASTERY_PASSES }).map((_, i) => {
        const on = i < filled;
        const color = !on ? colors.starEmpty : resting && i === filled - 1 ? colors.starResting : colors.starFilled;
        const star = <StarIcon size={size} color={color} filled={on} />;
        return i === animateIndex && scale ? (
          <Animated.View key={i} style={{ transform: [{ scale }] }}>
            {star}
          </Animated.View>
        ) : (
          <View key={i}>{star}</View>
        );
      })}
    </View>
  );
}

/** P3: the three big stars on the practice screen, in an inset well. */
export function StarMeter({
  passes,
  resting,
  size = sizes.starLg,
  reduceMotion,
  showCaption = true,
}: {
  passes: number;
  resting: boolean;
  size?: number;
  reduceMotion?: boolean;
  showCaption?: boolean;
}) {
  const filled = Math.min(passes, MASTERY_PASSES);
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(filled);
  useEffect(() => {
    if (filled > prev.current && !reduceMotion) {
      scale.setValue(0);
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
    }
    prev.current = filled;
  }, [filled, reduceMotion, scale]);

  const caption =
    filled >= MASTERY_PASSES
      ? "You learned it!"
      : resting
        ? "Your star is resting"
        : filled === 0
          ? "Earn 3 stars"
          : `${filled} star${filled === 1 ? "" : "s"} · ${MASTERY_PASSES - filled} to go`;

  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel={`${filled} of ${MASTERY_PASSES} stars`}>
      <View style={[styles.well, neuInset("sm"), { paddingVertical: size * 0.25, paddingHorizontal: size * 0.4 }]}>
        <StarRow filled={filled} resting={resting} size={size} gap={size * 0.22} animateIndex={filled - 1} scale={scale} />
      </View>
      {showCaption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, alignItems: "flex-start" },
  well: { backgroundColor: colors.neuWell, borderRadius: 999 },
  caption: { ...kidTypography.kidBody, color: colors.textSecondary },
});
