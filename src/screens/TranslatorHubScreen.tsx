// The Translator's chrome (docs/design/design_handoff_translator_fingerspelling
// §2, §6, frames F1/F7):
//   header     - Back, "Translator", ASL | FSL (the top-level choice),
//                "Speak in {language}", Appearance, and ? (how it works)
//   second row - Letters · Numbers · Words in one row; for Letters/Numbers
//                the Signing hand toggle and Settings on the right, for Words
//                its Auto / Manual choice.
// Phones: Back, "Translator", Settings, Appearance; then ASL | FSL and
// Letters · Numbers · Words full width (the speech language, the signing
// hand, the hold time, Auto / Manual and Clear word live in the Settings
// sheet). The signing hand only changes how letters and numbers are read,
// so Words doesn't show it.
//
// Letters and Numbers mount LiveTranslatorScreen - one screen, so switching
// between them swaps the classifier, never the camera. Letters and numbers
// are separate models because several ASL digits are the same handshape as a
// letter (O/0, F/9, V/2, W/6); this choice tells the reader which alphabet
// is being spelled. Words mounts WordTranslatorScreen (one screen at a time,
// as before). The camera stream and the landmarker queue are owned here and
// shared by both, so a switch never re-requests the camera.
// The Signer (3D signing figure) is no longer reached from here; SignerScreen
// stays in the codebase.
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LiveTranslatorScreen from "./LiveTranslatorScreen";
import WordTranslatorScreen, { type CaptureMode } from "./WordTranslatorScreen";
import GradientBackground from "../components/GradientBackground";
import BackButton from "../components/BackButton";
import SegmentedToggle from "../components/SegmentedToggle";
import TranslatorButton from "../components/TranslatorButton";
import { AppearanceButton } from "../components/AppearancePanel";
import LanguagePicker, { useSelectedLanguage } from "../components/LanguagePicker";
import { HandednessToggle, useHandedness } from "../components/HandednessPicker";
import { useHoldDuration } from "../components/HoldDurationControl";
import { TranslatorHelp, TranslatorSettings, useTranslatorDisplay } from "../components/TranslatorSettings";
import { ChevronDownIcon, SlidersIcon, SpeakerIcon } from "../components/icons/UiIcons";
import { useSharedCameraStream } from "../hooks/useSharedCameraStream";
import { useSharedLandmarkers } from "../hooks/useSharedLandmarkers";
import type { SignLanguage } from "../ml/modelLoader";
import { useBackHandler } from "../lib/backNavigation";
import { fonts, type ThemeColors } from "../theme/theme";
import { useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { useResponsive } from "../theme/responsive";

type What = "letters" | "numbers" | "words";

const LANGUAGES: { key: SignLanguage; label: string }[] = [
  { key: "asl", label: "ASL" },
  { key: "fsl", label: "FSL" },
];

const WHAT: { key: What; label: string }[] = [
  { key: "letters", label: "Letters" },
  { key: "numbers", label: "Numbers" },
  { key: "words", label: "Words" },
];

const CAPTURE_MODES: { key: CaptureMode; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "manual", label: "Manual" },
];

// Words: hands-free (auto) or Record/Stop (manual). The same saved setting
// as Practice's.
const MODE_STORAGE_KEY = "kamustasign:wordCaptureMode";

function useCaptureMode(): [CaptureMode, (m: CaptureMode) => void] {
  const [mode, setMode] = useState<CaptureMode>("auto");
  useEffect(() => {
    AsyncStorage.getItem(MODE_STORAGE_KEY)
      .then((saved) => {
        if (saved === "auto" || saved === "manual") setMode(saved);
      })
      .catch(() => {});
  }, []);
  const update = (next: CaptureMode) => {
    setMode(next);
    AsyncStorage.setItem(MODE_STORAGE_KEY, next).catch(() => {});
  };
  return [mode, update];
}

// Popovers sit under the button that opened them.
const HELP_TOP = 72;
const SETTINGS_TOP = 132;

type Props = {
  onBack?: () => void;
  /** Where Back goes, for screen readers, e.g. "Back to your dashboard". */
  backLabel?: string;
  /** The signed-in person, for "{name} signed" on Show to someone. */
  signerName?: string;
};

