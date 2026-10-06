// src/components/ConfidenceDial.tsx
// The Letters screen's instrument gauge — one of the four skeuomorphic hero
// objects called out in design_handoff_kamustasign_material_pass/README.md.
// An inset neumorphic well holding an SVG conic sweep: `success`-colored arc
// from a 220° start for `percent` of the circle, remainder a faint ring.
// There's no RN conic-gradient primitive, so this is drawn as a stroked
// circle with strokeDasharray/strokeDashoffset (see README's "RN
// implementation notes" #4) instead of trying to fake one with gradients.
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, typography } from "../theme/theme";
import { neuInset } from "../theme/shadows";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  size?: number;
  percent: number; // 0-100
  pctSize?: number;
  metaSize?: number;
  reduceMotion?: boolean;
};

export default function ConfidenceDial({ size = 118, percent, pctSize = 27, metaSize = 8.5, reduceMotion = false }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const anim = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(clamped);
      return;
    }
    Animated.timing(anim, { toValue: clamped, duration: 180, useNativeDriver: false }).start();
  }, [clamped, reduceMotion, anim]);

  const strokeWidth = Math.round(size * 0.085);
  const inset = Math.round(size * 0.05);
  const r = size / 2 - strokeWidth / 2 - inset;
  const circumference = 2 * Math.PI * r;
  const dashoffset = anim.interpolate({ inputRange: [0, 100], outputRange: [circumference, 0] });

  return (
    <View style={[styles.well, { width: size, height: size, borderRadius: size, backgroundColor: colors.neuWell }, neuInset("md")]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.success}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashoffset}
          strokeLinecap="butt"
          transform={`rotate(-140 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={{ color: colors.textPrimary }}>
          <Text style={[typography.h1, { fontSize: pctSize, lineHeight: pctSize + 2 }]}>{Math.round(clamped)}</Text>
          <Text style={[typography.body, { fontSize: pctSize * 0.55 }]}>%</Text>
        </Text>
        <Text style={[typography.meta, styles.metaLabel, { fontSize: metaSize }]}>CONFIDENCE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
  },
  metaLabel: {
    color: colors.textTertiary,
    marginTop: 2,
  },
});
