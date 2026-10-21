// src/components/CameraDevice.tsx
// The camera panel — a physical device, not a bare <video> element. Shared
// by LiveTranslatorScreen (Letters) and WordTranslatorScreen (Words) so the
// housing/shelf/screen construction stays identical between the two modes
// (see design_handoff_kamustasign_material_pass/README.md, "SKEUOMORPHIC ->
// hero objects", #1). Callers own the live <video>/<canvas> refs and any
// overlays drawn on top of the feed (detection box, badges, caption/
// translation bars) — this component only draws the chrome around them.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { colors, typography } from "../theme/theme";

type Props = {
  isDesktop: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ledColor?: string;
  statusText: string;
  // Mobile only — desktop's screen flexes to fill the device's remaining
  // height instead of taking a fixed height.
  mobileScreenHeight?: number;
  overlays?: React.ReactNode;
  style?: any;
};

export default function CameraDevice({
  isDesktop,
  videoRef,
  canvasRef,
  ledColor = colors.success,
  statusText,
  mobileScreenHeight = 340,
  overlays,
  style,
}: Props) {
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

const videoStyle: any = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  transform: "scaleX(-1)",
};

const canvasStyle: any = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  transform: "scaleX(-1)",
};

const styles = StyleSheet.create({
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
});
