// src/components/CameraDevice.tsx
// The camera panel — a physical device, not a bare <video> element. Shared
// by LiveTranslatorScreen (Letters) and WordTranslatorScreen (Words) so the
// housing/shelf/screen construction stays identical between the two modes
// (see docs/design/design_handoff_kamustasign_material_pass/README.md, "SKEUOMORPHIC ->
// hero objects", #1). Callers own the live <video>/<canvas> refs and any
// overlays drawn on top of the feed (detection box, badges, caption/
// translation bars) — this component only draws the chrome around them.
//
// variant="slim" (design_handoff_translator_fingerspelling, the Letters /
// Numbers translator): the same housing slimmed to a 10px bezel with no
// shelves, lens or vents. Its status lives ON the video instead: a chip
// top-left ("Hand found" / "No hand · put it in the box"), an optional fps
// chip top-right, the guide box (dashed white, solid green with a hand in
// it), and the loading / blocked screens inside the bezel. The <video> and
// the landmark <canvas> keep exactly the same box and cover transform in
// both variants; the overlays are siblings drawn over them.
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { fonts, typography, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { VideoIcon } from "./icons/UiIcons";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { focusFromKeyboard } from "../lib/focusVisible";

/** Slim variant: what the camera itself is doing. */
export type CameraState = "live" | "loading" | "blocked" | "error";

type Props = {
  isDesktop?: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ledColor?: string;
  statusText?: string;
  // Mobile only — desktop's screen flexes to fill the device's remaining
  // height instead of taking a fixed height.
  mobileScreenHeight?: number;
  overlays?: React.ReactNode;
  style?: any;
  variant?: "device" | "slim";
  // ---- slim only ----
  cameraState?: CameraState;
  /** "hand" / "none": the status chip; null hides it. */
  chip?: "hand" | "none" | null;
  /** Overrides the chip's words and dot (Words: "Recording · 24 frames"). */
  chipText?: string;
  chipDot?: "on" | "off" | "rec" | "wait" | "busy";
  /** The fps chip text ("28 fps · ready"); null hides it. */
  fpsText?: string | null;
  /** The guide box: "idle" dashed white, "hand" solid green; null hides it. */
  guideState?: "idle" | "hand" | null;
  /** Which side of the (mirrored) picture the guide box sits on: the signing hand's. */
  guideSide?: "left" | "right";
  /** cameraState "error": what failed, in words. */
  errorTitle?: string;
  errorBody?: string;
  onRetry?: () => void;
};

export default function CameraDevice(props: Props) {
  if (props.variant === "slim") return <SlimCamera {...props} />;
  return <DeviceCamera {...props} />;
}

function DeviceCamera({
  isDesktop = true,
  videoRef,
  canvasRef,
  ledColor: ledColorProp,
  statusText = "",
  mobileScreenHeight = 340,
  overlays,
  style,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ledColor = ledColorProp ?? colors.success;
  // Desktop numbers are the instrument-panel bay-1 device spec (design
  // handoff: "UI mockups combining design styles"): housing radius 20,
  // padding 12, screen radius 14, top shelf 22 / bottom shelf 26, 10x10
  // lens - sized so a 540x398 outer box yields exactly the spec's 516x326
  // usable feed area (540 - 2*12 padding = 516; 398 - 2*12 padding - 22 -
  // 26 shelves = 326). Mobile keeps its own pre-existing numbers untouched.
  const radius = isDesktop ? 20 : 22;
  const padding = isDesktop ? 12 : 10;
  const screenRadius = isDesktop ? 14 : 15;
  const shelfHeight = 22;
  const bottomShelfHeight = 26;
  const lensSize = 10;

  return (
    <View style={[isDesktop ? styles.rootDesktop : styles.rootMobile, style]}>
      <LinearGradient
        colors={["#3C434F", "#1A1E26", "#2B313D"]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[styles.housing, { borderRadius: radius, padding }]}
      >
        <View style={[styles.housingHighlight, { borderRadius: radius }]} pointerEvents="none" />

        <View style={[styles.shelf, { height: shelfHeight }]}>
          <View style={styles.lensRow}>
            <View style={{ width: lensSize, height: lensSize }}>
              <Svg width={lensSize} height={lensSize}>
                <Defs>
                  <RadialGradient id="lensGrad" cx="35%" cy="32%" r="75%">
                    <Stop offset="0" stopColor="#5B6478" />
                    <Stop offset="1" stopColor="#0C0E12" />
                  </RadialGradient>
                </Defs>
                <Circle
                  cx={lensSize / 2}
                  cy={lensSize / 2}
                  r={lensSize / 2 - 1}
                  fill="url(#lensGrad)"
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth={1.2}
                />
              </Svg>
            </View>
            <View
              style={[
                styles.led,
                {
                  backgroundColor: ledColor,
                  boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 6, color: ledColor }],
                } as any,
              ]}
            />
          </View>
          <Text style={[typography.meta, styles.shelfLabel, { fontSize: isDesktop ? 9 : 8 }]}>LCSIGN VISION</Text>
        </View>

        <View
          style={[
            styles.screen,
            {
              borderRadius: screenRadius,
              flex: isDesktop ? 1 : undefined,
              height: isDesktop ? undefined : mobileScreenHeight,
            },
          ]}
        >
          <video ref={videoRef as any} style={videoStyle} playsInline muted />
          <canvas ref={canvasRef as any} style={canvasStyle} />
          <LinearGradient
            colors={["rgba(255,255,255,0.09)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.42, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {overlays}
        </View>

        <View style={[styles.shelf, { height: bottomShelfHeight }]}>
          <Text style={[typography.meta, styles.shelfLabel, { fontSize: isDesktop ? 9.5 : 8.5 }]}>{statusText}</Text>
          <View style={styles.vents}>
            <View style={styles.vent} />
            <View style={styles.vent} />
            <View style={styles.vent} />
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

// Camera colours are fixed: the video is near-black in both modes.
const ON_CAMERA_MUTED = "#C3CAD6";
const CHIP_BG = "rgba(10,12,16,0.78)";
const dot = { width: 9, height: 9, borderRadius: 5 };
const DOTS = {
  on: { ...dot, backgroundColor: "#3FB56A" },
  off: { ...dot, borderWidth: 1.5, borderColor: ON_CAMERA_MUTED },
  rec: { ...dot, backgroundColor: "#E0525F" },
  wait: { ...dot, backgroundColor: "#F2B23E" },
  busy: { ...dot, backgroundColor: "#9A8DF8" },
};

function SlimCamera({
  videoRef,
  canvasRef,
  overlays,
  style,
  cameraState = "live",
  chip,
  chipText,
  chipDot,
  fpsText,
  guideState,
  guideSide = "right",
  errorTitle,
  errorBody,
  onRetry,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const live = cameraState === "live";

  return (
    <View style={[styles.slimRoot, style]}>
      <LinearGradient
        colors={["#3C434F", "#1A1E26", "#2B313D"]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.slimHousing}
      >
        <View style={styles.slimScreen}>
          <video ref={videoRef as any} style={videoStyle} playsInline muted />
          <canvas ref={canvasRef as any} style={canvasStyle} />
          {live && guideState ? (
            <View
              pointerEvents="none"
              style={[
                styles.guide,
                guideSide === "left" ? styles.guideLeft : styles.guideRight,
                guideState === "hand" ? styles.guideHand : styles.guideIdle,
              ]}
            />
          ) : null}
          {overlays}
          {live && chip ? (
            <View style={[styles.chip, styles.chipLeft]} accessibilityLiveRegion="polite">
              <View style={DOTS[chipDot ?? (chip === "hand" ? "on" : "off")]} />
              <Text style={styles.chipText} numberOfLines={1}>
                {chipText ?? (chip === "hand" ? "Hand found" : "No hand · put it in the box")}
              </Text>
            </View>
          ) : null}
          {live && fpsText ? (
            <View style={[styles.chip, styles.fpsChip]}>
              <Text style={styles.fpsText}>{fpsText}</Text>
            </View>
          ) : null}
          {cameraState === "loading" ? <LoadingScreen /> : null}
          {cameraState === "blocked" || cameraState === "error" ? (
            <View style={styles.blocked} accessibilityRole="alert">
              <VideoIcon size={34} color="#FF7A85" off />
              <Text style={styles.blockedTitle}>{cameraState === "blocked" ? "The camera is blocked" : errorTitle ?? "The camera isn't working"}</Text>
              <Text style={styles.blockedBody}>
                {cameraState === "blocked"
                  ? "Allow the camera in the browser's address bar, then try again."
                  : errorBody ?? "Check that a camera is plugged in and no other app is using it, then try again."}
              </Text>
              {onRetry ? (
                <Pressable
                  onPress={onRetry}
                  accessibilityRole="button"
                  style={(state: any) => [styles.retry, state.pressed && { opacity: 0.85 }, state.focused && focusFromKeyboard() && styles.retryFocused]}
                >
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );
}

function LoadingScreen() {
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: Platform.OS !== "web" })
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <View style={styles.loading} accessibilityLiveRegion="polite">
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={44} height={44} viewBox="0 0 54 54">
          <Circle cx={27} cy={27} r={22} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={5} />
          <Path d="M27 5a22 22 0 0 1 22 22" fill="none" stroke="#F2B23E" strokeWidth={5} strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <Text style={styles.loadingTitle}>Getting the camera ready…</Text>
      <Text style={styles.loadingBody}>Loading the hand reader · first time takes a few seconds</Text>
    </View>
  );
}

const videoStyle: any = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  transform: "scaleX(-1)",
};

// The canvas must be fitted exactly like the <video> (object-fit: cover):
// when the screen box isn't the camera's 4:3, the video is cropped to fill
// it, and a stretched canvas would draw the skeleton off the real hand.
const canvasStyle: any = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  transform: "scaleX(-1)",
  pointerEvents: "none",
};

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  rootDesktop: {
    flex: 1,
    minWidth: 0,
  },
  rootMobile: {
    width: "100%",
  },
  housing: {
    flex: 1,
    boxShadow: [{ offsetX: 0, offsetY: 18, blurRadius: 40, color: "rgba(0,0,0,0.5)" }],
  } as any,
  housingHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 0, color: "rgba(255,255,255,0.20)", inset: true }],
  } as any,
  shelf: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  lensRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  led: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  shelfLabel: {
    color: colors.textDim,
  },
  screen: {
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#000",
    boxShadow: [
      { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: "rgba(0,0,0,0.6)", inset: true },
      { offsetX: 0, offsetY: 0, blurRadius: 40, color: "rgba(0,0,0,0.55)", inset: true },
    ],
  } as any,
  vents: {
    flexDirection: "row",
    gap: 4,
  },
  vent: {
    width: 22,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.16)",
  },

  // ---- slim ----
  slimRoot: { flex: 1, minWidth: 0, minHeight: 0 },
  slimHousing: {
    flex: 1,
    borderRadius: 24,
    padding: 10,
    boxShadow: [{ offsetX: 0, offsetY: 18, blurRadius: 40, color: theme.name === "dark" ? "rgba(0,0,0,0.35)" : "rgba(27,31,42,0.22)" }],
  } as any,
  slimScreen: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#000",
  },
  guide: {
    position: "absolute",
    top: "16%",
    height: "52%",
    width: "30%",
    borderRadius: 18,
    borderWidth: 3,
  },
  guideRight: { right: "12%" },
  guideLeft: { left: "12%" },
  guideIdle: { borderStyle: "dashed", borderColor: "rgba(255,255,255,0.75)" },
  guideHand: { borderStyle: "solid", borderColor: "#3FB56A" },
  chip: {
    position: "absolute",
    top: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  chipLeft: { left: 14, height: 34, backgroundColor: CHIP_BG, maxWidth: "70%" } as any,
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, lineHeight: 16, color: "#FFFFFF" },
  fpsChip: { right: 14, height: 28, backgroundColor: "rgba(10,12,16,0.6)" },
  fpsText: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, lineHeight: 14, color: ON_CAMERA_MUTED },
  loading: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(10,12,16,0.6)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  loadingTitle: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 24, color: "#FFFFFF", textAlign: "center" },
  loadingBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: ON_CAMERA_MUTED, textAlign: "center" },
  blocked: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#12151B",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 30,
  },
  blockedTitle: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 26, color: "#FFFFFF", textAlign: "center" },
  blockedBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: ON_CAMERA_MUTED, textAlign: "center", maxWidth: 340 },
  retry: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "#5A50A8",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null),
  },
  retryFocused: { outlineColor: "#F2B23E", outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as object,
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: "#FFFFFF" },
});
