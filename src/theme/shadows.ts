// Soft, brand-tinted shadows (teal-tinted instead of flat black) so cards
// read as layered/elevated rather than flat-with-a-border. Works across iOS
// (shadow*), Android (elevation), and web (react-native-web maps shadow* to
// box-shadow automatically).
import { ViewStyle } from "react-native";
import { colors } from "./theme";

type ShadowLevel = "sm" | "md" | "lg";

const presets: Record<ShadowLevel, { offset: number; opacity: number; radius: number; elevation: number }> = {
  sm: { offset: 2, opacity: 0.08, radius: 6, elevation: 2 },
  md: { offset: 6, opacity: 0.12, radius: 16, elevation: 6 },
  lg: { offset: 14, opacity: 0.16, radius: 30, elevation: 12 },
};

export function shadow(level: ShadowLevel, tint: string = colors.primaryTealDark): ViewStyle {
  const p = presets[level];
  return {
    shadowColor: tint,
    shadowOffset: { width: 0, height: p.offset },
    shadowOpacity: p.opacity,
    shadowRadius: p.radius,
    elevation: p.elevation,
  };
}

// Neumorphic double-shadow helpers — the "controls" material in the
// Graphite Aurora material system (design_handoff_kamustasign_material_pass
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

export function neuRaised(size: NeuSize = "md"): ViewStyle {
  const p = raisedPresets[size];
  return {
    boxShadow: [
      { offsetX: p.offset, offsetY: p.offset, blurRadius: p.blur, color: colors.neuShadowDark },
      { offsetX: -p.offset, offsetY: -p.offset, blurRadius: p.blur, color: colors.neuShadowLight },
    ],
  } as ViewStyle;
}

export function neuInset(size: NeuSize = "md"): ViewStyle {
  const p = insetPresets[size];
  return {
    boxShadow: [
      { offsetX: p.offset, offsetY: p.offset, blurRadius: p.blur, color: colors.neuShadowDark, inset: true },
      { offsetX: -p.offset, offsetY: -p.offset, blurRadius: p.blur, color: colors.neuShadowLight, inset: true },
    ],
  } as ViewStyle;
}