export default function TranslatorHubScreen({ onBack, backLabel = "Back", signerName }: Props) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { isMobile } = useResponsive();
  const [language, setLanguage] = useState<SignLanguage>("asl");
  const [what, setWhat] = useState<What>("letters");
  const [captureMode, setCaptureMode] = useCaptureMode();
  const [targetLanguage, setTargetLanguage] = useSelectedLanguage();
  const [handedness, setHandedness] = useHandedness();
  const [holdMs, setHoldMs] = useHoldDuration();
  const [display, setDisplay] = useTranslatorDisplay();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const clearWordRef = useRef<(() => void) | null>(null);
  const { getCameraStream } = useSharedCameraStream();
  const { createHandLandmarker, createHolisticLandmarker, releaseLandmarker } = useSharedLandmarkers();
  // The browser's and Android's back return where the Translator was opened from.
  useBackHandler(onBack ?? null);

  const words = what === "words";

  const speechPicker = (full: boolean) => (
    <LanguagePicker
      value={targetLanguage}
      onChange={setTargetLanguage}
      renderTrigger={({ open, current }) => (
        <TranslatorButton
          tone="neu"
          label={full ? current.name : `Speak in ${current.name}`}
          icon={(c) => <SpeakerIcon size={16} color={c} />}
          iconRight={(c) => <ChevronDownIcon size={14} color={c} />}
          onPress={open}
          accessibilityLabel={`Speak in ${current.name}. Change the speech language`}
          style={full ? styles.speechFull : styles.speechPill}
        />
      )}
    />
  );

  const whatTabs = (
    <SegmentedToggle
      size="md"
      stretch={isMobile}
      height={isMobile ? 38 : undefined}
      itemPadding={isMobile ? 0 : undefined}
      options={WHAT}
      value={what}
      onChange={setWhat}
      accessibilityLabel="What to translate"
    />
  );

  const languageTabs = (
    <SegmentedToggle
      size={isMobile ? "md" : "lg"}
      stretch={isMobile}
      itemPadding={isMobile ? 0 : undefined}
      options={LANGUAGES}
      value={language}
      onChange={setLanguage}
      accessibilityLabel="Sign language"
    />
  );

  return (
    <GradientBackground variant="subtle" style={styles.root}>
      {isMobile ? (
        <View style={[styles.phoneTop, { paddingTop: Math.max(insets.top, 6) + 2 }]}>
          <View style={styles.phoneHeader}>
            {onBack ? <BackButton iconOnly onPress={onBack} accessibilityLabel={backLabel} /> : null}
            <Text style={styles.phoneTitle} accessibilityRole="header" numberOfLines={1}>
              Translator
            </Text>
            <TranslatorButton
              tone="neu"
              square
              icon={(c) => <SlidersIcon size={18} color={c} />}
              onPress={() => setSettingsOpen(true)}
              active={settingsOpen}
              accessibilityLabel="Settings"
            />
            <AppearanceButton compact />
          </View>
          {languageTabs}
          {whatTabs}
        </View>
      ) : (
        <>
          <View style={styles.header}>
            {onBack ? <BackButton onPress={onBack} accessibilityLabel={backLabel} /> : null}
            <Text style={styles.title} accessibilityRole="header">
              Translator
            </Text>
            <View style={styles.flex} />
            {languageTabs}
            <View style={styles.flex} />
            {speechPicker(false)}
            <AppearanceButton iconOnly />
            <TranslatorButton tone="neu" square glyph="?" onPress={() => setHelpOpen(true)} active={helpOpen} accessibilityLabel="How it works" />
          </View>
          <View style={styles.subRow}>
            {whatTabs}
            <View style={styles.flex} />
            {words ? (
              <View style={styles.inlineGroup}>
                <Text style={styles.inlineLabel}>Reading a sign</Text>
                <SegmentedToggle kind="radio" size="sm" options={CAPTURE_MODES} value={captureMode} onChange={setCaptureMode} accessibilityLabel="Reading a sign" />
              </View>
            ) : (
              <View style={styles.inlineGroup}>
                <Text style={styles.inlineLabel}>Signing hand</Text>
                <HandednessToggle value={handedness} onChange={setHandedness} />
              </View>
            )}
            <TranslatorButton
              tone="neu"
              label="Settings"
              icon={(c) => <SlidersIcon size={16} color={c} />}
              onPress={() => setSettingsOpen(true)}
              active={settingsOpen}
            />
          </View>
        </>
      )}

      <View style={styles.body}>
        {words ? (
          <WordTranslatorScreen
            targetLanguage={targetLanguage}
            getCameraStream={getCameraStream}
            createHolisticLandmarker={createHolisticLandmarker}
            releaseLandmarker={releaseLandmarker}
            language={language}
            mode={captureMode}
            signerName={signerName}
          />
        ) : (
          <LiveTranslatorScreen
            targetLanguage={targetLanguage}
            getCameraStream={getCameraStream}
            createHandLandmarker={createHandLandmarker}
            releaseLandmarker={releaseLandmarker}
            alphabet={what}
            language={language}
            signerName={signerName}
            clearWordRef={clearWordRef}
          />
        )}
      </View>

      <TranslatorSettings
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sheet={isMobile}
        top={SETTINGS_TOP}
        holdMs={words ? undefined : holdMs}
        onHoldMs={setHoldMs}
        handedness={words ? undefined : handedness}
        onHandedness={setHandedness}
        display={display}
        onDisplay={setDisplay}
        captureMode={words && isMobile ? captureMode : undefined}
        onCaptureMode={setCaptureMode}
        speechLanguage={isMobile ? speechPicker(true) : undefined}
        onClearWord={isMobile && !words ? () => clearWordRef.current?.() : undefined}
        onHelp={
          isMobile
            ? () => {
                setSettingsOpen(false);
                setHelpOpen(true);
              }
            : undefined
        }
      />
      <TranslatorHelp
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
        sheet={isMobile}
        top={HELP_TOP}
        what={what}
        captureMode={captureMode}
      />
    </GradientBackground>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) => {
  const hairline = theme.name === "dark" ? "rgba(255,255,255,0.08)" : colors.border;
  return StyleSheet.create({
    root: { flex: 1 },
    flex: { flex: 1, minWidth: 8 },
    header: {
      height: 68,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 24,
      backgroundColor: colors.surfaceElevated,
      borderBottomWidth: 1,
      borderBottomColor: hairline,
    },
    title: { fontFamily: fonts.heading, fontSize: 21, lineHeight: 25, color: colors.textPrimary, marginLeft: 6 },
    speechPill: { maxWidth: 280 },
    speechFull: { alignSelf: "stretch", justifyContent: "flex-start" },
    subRow: {
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 24,
    },
    inlineGroup: { flexDirection: "row", alignItems: "center", gap: 10 },
    inlineLabel: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },

    phoneTop: { flexShrink: 0, paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
    phoneHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 2 },
    phoneTitle: { flex: 1, fontFamily: fonts.heading, fontSize: 19, lineHeight: 24, color: colors.textPrimary, marginLeft: 2 },
    body: { flex: 1, minHeight: 0 },
  });
};
