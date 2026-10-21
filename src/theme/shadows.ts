// Soft, brand-tinted shadows (teal-tinted instead of flat black) so cards
// read as layered/elevated rather than flat-with-a-border. Works across iOS
// (shadow*), Android (elevation), and web (react-native-web maps shadow* to
// box-shadow automatically).
//
// Every helper exists once per theme: makeShadows(name) builds the set, and
// useTheme().shadows (src/theme/ThemeProvider.tsx) hands a screen the set
// for the active theme. The module-level exports below are the dark set,
// unchanged, for screens that haven't moved to useTheme() yet.
import { ViewStyle } from "react-native";
import { darkColors, lightColors, ThemeName } from "./theme";

type ShadowLevel = "sm" | "md" | "lg";

const presets: Record<ShadowLevel, { offset: number; opacity: number; radius: number; elevation: number }> = {
  sm: { offset: 2, opacity: 0.08, radius: 6, elevation: 2 },
  md: { offset: 6, opacity: 0.12, radius: 16, elevation: 6 },
  lg: { offset: 14, opacity: 0.16, radius: 30, elevation: 12 },
};

// Neumorphic double-shadow helpers — the "controls" material in the
// Graphite Aurora material system (docs/design/design_handoff_kamustasign_material_pass
// /README.md: "NEUMORPHIC -> controls"). RN 0.81+ / Expo SDK 56 supports
// `boxShadow` as an array of shadow objects (with `inset`) on web, iOS and
// Android, so these compose two literal shadow objects — a dark one bottom-
// right, a light one top-left — on top of a flat `neuBase`/`neuWell` fill
// passed via `backgroundColor` at the call site. Do not inline these by
// hand; every raised/inset control in the app should share one geometry.
//
// `size` scales offset/blur together so small controls (pills, 34px tiles)
// and large ones (118px medallions, the confidence dial) can both ask for a
// single number rather than picking offset+blur by hand each time.
type NeuSize = "sm" | "md" | "lg";

const raisedPresets: Record<NeuSize, { offset: number; blur: number }> = {
  sm: { offset: 3, blur: 8 },
  md: { offset: 5, blur: 12 },
  lg: { offset: 7, blur: 18 },
};

const insetPresets: Record<NeuSize, { offset: number; blur: number }> = {
  sm: { offset: 3, blur: 7 },
  md: { offset: 4, blur: 10 },
  lg: { offset: 5, blur: 12 },
};

// Light theme geometry (docs/KAMUSTASIGN_LIGHT_THEME_HANDOFF.md §3): the far
// shadow drops further than it rises (x, y differ), and raised controls get
// a 1px hairline border so they still separate from the pale ground.
const LIGHT_FAR = "rgba(102,114,146,";
const LIGHT_NEAR = "rgba(255,255,255,";
const lightRaised: Record<NeuSize, { far: [number, number, number, number]; near: [number, number, number, number] }> = {
  sm: { far: [2, 3, 7, 0.26], near: [-2, -2, 5, 0.9] },
  md: { far: [4, 6, 14, 0.28], near: [-4, -4, 10, 0.9] },
  lg: { far: [6, 9, 20, 0.28], near: [-5, -5, 14, 0.9] },
};
const lightInset: Record<NeuSize, number> = { sm: 2, md: 3, lg: 4 };

export type Shadows = {
  shadow: (level: ShadowLevel, tint?: string) => ViewStyle;
  neuRaised: (size?: NeuSize) => ViewStyle;
  neuInset: (size?: NeuSize) => ViewStyle;
  /** A raised control while it is held down (handoff §3 state table). */
  neuPressed: () => ViewStyle;
  /** Bottom sheets and the phone dock: shadow cast upward. */
  sheet: () => ViewStyle;
};

