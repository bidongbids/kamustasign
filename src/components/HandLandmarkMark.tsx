// src/components/HandLandmarkMark.tsx
// Reusable hand-landmark dot/line motif — echoes the MediaPipe hand skeleton.
// Used as the app logo on the Role Select screen, and reusable later as a
// loading/processing indicator during live sign recognition.

import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { useReduceMotion } from "../hooks/useReduceMotion";

type Props = {
  size?: number;
  color?: string;
  dotColor?: string;
  // Gentle idle "breathing" loop — on by default since this mark stands in
  // for the live landmark-detection motif; set false anywhere it needs to
  // sit still (e.g. next to running text).
  animated?: boolean;
};

// Simplified 21-point hand landmark layout (MediaPipe hand topology),
// normalized to a 100x100 viewBox.
const POINTS: [number, number][] = [
  [50, 90], // 0 wrist
  [35, 75], [25, 60], [18, 48], [12, 38], // thumb
  [42, 55], [40, 35], [39, 20], [38, 8], // index
  [50, 52], [49, 28], [49, 12], [49, 0], // middle
  [58, 54], [60, 32], [61, 17], [62, 5], // ring
  [66, 60], [70, 42], [73, 29], [75, 18], // pinky
];

// Bone connections (pairs of point indices)
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

export default function HandLandmarkMark({
  size = 96,
  color: colorProp,
  dotColor: dotColorProp,
  animated = true,
}: Props) {
  const { colors } = useTheme();
  const color = colorProp ?? colors.primaryTeal;
  const dotColor = dotColorProp ?? colors.accentCoral;
  const pulse = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    // An endless pulse is exactly what reduced motion asks us not to do.
    if (!animated || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animated, reduceMotion, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });

  return (
    <Animated.View
      style={{ width: size, height: size, transform: animated ? [{ scale }] : undefined }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {CONNECTIONS.map(([a, b], i) => {
          const [x1, y1] = POINTS[a];
          const [x2, y2] = POINTS[b];
          return (
            <Line
              key={`line-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          );
        })}
        {POINTS.map(([x, y], i) => (
          <Circle
            key={`dot-${i}`}
            cx={x}
            cy={y}
            r={i === 0 ? 4.5 : 3}
            fill={i === 0 ? color : dotColor}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}
