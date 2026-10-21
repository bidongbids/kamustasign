// Small chrome icons for the translator header/controls — glyph placeholders
// called out in design_handoff_kamustasign_material_pass/README.md ("▾", "?",
// "⌫" are stand-ins; use react-native-svg icons"). Kept separate from
// RoleIcons.tsx, which is scoped to the role-select cards.
import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

export type IconProps = {
  size?: number;
  color?: string;
};

export function ChevronDownIcon({ size = 14, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 9l7 7 7-7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 14, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function HelpCircleIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path
        d="M9.5 9.3a2.5 2.5 0 1 1 3.6 2.25C12.3 12 12 12.5 12 13.3v.4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={16.7} r={1.05} fill={color} />
    </Svg>
  );
}

export function SpeakerIcon({ size = 16, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9.5v5h4l5 4v-13l-5 4H4Z" fill={color} stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
      <Path
        d="M17 8.5a5 5 0 0 1 0 7"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M19.3 6.2a8.5 8.5 0 0 1 0 11.6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function PlayIcon({ size = 16, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 4.5v15l13-7.5-13-7.5Z" fill={color} stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
    </Svg>
  );
}

export function BackspaceIcon({ size = 20, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5h10a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H9l-6-7 6-7Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M12.5 9.5l5 5m0-5-5 5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
