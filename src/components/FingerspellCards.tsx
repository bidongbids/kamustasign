// The Letters / Numbers translator's right column
// (design_handoff_translator_fingerspelling §2.4, frames F1/F2/F6/F7):
//   NowSigningCard - the hold ring (letter inside), one sentence of what to
//                    do, and confidence as a bar + "92% · Sure".
//   WordCard       - the word being spelled, big, with the actions. Empty, it
//                    shows the three tips in place of the word.
//   PhoneWordCard  - the phone's compact word card (actions live in the
//                    bottom bar there).
import React, { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import ProgressBar from "./ProgressBar";
import TranslatorButton from "./TranslatorButton";
import { FingerspellTips, KEYS_HINT } from "./TranslatorSettings";
import { BackspaceIcon, ExpandIcon, SpeakerIcon } from "./icons/UiIcons";
import { fonts, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";

/** Confidence wording: "Sure" >= 80, "Almost sure" >= the commit threshold, else "Not sure". */
export type SureWord = "Sure" | "Almost sure" | "Not sure" | "No hand";

type NowProps = {
  ring: React.ReactNode;
  title: string;
  hint?: string;
  /** 0-100. With `sure`, drawn as a bar + "92% · Sure". */
  confidence?: number;
  sure?: SureWord;
  /** Instead of the confidence bar: one short line (Words: "24 frames"). */
  footer?: string;
  phone?: boolean;
  /** Desktop at 1366x768: tighter padding. */
  dense?: boolean;
};

export function NowSigningCard({ ring, title, hint, confidence = 0, sure, phone, dense, footer }: NowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const sureColor = sure === "Sure" ? colors.successText : sure === "No hand" ? colors.textTertiary : colors.textSecondary;
  const readout = sure === "No hand" ? "No hand" : confidence > 0 ? `${confidence}% · ${sure}` : sure;
  const bar = !sure ? (
    footer ? <Text style={phone ? styles.footerPhone : styles.footer}>{footer}</Text> : null
  ) : (
    <View style={styles.confRow}>
      <ProgressBar
        compact
        readout="none"
        value={sure === "No hand" ? 0 : confidence / 100}
        color={confidence >= 80 ? "success" : "primary"}
        label="Confidence"
        style={styles.confBar}
      />
      <Text style={[phone ? styles.confTextPhone : styles.confText, { color: sureColor }]} numberOfLines={1}>
        {readout}
      </Text>
    </View>
  );

  if (phone) {
    return (
      <View style={[styles.card, styles.nowPhone]}>
        {ring}
        <View style={styles.nowColPhone}>
          <Text style={styles.titlePhone} accessibilityLiveRegion="polite" numberOfLines={2}>
            {title}
          </Text>
          {bar}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.now, dense && styles.nowDense]}>
      {ring}
      <View style={styles.nowCol}>
        <Text style={styles.meta}>NOW SIGNING</Text>
        <Text style={styles.title} accessibilityLiveRegion="polite">
          {title}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {bar ? <View style={{ marginTop: 4 }}>{bar}</View> : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

type WordProps = {
  letters: string[];
  languageName: string;
  /** 1366x768: 44px word, tighter gaps. */
  dense?: boolean;
  /** Very short windows: drop the speak hint and the keyboard hint. */
  tight?: boolean;
  speakLabel: string;
  onSpeak: () => void;
  onShow: () => void;
  onSpace: () => void;
  onDelete: () => void;
  onClear: () => void;
};

const countLetters = (letters: string[]) => letters.filter((l) => l !== " ").length;

/** The word, as large as fits one or two lines of `width` (Baloo caps ~0.64em wide). */
function fitWord(text: string, width: number, max: number, min: number) {
  if (!width || !text) return { size: max, text };
  const per = 0.64;
  const avail = width - 16;
  const size = Math.max(min, Math.min(max, avail / (text.length * per)));
  if (size > min) return { size, text };
  // Two lines at the smallest size; past that, keep the newest letters.
  const fits = Math.floor((avail * 2) / (min * per));
  return { size: min, text: text.length > fits ? "…" + text.slice(-(fits - 1)) : text };
}

export function WordCard({ letters, languageName, dense, tight, speakLabel, onSpeak, onShow, onSpace, onDelete, onClear }: WordProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const word = letters.join("");
  const n = countLetters(letters);
  const empty = word.trim().length === 0;
  const fit = fitWord(word, width, dense ? 44 : 56, dense ? 26 : 30);

  return (
    <View style={[styles.card, styles.word, dense && styles.wordDense]}>
      <View style={styles.wordHead}>
        <Text style={styles.meta}>YOUR WORD</Text>
        {!empty ? (
          <Text style={styles.wordMeta}>
            {n} letter{n === 1 ? "" : "s"} · {languageName}
          </Text>
        ) : null}
      </View>

      {empty ? (
        <View style={[styles.emptyBlock, dense && { gap: 10 }]}>
          <Text style={[styles.emptyTitle, dense && { fontSize: 22, lineHeight: 27 }]}>Spell a word with your hand.</Text>
          <FingerspellTips iconSize={dense ? 30 : 34} textSize={dense ? 13.5 : 14.5} />
        </View>
      ) : (
        <>
          <View style={styles.wordRow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            <Text
              style={[styles.wordText, { fontSize: fit.size, lineHeight: Math.round(fit.size * 1.08), letterSpacing: fit.size * 0.04 }]}
              numberOfLines={2}
              accessibilityLabel={`Your word: ${word}`}
            >
              {fit.text}
            </Text>
            <View style={[styles.caret, { height: Math.round(fit.size * 0.82) }]} />
          </View>
          {!tight ? (
            <View style={styles.speakHint}>
              <SpeakerIcon size={16} color={colors.textSecondary} />
              <Text style={styles.speakHintText}>Will be spoken in {languageName} · finish the word, then press Speak</Text>
            </View>
          ) : null}
        </>
      )}

      <View style={styles.spacer} />

      <View style={styles.actions}>
        <TranslatorButton
          tone="accent"
          size="lg"
          grow
          label={speakLabel}
          icon={(c) => <SpeakerIcon size={18} color={c} />}
          onPress={onSpeak}
          disabled={empty}
          accessibilityLabel="Speak it aloud"
          accessibilityHint={empty ? "Spell a word first" : undefined}
        />
        <TranslatorButton
          tone="neu"
          size="lg"
          label="Show to someone"
          icon={(c) => <ExpandIcon size={17} color={c} />}
          onPress={onShow}
          disabled={empty}
          accessibilityHint={empty ? "Spell a word first" : "Shows the word full screen"}
        />
      </View>
      <View style={styles.actions}>
        <TranslatorButton tone="ghost" grow label="Space" onPress={onSpace} accessibilityLabel="Add a space" />
        <TranslatorButton tone="ghost" grow label="Delete letter" icon={(c) => <BackspaceIcon size={17} color={c} />} onPress={onDelete} />
        <TranslatorButton tone="ghost" grow label="Clear word" onPress={onClear} />
      </View>
      {Platform.OS === "web" && !tight ? <Text style={styles.keys}>{KEYS_HINT}</Text> : null}
    </View>
  );
}

export function PhoneWordCard({ letters }: { letters: string[] }) {
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const word = letters.join("");
  const empty = word.trim().length === 0;
  const fit = fitWord(word, width, 36, 24);
  return (
    <View style={[styles.card, styles.wordPhone]} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 28)}>
      <Text style={styles.meta}>YOUR WORD</Text>
      {empty ? (
        <Text style={styles.emptyPhone}>Spell a word with your hand.</Text>
      ) : (
        <View style={styles.wordRow}>
          <Text
            style={[styles.wordText, { fontSize: fit.size, lineHeight: Math.round(fit.size * 1.2), letterSpacing: fit.size * 0.03 }]}
            numberOfLines={2}
            accessibilityLabel={`Your word: ${word}`}
          >
            {fit.text}
          </Text>
          <View style={[styles.caret, { height: Math.round(fit.size * 0.8), width: 3 }]} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) => {
  const dark = theme.name === "dark";
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: dark ? "rgba(255,255,255,0.08)" : colors.border,
      borderRadius: 22,
      boxShadow: dark
        ? [{ offsetX: 0, offsetY: 10, blurRadius: 30, color: "rgba(0,0,0,0.28)" }]
        : [
            { offsetX: 0, offsetY: 1, blurRadius: 2, color: "rgba(27,31,42,0.05)" },
            { offsetX: 0, offsetY: 8, blurRadius: 22, color: "rgba(102,114,146,0.12)" },
          ],
    } as object,
    meta: { fontFamily: fonts.bodyMedium, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.15, color: colors.textTertiary },

    now: { flexDirection: "row", alignItems: "center", gap: 22, paddingVertical: 20, paddingHorizontal: 22 },
    nowDense: { gap: 18, paddingVertical: 16, paddingHorizontal: 18 },
    nowCol: { flex: 1, minWidth: 0, gap: 8 },
    title: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 27, color: colors.textPrimary },
    hint: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 21, color: colors.textSecondary },
    confRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    confBar: { flex: 1, minWidth: 0 },
    confText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, lineHeight: 17 },
    confTextPhone: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, lineHeight: 16 },
    footer: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, lineHeight: 17, color: colors.textSecondary },
    footerPhone: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },

    nowPhone: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 14 },
    nowColPhone: { flex: 1, minWidth: 0, gap: 6 },
    titlePhone: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 21, color: colors.textPrimary },

    word: { flex: 1, minHeight: 0, gap: 14, paddingVertical: 20, paddingHorizontal: 22 },
    wordDense: { gap: 12, paddingVertical: 16, paddingHorizontal: 18 },
    wordHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    wordMeta: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
    wordRow: { flexDirection: "row", alignItems: "center", flexWrap: "nowrap" },
    wordText: { flexShrink: 1, fontFamily: fonts.heading, color: colors.textPrimary },
    caret: { width: 4, marginLeft: 6, borderRadius: 2, backgroundColor: colors.accentCoralText, flexShrink: 0 },
    speakHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.well,
    },
    speakHintText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, color: colors.textSecondary },
    emptyBlock: { gap: 12, paddingVertical: 4 },
    emptyTitle: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 31, color: colors.textSecondary },
    spacer: { flexGrow: 1, minHeight: 0 },
    actions: { flexDirection: "row", gap: 10 },
    keys: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: colors.textTertiary },

    wordPhone: { paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
    emptyPhone: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.textSecondary },
  });
};
