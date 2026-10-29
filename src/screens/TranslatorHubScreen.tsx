// Owns the shared chrome above both live-translator modes: the logo, the
// Letters/Words switcher, the standing target-language pill, and the help
// button — per docs/design/design_handoff_kamustasign_material_pass/README.md ("Center:
// the Letters/Words pill switcher — this is the hub's mode control").
// LiveTranslatorScreen.tsx / WordTranslatorScreen.tsx now only render their
// two-column body; neither wraps itself in its own GradientBackground or
// draws its own language picker anymore, so switching modes can't leave two
// gradients or two language triggers on screen at once. Kept as a thin
// switch (not a merged screen) so neither mode's camera/inference logic
// risks breaking the other.

import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import FingerspellingScreen from "./FingerspellingScreen";
import WordsScreen from "./WordsScreen";
import SignerScreen from "./SignerScreen";
import GradientBackground from "../components/GradientBackground";
import HandLandmarkMark from "../components/HandLandmarkMark";
import LanguagePicker, { useSelectedLanguage } from "../components/LanguagePicker";
import { ChevronDownIcon, ChevronLeftIcon, HelpCircleIcon } from "../components/icons/UiIcons";
import { useSharedCameraStream } from "../hooks/useSharedCameraStream";
import { useSharedLandmarkers } from "../hooks/useSharedLandmarkers";
import { findLanguage } from "../lib/languages";
import { useBackHandler } from "../lib/backNavigation";
import { spacing, typography, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { useResponsive } from "../theme/responsive";

type Mode = "fingerspelling" | "word" | "signer";

const MODE_LABELS: Record<Mode, string> = {
  fingerspelling: "Fingerspelling",
  word: "Words",
  signer: "Signer",
};

const HELP_TEXT: Record<Mode, string> = {
  fingerspelling:
    "Hold up one letter or digit at a time in front of the camera. Use the Letters/Numbers switch above the camera to pick which alphabet to read - several ASL digits share a handshape with a letter (O and 0, F and 9, V and 2, W and 6), so the switch is what tells them apart. If you sign left-handed, flip the signing-hand switch so the model mirrors your landmarks.",
  word: "Press the record button, sign a whole word, then press it again to classify. The top match is translated and spoken automatically.",
  signer:
    "The reverse direction: a 3D figure signs for you. Right now it plays one bundled recording so the playback can be judged; typing your own words comes next.",
};

type Props = {
  onBack?: () => void;
  /** Where Back goes, for screen readers, e.g. "Back to your dashboard". */
  backLabel?: string;
};

export default function TranslatorHubScreen({ onBack, backLabel = "Back" }: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [mode, setMode] = useState<Mode>("fingerspelling");
  const { isDesktop } = useResponsive();
  const [targetLanguage, setTargetLanguage] = useSelectedLanguage();
  const currentLanguageName = findLanguage(targetLanguage)?.name ?? "English";
  const { getCameraStream } = useSharedCameraStream();
  const { createHandLandmarker, createHolisticLandmarker, releaseLandmarker } = useSharedLandmarkers();
  // The browser's and Android's back return where the Translator was opened from.
  useBackHandler(onBack ?? null);

  return (
    <GradientBackground variant="subtle" style={styles.root}>
      <View style={[styles.header, !isDesktop && styles.headerMobile]}>
        {isDesktop && (
          <LinearGradient
            colors={["rgba(255,255,255,0.05)", "rgba(255,255,255,0.01)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        <View style={[styles.headerRow, isDesktop ? styles.headerRowDesktop : styles.headerRowMobile]}>
        <View style={styles.headerGroup}>
          {onBack && (
            <Pressable
              onPress={onBack}
              style={[styles.helpButton, shadows.neuRaised("sm")]}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
            >
              <ChevronLeftIcon size={16} color={colors.textSecondary} />
            </Pressable>
          )}
          <View style={[styles.logoTile, !isDesktop && styles.logoTileMobile, shadows.neuRaised("sm")]}>
            <HandLandmarkMark size={isDesktop ? 17 : 15} color={colors.primaryTeal} dotColor={colors.accentCoral} animated={false} />
          </View>
          {isDesktop && <Text style={styles.headerTitle}>Translator</Text>}
        </View>

        <View style={[styles.switcherTrack, !isDesktop && styles.switcherTrackMobile, shadows.neuInset("sm")]}>
          {(["fingerspelling", "word", "signer"] as Mode[]).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[styles.switcherOption, !isDesktop && styles.switcherOptionMobile, active && [styles.switcherOptionActive, shadows.neuRaised("sm")]]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.switcherLabel,
                    !isDesktop && styles.switcherLabelMobile,
                    active ? styles.switcherLabelActive : styles.switcherLabelInactive,
                  ]}
                >
                  {MODE_LABELS[m]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.headerGroup}>
          <LanguagePicker
            value={targetLanguage}
            onChange={setTargetLanguage}
            accentColor={colors.accentCoral}
            renderTrigger={({ open, current }) => (
              <Pressable
                onPress={open}
                style={[styles.langPill, shadows.neuRaised("sm")]}
                accessibilityRole="button"
                accessibilityLabel={`Translate to ${current.name}`}
              >
                <Text style={styles.langPillText} numberOfLines={1}>
                  {isDesktop ? currentLanguageName : current.code.toUpperCase()}
                </Text>
                <ChevronDownIcon size={11} color={colors.textSecondary} />
              </Pressable>
            )}
          />
          <Pressable
            onPress={() => Alert.alert(MODE_LABELS[mode], HELP_TEXT[mode])}
            style={[styles.helpButton, shadows.neuRaised("sm")]}
            accessibilityRole="button"
            accessibilityLabel="Help"
          >
            <HelpCircleIcon size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
        </View>
      </View>

      <View style={styles.body}>
        {mode === "fingerspelling" && (
          <FingerspellingScreen
            targetLanguage={targetLanguage}
            getCameraStream={getCameraStream}
            createHandLandmarker={createHandLandmarker}
            releaseLandmarker={releaseLandmarker}
          />
        )}
        {mode === "word" && (
          <WordsScreen
            targetLanguage={targetLanguage}
            getCameraStream={getCameraStream}
            createHolisticLandmarker={createHolisticLandmarker}
            releaseLandmarker={releaseLandmarker}
          />
        )}
        {mode === "signer" && <SignerScreen />}
      </View>
    </GradientBackground>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  root: {
    flex: 1,
  },
  // 70 high, full-bleed bottom border - the header's actual content sits in
  // a centered 1600px row (headerRowDesktop) per the instrument-panel
  // handoff, not stretched edge-to-edge like the border is.
  header: {
    height: 70,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.name === "dark" ? "rgba(255,255,255,0.09)" : colors.border,
    position: "relative",
  },
  headerMobile: {
    height: "auto",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerRowDesktop: {
    width: "100%",
    maxWidth: 1600,
    alignSelf: "center",
    paddingHorizontal: 30,
  },
  headerRowMobile: {
    flexWrap: "wrap",
    rowGap: 10,
  },
  headerGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoTile: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.neuBase,
    alignItems: "center",
    justifyContent: "center",
  },
  logoTileMobile: {
    width: 30,
    height: 30,
    borderRadius: 10,
  },
  headerTitle: {
    fontFamily: typography.h3.fontFamily,
    fontSize: 18,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  switcherTrack: {
    flexDirection: "row",
    backgroundColor: colors.neuWell,
    borderRadius: 999,
    padding: 5,
  },
  switcherTrackMobile: {
    padding: 4,
  },
  switcherOption: {
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  switcherOptionMobile: {
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  switcherOptionActive: {
    backgroundColor: colors.surfaceElevated,
  },
  switcherLabel: {
    ...typography.label,
  },
  switcherLabelMobile: {
    ...typography.labelSm,
  },
  switcherLabelActive: {
    color: colors.textPrimary,
  },
  switcherLabelInactive: {
    color: colors.adminGray,
  },
  langPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.neuBase,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  langPillText: {
    ...typography.labelSm,
    color: colors.textSecondary,
    maxWidth: 90,
  },
  helpButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.neuBase,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});
