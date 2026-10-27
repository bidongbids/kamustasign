// P1: "How to make it". Shows the sign's reference media - a photo for ASL
// letters, a looping clip for FSL words (src/lib/referenceMedia.ts) - with
// the dataset credit its license requires underneath. Signs with no licensed
// media keep the honest "not yet" state, never an empty box. "Full screen"
// opens the same media over the whole window (and the browser's own full
// screen where it allows it), so a child can see the handshape up close.
import React, { useEffect, useRef, useState } from "react";
import { Image, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import GlassCard from "../GlassCard";
import KidButton from "./KidButton";
import { CloseIcon, ExpandIcon, EyeIcon } from "../icons/UiIcons";
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
  const [full, setFull] = useState(false);

  // A new sign closes the big view rather than showing the old sign's media.
  useEffect(() => setFull(false), [sign]);

  const credit = showable ? (
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
  ) : null;

  return (
    <GlassCard radius={radii.lg} padding={16} style={style} contentStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[typography.h3, styles.title]}>How to make it</Text>
        {showable && !loading ? (
          <KidButton
            small
            label="Full screen"
            accessibilityLabel={`Show how to sign ${sign} full screen`}
            onPress={() => setFull(true)}
            iconLeft={<ExpandIcon size={16} color={colors.textPrimary} />}
          />
        ) : null}
      </View>
      <View style={[styles.slot, neuInset("md"), showable && styles.slotMedia, fill && styles.slotFill]}>
        {loading ? null : showable ? (
          <Media media={showable} label={label} reduceMotion={reduceMotion} fill={fill} />
        ) : (
          <View style={styles.none}>
            <EyeIcon size={26} color={colors.textSecondary} />
            <Text style={styles.noneText}>No picture for this sign yet.{"\n"}Ask your teacher to show you.</Text>
          </View>
        )}
      </View>
      {showable && motionHint ? <Text style={styles.hint}>{motionHint}</Text> : null}
      {credit}
      {showable && full ? (
        <FullScreenReference sign={sign} motionHint={motionHint} credit={credit} onClose={() => setFull(false)}>
          <Media media={showable} label={label} reduceMotion={reduceMotion} fill />
        </FullScreenReference>
      ) : null}
    </GlassCard>
  );
}

function Media({ media, label, reduceMotion, fill }: { media: SignMedia; label: string; reduceMotion?: boolean; fill?: boolean }) {
  return media.kind === "image" ? (
    <Image source={{ uri: media.uri }} style={fill ? styles.mediaFill : styles.media} resizeMode="contain" accessibilityLabel={label} />
  ) : (
    // key: a new sign swaps the clip instead of keeping the old frame.
    <video
      key={media.uri}
      src={media.uri}
      aria-label={label}
      autoPlay={!reduceMotion}
      loop
      muted
      playsInline
      controls={reduceMotion}
      preload="auto"
      style={fill ? videoFillStyle : videoStyle}
    />
  );
}

function FullScreenReference({
  sign,
  motionHint,
  credit,
  onClose,
  children,
}: {
  sign: string;
  motionHint?: string | null;
  credit: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Web/Electron: also take the browser's full screen while open, and close
  // on Escape. The browser can refuse full screen (e.g. inside an iframe);
  // the overlay still covers the window. Runs once per opening: onClose is
  // read through a ref, so a parent re-render doesn't leave and re-enter.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onClose = () => closeRef.current();
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const root = document.documentElement;
    let entered = false;
    if (!document.fullscreenElement && root.requestFullscreen) {
      root
        .requestFullscreen()
        .then(() => {
          entered = true;
        })
        .catch(() => {});
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Leaving the browser's full screen (Esc, F11) closes the view too.
    const onFullscreenChange = () => {
      if (entered && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (entered && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fullRoot} accessibilityViewIsModal>
        <View style={styles.fullHeader}>
          <Text style={styles.fullTitle} numberOfLines={1}>
            How to sign <Text style={{ color: colors.accentCoral }}>{sign}</Text>
          </Text>
          <KidButton
            small
            label="Close"
            accessibilityLabel="Close full screen"
            onPress={onClose}
            iconLeft={<CloseIcon size={16} color={colors.textPrimary} />}
          />
        </View>
        <View style={styles.fullMedia}>{children}</View>
        {motionHint ? <Text style={[styles.hint, styles.fullHint]}>{motionHint}</Text> : null}
        <View style={styles.fullCredit}>{credit}</View>
      </View>
    </Modal>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  title: { color: colors.textPrimary, flexShrink: 1 },
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
  fullRoot: { flex: 1, backgroundColor: colors.neuBase, padding: 20, gap: 12 },
  fullHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  fullTitle: { ...kidTypography.kidTitle, color: colors.textPrimary, flexShrink: 1 },
  fullMedia: { flex: 1, minHeight: 0, borderRadius: radii.md, backgroundColor: colors.neuWell, overflow: "hidden" },
  fullHint: { textAlign: "center", fontSize: 18, lineHeight: 26 },
  fullCredit: { alignItems: "center" },
});
