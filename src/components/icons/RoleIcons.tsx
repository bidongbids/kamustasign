// Line icons for the role cards. Emoji render differently across Windows,
// macOS, iOS, and Android font stacks — a brand mark that looks different
// per OS defeats the point on an app that specifically targets desktop +
// mobile together — so these are hand-drawn SVGs instead, consistent on
// every platform react-native-svg supports.
import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

export type IconProps = {
  size?: number;
  color?: string;
};

export function GraduationCapIcon({ size = 22, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3 2 8l10 5 10-5-10-5Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path
        d="M6 10.5V16c0 1.66 2.69 3 6 3s6-1.34 6-3v-5.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M21 9v6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function ClipboardCheckIcon({ size = 22, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M6 6h12v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M9 12.5 11 14.5 15.5 10" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function GearIcon({ size = 22, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.55 1.55M7.15 16.85 5.6 18.4M18.4 18.4l-1.55-1.55M7.15 7.15 5.6 5.6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function VideoCameraIcon({ size = 22, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 7.5A1.5 1.5 0 0 1 5.5 6h8A1.5 1.5 0 0 1 15 7.5v9A1.5 1.5 0 0 1 13.5 18h-8A1.5 1.5 0 0 1 4 16.5v-9Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M15 10.2 19.2 7.8a.6.6 0 0 1 .9.52v7.36a.6.6 0 0 1-.9.52L15 13.8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
