// Stars = accuracy (src/lib/starReference.ts): how close the student's best
// attempt is to what the model gives a correctly made sign, 0-3 in quarter
// steps. Each star fills left to right: an outline in starEmpty with the
// filled star clipped to its fraction on top. Learning a sign is separate
// (one pass learns it).
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { StarIcon } from "../icons/UiIcons";
import { colors, kidTypography, sizes } from "../../theme/theme";
import { neuInset } from "../../theme/shadows";
import { MASTERY_PASSES } from "../../lib/curriculum";
import { STAR_COUNT, starsText } from "../../lib/starReference";

export function StarRow({
  filled,
  size = sizes.starSm,
  gap = 3,
  animateIndex,
  scale,
}: {
  /** 0-3, fractions allowed (quarter steps). */
  filled: number;
  size?: number;
  gap?: number;
  animateIndex?: number;
  scale?: Animated.Value;
}) {
  return (
    <View style={{ flexDirection: "row", gap }} accessible={false}>
      {Array.from({ length: STAR_COUNT }).map((_, i) => {
        const part = Math.max(0, Math.min(1, filled - i));
        const star = (
          <View style={{ width: size, height: size }}>
            <StarIcon size={size} color={part >= 1 ? colors.starFilled : colors.starEmpty} filled={part >= 1} />
            {part > 0 && part < 1 && (
              <View style={[StyleSheet.absoluteFill, { width: size * part, overflow: "hidden" }]}>
                <StarIcon size={size} color={colors.starFilled} />
              </View>
            )}
          </View>
        );
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
  stars,
  passes,
  size = sizes.starLg,
  reduceMotion,
  showCaption = true,
}: {
  /** Accuracy stars, 0-3. */
  stars: number;
  /** Counted passes - learning the sign, shown in the caption. */
  passes: number;
  size?: number;
  reduceMotion?: boolean;
  showCaption?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(stars);
  useEffect(() => {
    if (stars > prev.current && !reduceMotion) {
      scale.setValue(0.6);
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
    }
    prev.current = stars;
  }, [stars, reduceMotion, scale]);

  const caption = passes >= MASTERY_PASSES ? "You learned it!" : "One good try to learn it";

  return (
    <View
      style={styles.wrap}
      accessibilityRole="image"
      accessibilityLabel={`${starsText(stars)} of ${STAR_COUNT}. ${caption}`}
    >
      <View style={[styles.well, neuInset("sm"), { paddingVertical: size * 0.25, paddingHorizontal: size * 0.4 }]}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <StarRow filled={stars} size={size} gap={size * 0.22} />
        </Animated.View>
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
