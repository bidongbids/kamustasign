// "Show to someone" (design_handoff_translator_fingerspelling §5, frame F5):
// the word full screen, as large as fits (max 180px), themed. It shows
// "{name} signed" when someone is signed in, the translation line when the
// speech language turned the word into something else, Speak it aloud and
// Close. Tapping anywhere or Esc (web) still closes it. Shared by the Letters
// / Numbers and Words translators.
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TranslatorButton from "./TranslatorButton";
import { CloseIcon, SpeakerIcon } from "./icons/UiIcons";
import { fonts, type ThemeColors } from "../theme/theme";
import { useThemedStyles, type Theme } from "../theme/ThemeProvider";

type Props = {
  visible: boolean;
  onClose: () => void;
  text: string;
  /** The signed-in person's name; the first word is shown. */
  signerName?: string;
  /** Shown as “{translation}” in {languageName}. */
  translation?: string;
  languageName: string;
  speakLabel: string;
  onSpeak: () => void;
  reduceMotion?: boolean;
};

export default function ShowToSomeone({ visible, onClose, text, signerName, translation, languageName, speakLabel, onSpeak, reduceMotion }: Props) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const shown = text.trim();
  const size = Math.max(40, Math.min(180, (width - 64) / (Math.max(shown.length, 1) * 0.62), height * 0.3));
  const firstName = signerName?.trim().split(/\s+/)[0];

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? "none" : "fade"} onRequestClose={onClose}>
      <Pressable style={styles.root} onPress={onClose} accessibilityLabel="Close the big view">
        <View style={styles.center} pointerEvents="none">
          {firstName ? <Text style={styles.who}>{firstName} signed</Text> : null}
          <Text
            style={[styles.text, { fontSize: size, lineHeight: Math.round(size * 1.05), letterSpacing: size * 0.04 }]}
            accessibilityRole="header"
            numberOfLines={3}
          >
            {shown}
          </Text>
          {translation ? (
            <Text style={styles.translation}>
              “{translation}” in {languageName}
            </Text>
          ) : null}
        </View>
        <View style={[styles.close, { top: Math.max(insets.top, 12) + 16 }]}>
          <TranslatorButton tone="neu" size="lg" label="Close" icon={(c) => <CloseIcon size={18} color={c} />} onPress={onClose} />
        </View>
        <View style={[styles.speak, { bottom: Math.max(insets.bottom, 12) + 28 }]}>
          <TranslatorButton
            tone="accent"
            size="lg"
            label={speakLabel}
            icon={(c) => <SpeakerIcon size={18} color={c} />}
            onPress={onSpeak}
            accessibilityLabel="Speak it aloud"
          />
        </View>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    center: { alignItems: "center", gap: 24, maxWidth: "100%" },
    who: { fontFamily: fonts.bodySemiBold, fontSize: 20, lineHeight: 26, color: colors.textSecondary },
    text: { fontFamily: fonts.heading, color: colors.textPrimary, textAlign: "center" },
    translation: { fontFamily: fonts.bodySemiBold, fontSize: 22, lineHeight: 28, color: colors.textSecondary, textAlign: "center" },
    close: { position: "absolute", right: 32 },
    speak: { position: "absolute", alignSelf: "center" },
  });
