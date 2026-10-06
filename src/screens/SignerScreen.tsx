// Text-to-sign avatar mode: plays a recorded sign back on a 3D figure.
//
// This is the Phase 1 spike for the signing-avatar feature. Right now it plays
// a single bundled clip so the playback path can be judged end to end - the
// typed-text -> word lookup -> clip queue part comes once this reads as
// convincing. Clips are SMPL-X rotation tracks converted from the SignAvatars
// word2motion dataset (see ml/scripts/signavatars_to_rotations.py); the avatar
// itself is the SMPL-X skeleton, so the rotations apply with no retargeting.

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import SignerAvatar from "../components/SignerAvatar";
import GlassCard from "../components/GlassCard";
import type { SignerClip } from "../lib/smplxSkeleton";
import { colors, typography } from "../theme/theme";
import { neuInset, neuRaised } from "../theme/shadows";
import { useResponsive } from "../theme/responsive";

import { SIGNER_CLIPS, SIGNABLE_WORDS } from "../data/signer_clips";

const SPEEDS = [
  { label: "0.5x", value: 0.5 },
  { label: "1x", value: 1 },
  { label: "2x", value: 2 },
];

export default function SignerScreen() {
  const { isDesktop } = useResponsive();
  const [word, setWord] = useState(SIGNABLE_WORDS[0]);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [frame, setFrame] = useState(0);

  const clip: SignerClip = SIGNER_CLIPS[word];

  const info = (
    <GlassCard style={isDesktop ? styles.panelDesktop : undefined} padding={16}>
      <Text style={styles.eyebrow}>NOW SIGNING</Text>
      <Text style={styles.word}>{clip.gloss ?? word}</Text>
      <View style={styles.divider} />
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Frame</Text>
        <Text style={styles.metaValue}>
          {frame + 1} / {clip.frame_count}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Joints driven</Text>
        <Text style={styles.metaValue}>{Object.keys(clip.tracks).length}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Source</Text>
        <Text style={styles.metaValue}>SignAvatars · WLASL {clip.video_id}</Text>
      </View>
    </GlassCard>
  );

  const wordPicker = (
    <GlassCard style={isDesktop ? styles.panelDesktop : undefined} padding={16}>
      <Text style={styles.eyebrow}>WORD</Text>
      <View style={styles.wordGrid}>
        {SIGNABLE_WORDS.map((w) => {
          const active = w === word;
          return (
            <Pressable
              key={w}
              onPress={() => {
                setWord(w);
                setFrame(0);
              }}
              style={[styles.wordChip, active ? [styles.wordChipActive, neuRaised("sm")] : neuInset("sm")]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.wordChipLabel, active ? styles.wordChipLabelActive : styles.wordChipLabelInactive]}>
                {w}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        The seven words where the SignAvatars download overlaps this project's vocabulary.
      </Text>
    </GlassCard>
  );

  const controls = (
    <GlassCard style={isDesktop ? styles.panelDesktop : undefined} padding={16}>
      <Text style={styles.eyebrow}>PLAYBACK</Text>
      <Pressable
        onPress={() => setPlaying((p) => !p)}
        style={[styles.primaryButton, neuRaised("sm")]}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>{playing ? "Pause" : "Play"}</Text>
      </Pressable>

      <Text style={[styles.eyebrow, styles.eyebrowSpaced]}>SPEED</Text>
      <View style={[styles.segmentTrack, neuInset("sm")]}>
        {SPEEDS.map((option) => {
          const active = speed === option.value;
          return (
            <Pressable
              key={option.label}
              onPress={() => setSpeed(option.value)}
              style={[styles.segment, active && [styles.segmentActive, neuRaised("sm")]]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentLabel, active ? styles.segmentLabelActive : styles.segmentLabelInactive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GlassCard>
  );

  const stage = (
    <View style={[styles.stage, isDesktop ? styles.stageDesktop : styles.stageMobile, neuInset("md")]}>
      <SignerAvatar
        key={word}
        clip={clip}
        playing={playing}
        speed={speed}
        onFrame={setFrame}
      />
    </View>
  );

  if (isDesktop) {
    return (
      <View style={styles.bodyDesktop}>
        <View style={styles.leftColumn}>
          {info}
          {wordPicker}
          {controls}
        </View>
        <View style={styles.stageColumn}>{stage}</View>
      </View>
    );
  }

  return (
    <View style={styles.bodyMobile}>
      {stage}
      <View style={styles.mobileStack}>
        {info}
        {wordPicker}
        {controls}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bodyDesktop: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    gap: 26,
    paddingVertical: 18,
    paddingHorizontal: 30,
  },
  leftColumn: {
    width: 352,
    flexShrink: 0,
    gap: 10,
  },
  stageColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  bodyMobile: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  mobileStack: {
    gap: 10,
  },
  panelDesktop: {
    width: "100%",
  },
  stage: {
    backgroundColor: colors.neuWell,
    borderRadius: 24,
    overflow: "hidden",
  },
  stageDesktop: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: 480,
    height: 480,
  },
  stageMobile: {
    width: "100%",
    height: 340,
  },
  eyebrow: {
    ...typography.labelSm,
    color: colors.textTertiary,
    letterSpacing: 1.1,
  },
  eyebrowSpaced: {
    marginTop: 16,
  },
  word: {
    fontFamily: typography.h2.fontFamily,
    fontSize: 30,
    lineHeight: 36,
    color: colors.textPrimary,
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  metaLabel: {
    ...typography.labelSm,
    color: colors.textSecondary,
  },
  metaValue: {
    ...typography.labelSm,
    color: colors.textPrimary,
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: colors.primaryTeal,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
  segmentTrack: {
    flexDirection: "row",
    backgroundColor: colors.neuWell,
    borderRadius: 999,
    padding: 4,
    marginTop: 8,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: colors.surfaceElevated,
  },
  segmentLabel: {
    ...typography.labelSm,
  },
  segmentLabelActive: {
    color: colors.textPrimary,
  },
  segmentLabelInactive: {
    color: colors.adminGray,
  },
  wordGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 10,
  },
  wordChip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: colors.neuWell,
  },
  wordChipActive: {
    backgroundColor: colors.surfaceElevated,
  },
  wordChipLabel: {
    ...typography.labelSm,
  },
  wordChipLabelActive: {
    color: colors.textPrimary,
  },
  wordChipLabelInactive: {
    color: colors.adminGray,
  },
  hint: {
    ...typography.labelSm,
    color: colors.textTertiary,
    marginTop: 10,
    lineHeight: 16,
  },
});
