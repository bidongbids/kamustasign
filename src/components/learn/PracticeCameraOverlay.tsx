// Child-facing overlays for the camera device in the translators' practice
// variant: "Getting the camera ready…", "We can't see the camera", and the
// dashed hand box ("Put your hand in the box" -> gold "Hold it…" -> green).
// The housing, lens, LED and the MediaPipe canvas are untouched.
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import KidButton from "./KidButton";
import { CameraIcon } from "../icons/UiIcons";
import { colors, fonts, kidTypography, typography } from "../../theme/theme";
import { neuInset } from "../../theme/shadows";

type Props = {
  phase: "loading" | "error" | "live";
  /** Live screens: a hand is in frame. Words pass undefined (no box label). */
  handSeen?: boolean;
  /** 0-1 hold progress (letters/numbers). */
  hold?: number;
  /** Words: recording now (box turns gold). */
  recording?: boolean;
  onRetry?: () => void;
  /** "general": wording for any signer (the free translator), not a child in class. */
  audience?: "kid" | "general";
  holdLabel?: string;
  doneLabel?: string;
};

export default function PracticeCameraOverlay({
  phase,
  handSeen,
  hold = 0,
  recording,
  onRetry,
  audience = "kid",
  holdLabel = "Hold it…",
  doneLabel = "Got it!",
}: Props) {
  const [box, setBox] = useState({ w: 0, h: 0 });

  if (phase !== "live") {
    const error = phase === "error";
    return (
      <View style={styles.scrim}>
        <View style={[styles.icon, neuInset("sm")]}>
          <CameraIcon size={28} color={error ? colors.needsPractice : colors.textSecondary} />
        </View>
        <Text style={[typography.h2, styles.title]}>{error ? "We can't see the camera" : "Getting the camera ready…"}</Text>
        <Text style={[kidTypography.kidBody, styles.body]}>
          {error
            ? audience === "kid"
              ? "Ask a grown-up to check that the camera is on and allowed."
              : "Check that the camera is plugged in and allowed for this app."
            : "This takes a few seconds."}
        </Text>
        {error && onRetry ? <KidButton small label="Try again" onPress={onRetry} style={{ marginTop: 8 }} /> : null}
      </View>
    );
  }

  const held = hold >= 1;
  const holding = hold > 0 || !!recording;
  const stroke = held ? "rgba(63,181,106,0.9)" : holding ? "rgba(242,178,62,0.9)" : "rgba(154,141,248,0.75)";
  const label =
    handSeen === undefined ? null : !handSeen ? "Put your hand in the box" : held ? doneLabel : holding ? holdLabel : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.box} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {box.w > 0 && (
          <Svg width={box.w} height={box.h}>
            <Rect
              x={1}
              y={1}
              width={box.w - 2}
              height={box.h - 2}
              rx={18}
              fill="none"
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="8 6"
            />
          </Svg>
        )}
        {label ? (
          <View style={[styles.label, { backgroundColor: held ? colors.success : holding ? colors.accentCoral : "rgba(124,108,245,0.92)" }]}>
            <Text style={[styles.labelText, { color: held || holding ? colors.textOnAccent : "#FFFFFF" }]}>{label}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.neuWell,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.textPrimary, textAlign: "center" },
  body: { color: colors.textSecondary, textAlign: "center", maxWidth: 300 },
  box: { position: "absolute", left: "26%", right: "26%", top: "12%", bottom: "10%" },
  label: {
    position: "absolute",
    top: -30,
    left: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  labelText: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 16 },
});
