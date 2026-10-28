// Small chrome icons for the translator header/controls — glyph placeholders
// called out in docs/design/design_handoff_kamustasign_material_pass/README.md ("▾", "?",
// "⌫" are stand-ins; use react-native-svg icons"). Kept separate from
// RoleIcons.tsx, which is scoped to the role-select cards.
import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

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

// ---- Student learning layer icons (Graphite Aurora "Kids") ----
// Same signature and line weight as the icons above. State never relies on
// colour alone: the star (filled/outline), moon (resting), and check
// (learned) are distinct shapes.

const STAR_PATH = "M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1L3.2 9.3l6.1-.9z";

export function StarIcon({ size = 16, color = "#000000", filled = true }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={STAR_PATH}
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={filled ? 1.2 : 2.2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function MoonIcon({ size = 16, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z" fill={color} />
    </Svg>
  );
}

export function SunIcon({ size = 16, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4.2} fill={color} />
      <Path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.55 1.55M17.15 17.15l1.55 1.55M5.3 18.7l1.55-1.55M17.15 6.85l1.55-1.55"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function CheckIcon({ size = 16, color = "#000000", strokeWidth = 3 }: IconProps & { strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.2 4.2L19 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function LightbulbIcon({ size = 20, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function HandIcon({ size = 24, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v7.5a7 7 0 0 1-7 7h-.6a6 6 0 0 1-4.6-2.2L3.5 15a1.5 1.5 0 0 1 2.3-1.9L8 15"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CameraIcon({ size = 24, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 7.5h3l2-2.5h8l2 2.5h3v11H3z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={3.5} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

export function ClockIcon({ size = 14, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={2} />
      <Path d="M12 7.5V12l3 2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function GearIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} />
      <Path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function LoopIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ArrowRightIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronUpIcon({ size = 14, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 15l7-7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function AlertCircleIcon({ size = 24, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M12 7.5v5.5M12 16.3v.2" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function EyeIcon({ size = 24, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

/** Full screen: four corner brackets pointing out. */
export function ExpandIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Class / account management (teacher + admin dashboards) ─────────────

/** Learning plan: an open book. */
export function BookIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Modules: stacked layers. */
export function LayersIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5l9 4.5-9 4.5-9-4.5 9-4.5z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M3 12.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

/** Progress: a rising bar chart. */
export function ChartIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20h16M7 16v-4M12 16V8M17 16V5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function PlusIcon({ size = 16, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function CloseIcon({ size = 16, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function PencilIcon({ size = 16, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TrashIcon({ size = 16, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function VideoIcon({ size = 16, color = "#000000", off = false }: IconProps & { off?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 7h12v10H3zM15 10.5l6-3.5v10l-6-3.5" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {off && <Path d="M3 3l18 18" stroke={color} strokeWidth={2.2} strokeLinecap="round" />}
    </Svg>
  );
}

export function SearchIcon({ size = 16, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.5} stroke={color} strokeWidth={2} />
      <Path d="M15.5 15.5L20 20" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function UsersIcon({ size = 16, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8} r={3.5} stroke={color} strokeWidth={2} />
      <Path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.8 3.1 2.5 3.5 5.2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// ---- Call controls ----
export function MicIcon({ size = 20, color = "#000000", off = false }: IconProps & { off?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" stroke={color} strokeWidth={2} strokeLinecap="round" />
      {off && <Path d="M4 4l16 16" stroke={color} strokeWidth={2.2} strokeLinecap="round" />}
    </Svg>
  );
}

export function PhoneOffIcon({ size = 20, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 14.5c4.7-4.2 12.3-4.2 17 0l-1.9 2.6a1 1 0 0 1-1.2.3l-2.6-1.1a1 1 0 0 1-.6-.9v-1.6a12 12 0 0 0-4.4 0v1.6a1 1 0 0 1-.6.9l-2.6 1.1a1 1 0 0 1-1.2-.3z"
        fill={color}
      />
    </Svg>
  );
}

export function PhoneIcon({ size = 20, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 3.5h3.2l1.6 4-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2 4 1.6V17a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3 5.7 2 2 0 0 1 5 3.5z"
        fill={color}
      />
    </Svg>
  );
}

export function CaptionsIcon({ size = 20, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 5.5h18v13H3z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M7 11h4M13 11h4M7 14.5h7" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// Tools (call drawer) - three sliders.
export function SlidersIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4v6M5 14v6M12 4v4M12 12v8M19 4v10M19 18v2M3 10h4M10 8h4M17 14h4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function DownloadIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4v11M7 10l5 5 5-5M5 20h14" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// "Not yet" in practice results - a circular retry arrow.
export function RetryIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// More actions (row menus).
export function MoreIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={5} cy={12} r={1.8} fill={color} />
      <Circle cx={12} cy={12} r={1.8} fill={color} />
      <Circle cx={19} cy={12} r={1.8} fill={color} />
    </Svg>
  );
}

// Teacher dashboard (design T1-T11): the rail, Today's rows, the class code.
export function HomeIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// "The class is stuck on ..." - a flag.
export function FlagIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 21V4M5 4h11l-2 4 2 4H5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Due dates.
export function CalendarIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={5} width={17} height={15.5} rx={2.5} stroke={color} strokeWidth={2} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// "Students are waiting for a class" - an inbox tray.
export function InboxIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 13.5 5.5 5h13L21 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19v-5.5Zm0 0h5l1.5 2.5h5L16 13.5h5"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CopyIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={8.5} y={8.5} width={12} height={12} rx={2.5} stroke={color} strokeWidth={2} />
      <Path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

export function PrinterIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 8V3.5h10V8M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Rect x={7} y={13.5} width={10} height={7} rx={1} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

// Modules by category / no modules yet - four squares.
export function GridIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={6.5} height={6.5} rx={1.5} stroke={color} strokeWidth={2} />
      <Rect x={13.5} y={4} width={6.5} height={6.5} rx={1.5} stroke={color} strokeWidth={2} />
      <Rect x={4} y={13.5} width={6.5} height={6.5} rx={1.5} stroke={color} strokeWidth={2} />
      <Rect x={13.5} y={13.5} width={6.5} height={6.5} rx={1.5} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

// A locked choice (admin: "You can't change your own role").
export function ShieldIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

export function MonitorIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={3.5} width={19} height={13} rx={2} stroke={color} strokeWidth={2} />
      <Path d="M8 21h8M12 16.5V21" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function PaletteIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 22a10 10 0 1 1 10-10c0 3-2.5 4-4.5 4H15a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx={7.5} cy={10.5} r={1.3} fill={color} />
      <Circle cx={11} cy={7} r={1.3} fill={color} />
      <Circle cx={16} cy={8.5} r={1.3} fill={color} />
    </Svg>
  );
}

export function SignOutIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function UserIcon({ size = 18, color = "#000000" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={2} />
      <Path d="M4 21a8 8 0 0 1 16 0" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
