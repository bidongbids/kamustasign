// P1: "How to make it". Shows the sign's reference media - a photo for ASL
// letters, a looping clip for FSL words (src/lib/referenceMedia.ts) - with
// the dataset credit its license requires underneath. Signs with no licensed
// media keep the honest "not yet" state, never an empty box.
import React from "react";
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import GlassCard from "../GlassCard";
import { EyeIcon } from "../icons/UiIcons";
import { colors, fonts, kidTypography, radii, typography } from "../../theme/theme";
import { neuInset } from "../../theme/shadows";
import type { SignMedia } from "../../lib/referenceMedia";

export type { SignMedia };

type Props = {
  sign: string;
  media?: SignMedia | null;
  /** Shown under the media when a photo can't show the movement (J, Z). */
  motionHint?: string | null;
  /** Clips start paused with controls instead of autoplaying. */
  reduceMotion?: boolean;
  loading?: boolean;
  style?: any;
  /** Desktop: fill the height the parent gives (media scales down to fit). */
  fill?: boolean;
};

export default function SignReference({ sign, media = null, motionHint, reduceMotion, loading, style, fill }: Props) {
  const label = `How to sign ${sign}`;
  // Clips are web-only for now, like the translator: no native video module
  // is installed, and the classroom runs in the browser.
  const canShowVideo = Platform.OS === "web";
  const showable = media && (media.kind === "image" || canShowVideo) ? media : null;

  return (
    <GlassCard radius={radii.lg} padding={16} style={style} contentStyle={styles.content}>
      <Text style={[typography.h3, styles.title]}>How to make it</Text>
      <View style={[styles.slot, neuInset("md"), showable && styles.slotMedia, fill && styles.slotFill]}>
        {loading ? null : showable?.kind === "image" ? (
          <Image source={{ uri: showable.uri }} style={fill ? styles.mediaFill : styles.media} resizeMode="contain" accessibilityLabel={label} />
        ) : showable?.kind === "video" ? (
          // key: a new sign swaps the clip instead of keeping the old frame.
          <video
            key={showable.uri}
            src={showable.uri}
            aria-label={label}
            autoPlay={!reduceMotion}
            loop
            muted
            playsInline
            controls={reduceMotion}
            preload="auto"
            style={fill ? videoFillStyle : videoStyle}
          />
        ) : (
          <View style={styles.none}>
            <EyeIcon size={26} color={colors.textSecondary} />
            <Text style={styles.noneText}>No picture for this sign yet.{"\n"}Ask your teacher to show you.</Text>
          </View>
        )}
      </View>
      {showable && motionHint ? <Text style={styles.hint}>{motionHint}</Text> : null}
      {showable ? (
        <Pressable
          onPress={() => Linking.openURL(showable.credit.url)}
          accessibilityRole="link"
          accessibilityLabel={`${showable.credit.label}, license ${showable.credit.license}. Opens the dataset page.`}
          hitSlop={6}
        >
          <Text style={styles.credit}>
            {showable.credit.label} · {showable.credit.license}
          </Text>
        </Pressable>
      ) : null}
    </GlassCard>
  );
}

const videoStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  borderRadius: radii.sm,
  background: "transparent",
};

// Fill mode: absolutely positioned so the clip's intrinsic size can never
// push the card taller than the space it was given.
const videoFillStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  left: 8,
  width: "calc(100% - 16px)",
  height: "calc(100% - 16px)",
  objectFit: "contain",
  borderRadius: radii.sm,
  background: "transparent",
};

const styles = StyleSheet.create({
  slotFill: { minHeight: 0 },
  mediaFill: { position: "absolute", top: 8, left: 8, right: 8, bottom: 8 },
  content: { flex: 1 },
  title: { color: colors.textPrimary, marginBottom: 10 },
  slot: {
    flex: 1,
    minHeight: 150,
    borderRadius: radii.md,
    backgroundColor: colors.neuWell,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: 14,
  },
  // Media gets a real height to fill - a percentage-height image or video
  // inside a content-sized box would collapse to nothing.
  slotMedia: { minHeight: 220, padding: 8 },
  media: { width: "100%", height: "100%", minHeight: 200, borderRadius: radii.sm },
  none: { alignItems: "center", gap: 8 },
  noneText: { ...kidTypography.kidBody, fontSize: 15, lineHeight: 22, color: colors.textPrimary, textAlign: "center" },
  hint: { ...kidTypography.kidBody, fontSize: 15, lineHeight: 21, color: colors.textPrimary, marginTop: 10 },
  credit: { fontFamily: fonts.body, fontSize: 11, lineHeight: 15, color: colors.textSecondary, marginTop: 8 },
});
