// src/components/HandednessPicker.tsx
// Dominant-hand preference for live sign recognition. The alphabet model was
// trained on right-handed signing, so a left-handed signer's hand shows up
// mirrored in landmark-coordinate space relative to what the model learned -
// same handshape, opposite chirality (a left hand and a right hand are
// mirror images of each other, so the same letter performed with the other
// hand produces landmark x-coordinates that are flipped, not just "a
// different hand"). Setting this to "left" mirrors the hand landmarks before
// they reach the model, undoing that flip. Persisted the same way as the
// target language (see LanguagePicker.tsx) - set once, applies to every
// recognition after that, not a per-frame or per-recognition control.
//
// Visually this is skeuomorphic hero object #4 (design_handoff_kamustasign_
// material_pass/README.md): a two-position physical rocker switch with a lit
// cap, not a plain segmented control — it's the second-largest object in the
// Letters left column on purpose, because the handedness toggle used to be
// easy to miss.
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, fonts } from "../theme/theme";

const STORAGE_KEY = "kamustasign:handedness";
export type Handedness = "right" | "left";

export function useHandedness(): [Handedness, (value: Handedness) => void] {
  const [handedness, setHandedness] = useState<Handedness>("right");

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (!cancelled && (saved === "left" || saved === "right")) setHandedness(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (next: Handedness) => {
    setHandedness(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  return [handedness, update];
}

// Mirrors a flat [x0,y0,z0, x1,y1,z1, ...] landmark array along the
// horizontal axis. MediaPipe landmarks are normalized to [0,1] with x
// increasing left-to-right across the RAW (unmirrored) camera frame, so
// `1 - x` is exactly what the same handshape's landmarks would look like
// performed with the other hand in front of the same camera - the numeric
// equivalent of physically mirroring the camera. y and z are left alone: a
// left-right mirror only reflects the horizontal axis.
export function mirrorFlatLandmarks(flat: number[]): number[] {
  const out = flat.slice();
  for (let i = 0; i < out.length; i += 3) {
    out[i] = 1 - out[i];
  }
  return out;
}

type Props = {
  value: Handedness;
  onChange: (value: Handedness) => void;
  // Mobile signing-hand row uses a small fixed-size rocker (132x48) beside
  // text instead of the full-width 62-high desktop one.
  compact?: boolean;
};

export default function HandednessPicker({ value, onChange, compact = false }: Props) {
  // Non-compact size matches the control-strip rocker spec (design handoff:
  // "UI mockups combining design styles" - 4a control strip, cell 1): 50
  // high, radius 15, 11-radius cap. Compact (mobile) is untouched.
  const height = compact ? 48 : 50;
  const radius = compact ? 14 : 15;
  const capRadius = compact ? 10 : 11;

  return (
    <LinearGradient
      colors={["#333A47", "#1A1E26"]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={[
        styles.housing,
        compact ? styles.housingCompact : styles.housingFull,
        { height, borderRadius: radius, padding: compact ? 6 : 5 },
      ]}
    >
      {(["right", "left"] as Handedness[]).map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={styles.half}
            accessibilityRole="switch"
            accessibilityState={{ checked: opt === "left" ? value === "left" : undefined, selected: active }}
            accessibilityLabel={`${opt === "right" ? "Right" : "Left"}-handed signing`}
          >
            {active ? (
              <LinearGradient
                colors={["#4A5261", "#333B49"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.cap, { borderRadius: capRadius, gap: compact ? 8 : 7 }]}
              >
                <View style={[styles.led, !compact && styles.ledStrip]} />
                <Text style={[styles.capLabel, compact && styles.capLabelCompact]}>
                  {opt === "right" ? "Right" : "Left"}
                </Text>
              </LinearGradient>
            ) : (
              <Text style={[styles.inactiveLabel, compact && styles.capLabelCompact]}>
                {opt === "right" ? "Right" : "Left"}
              </Text>
            )}
          </Pressable>
        );
      })}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  housing: {
    flexDirection: "row",
    boxShadow: [
      { offsetX: 0, offsetY: 1, blurRadius: 0, color: "rgba(255,255,255,0.18)", inset: true },
      { offsetX: 0, offsetY: 5, blurRadius: 12, color: "rgba(0,0,0,0.4)" },
    ],
  } as ViewStyle,
  housingFull: {
    width: "100%",
  },
  housingCompact: {
    width: 132,
  },
  half: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cap: {
    width: "100%",
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: [
      { offsetX: 0, offsetY: 3, blurRadius: 0, color: "#222832" },
      { offsetX: 0, offsetY: 6, blurRadius: 10, color: "rgba(0,0,0,0.45)" },
      { offsetX: 0, offsetY: 1, blurRadius: 0, color: "rgba(255,255,255,0.3)", inset: true },
    ],
  } as ViewStyle,
  led: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 6, color: colors.success }],
  } as ViewStyle,
  // Control-strip (non-compact) rocker spec: 6x6 LED, 7px glow.
  ledStrip: {
    width: 6,
    height: 6,
    borderRadius: 3,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 7, color: colors.success }],
  } as ViewStyle,
  capLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  capLabelCompact: {
    fontSize: 12,
  },
  inactiveLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: "#8A93A3",
  },
});