function makeDark(): Shadows {
  const colors = darkColors;
  return {
    shadow(level, tint = colors.primaryTealDark) {
      const p = presets[level];
      return {
        shadowColor: tint,
        shadowOffset: { width: 0, height: p.offset },
        shadowOpacity: p.opacity,
        shadowRadius: p.radius,
        elevation: p.elevation,
      };
    },
    neuRaised(size = "md") {
      const p = raisedPresets[size];
      return {
        boxShadow: [
          { offsetX: p.offset, offsetY: p.offset, blurRadius: p.blur, color: colors.neuShadowDark },
          { offsetX: -p.offset, offsetY: -p.offset, blurRadius: p.blur, color: colors.neuShadowLight },
        ],
      } as ViewStyle;
    },
    neuInset(size = "md") {
      const p = insetPresets[size];
      return {
        boxShadow: [
          { offsetX: p.offset, offsetY: p.offset, blurRadius: p.blur, color: colors.neuShadowDark, inset: true },
          { offsetX: -p.offset, offsetY: -p.offset, blurRadius: p.blur, color: colors.neuShadowLight, inset: true },
        ],
      } as ViewStyle;
    },
    neuPressed() {
      return {
        backgroundColor: colors.surfacePressed,
        boxShadow: [{ offsetX: 2, offsetY: 2, blurRadius: 5, color: colors.neuShadowDark, inset: true }],
        transform: [{ scale: 0.97 }],
      } as ViewStyle;
    },
    sheet() {
      return { boxShadow: [{ offsetX: 0, offsetY: -8, blurRadius: 24, color: "rgba(0,0,0,0.45)" }] } as ViewStyle;
    },
  };
}

function makeLight(): Shadows {
  const colors = lightColors;
  return {
    // Light cards: a tight contact shadow plus a soft lift, and a 1px border
    // (the "card" recipe); `tint` is ignored - tinted shadows read as dirt
    // on a pale ground.
    shadow(level) {
      const lift = { sm: [4, 12, 0.14], md: [6, 16, 0.16], lg: [12, 28, 0.18] }[level];
      return {
        borderWidth: 1,
        borderColor: colors.glassBorder,
        boxShadow: [
          { offsetX: 0, offsetY: 1, blurRadius: 2, color: "rgba(27,31,42,0.06)" },
          { offsetX: 0, offsetY: lift[0], blurRadius: lift[1], color: `${LIGHT_FAR}${lift[2]})` },
        ],
      } as ViewStyle;
    },
    neuRaised(size = "md") {
      const { far, near } = lightRaised[size];
      return {
        borderWidth: 1,
        borderColor: colors.hairline,
        boxShadow: [
          { offsetX: far[0], offsetY: far[1], blurRadius: far[2], color: `${LIGHT_FAR}${far[3]})` },
          { offsetX: near[0], offsetY: near[1], blurRadius: near[2], color: `${LIGHT_NEAR}${near[3]})` },
        ],
      } as ViewStyle;
    },
    neuInset(size = "md") {
      const o = lightInset[size];
      const blur = o * 2.5;
      return {
        boxShadow: [
          { offsetX: o, offsetY: o, blurRadius: blur, color: `${LIGHT_FAR}0.22)`, inset: true },
          { offsetX: -o, offsetY: -o, blurRadius: blur, color: `${LIGHT_NEAR}0.85)`, inset: true },
        ],
      } as ViewStyle;
    },
    neuPressed() {
      return {
        backgroundColor: colors.surfacePressed,
        borderWidth: 1,
        borderColor: colors.hairline,
        boxShadow: [{ offsetX: 1, offsetY: 2, blurRadius: 4, color: `${LIGHT_FAR}0.25)`, inset: true }],
        transform: [{ scale: 0.97 }],
      } as ViewStyle;
    },
    sheet() {
      return {
        borderTopWidth: 1,
        borderTopColor: colors.hairline,
        boxShadow: [{ offsetX: 0, offsetY: -8, blurRadius: 24, color: "rgba(27,31,42,0.14)" }],
      } as ViewStyle;
    },
  };
}

const SETS: Record<ThemeName, Shadows> = { dark: makeDark(), light: makeLight() };

export function makeShadows(name: ThemeName): Shadows {
  return SETS[name];
}

export const shadow = SETS.dark.shadow;
export const neuRaised = SETS.dark.neuRaised;
export const neuInset = SETS.dark.neuInset;
