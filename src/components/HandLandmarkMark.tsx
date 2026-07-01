// src/components/HandLandmarkMark.tsx
// Reusable hand-landmark dot/line motif — echoes the MediaPipe hand skeleton.
// Used as the app logo on the Role Select screen, and reusable later as a
// loading/processing indicator during live sign recognition.

import React from "react";
import Svg, { Circle, Line } from "react-native-svg";
import { colors } from "../theme/theme";

type Props = {
  size?: number;
  color?: string;
  dotColor?: string;
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
  color = colors.primaryTeal,
  dotColor = colors.accentMarigold,
}: Props) {
  return (
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
  );
}
