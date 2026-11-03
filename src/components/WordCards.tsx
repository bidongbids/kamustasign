// The Words translator's right column, in the Letters / Numbers design
// (design_handoff_translator_fingerspelling, applied to Words):
//   RecordDisc     - where Letters has its hold ring. Manual: the Record /
//                    Stop button. Auto (hands-free): a status light - watching,
//                    reading your sign, checking.
//   MatchesCard    - the top match, big, with its confidence and translation,
//                    the other matches, and Speak / Show to someone / Clear.
//                    Empty, it shows how to sign a word instead.
//   PhoneMatchCard - the phone's compact version (actions in the bottom bar).
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import ProgressBar from "./ProgressBar";
import TranslatorButton from "./TranslatorButton";
import { CheckIcon, ClockIcon, ExpandIcon, HandIcon, SpeakerIcon } from "./icons/UiIcons";
import { fonts, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { focusFromKeyboard } from "../lib/focusVisible";

export type WordMatch = { name: string; confidence: number };

/** Words are only shown at MIN_CONFIDENCE (40) or more, so the lowest word is "Maybe". */
export const matchSure = (c: number) => (c >= 80 ? "Sure" : c >= 60 ? "Almost sure" : "Maybe");

// ---------------------------------------------------------------------------

type DiscProps = {
  mode: "auto" | "manual";
  state: "idle" | "capturing" | "checking";
  size: number;
  disabled?: boolean;
  onPress?: () => void;
};

export function RecordDisc({ mode, state, size, disabled, onPress }: DiscProps) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const r = size / 2 - 6;
  const inset = size >= 100 ? 16 : 12;
  const disc = size - inset * 2;
  const arc =
    state === "capturing" ? (mode === "manual" ? colors.danger : colors.accentCoralText) : state === "checking" ? colors.primary : null;

  const ring = (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={arc ?? colors.well} strokeWidth={8} />
    </Svg>
  );
  const discStyle = [styles.disc, { top: inset, left: inset, width: disc, height: disc, borderRadius: disc / 2 }, shadows.neuRaised("sm")];

  if (mode === "manual") {
    const recording = state === "capturing";
    const mark = Math.round(disc * 0.34);
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={recording ? "Stop recording" : "Start recording"}
        accessibilityState={{ disabled: !!disabled }}
        style={(st: any) => [
          { width: size, height: size, flexShrink: 0, borderRadius: size / 2 },
          disabled && { opacity: 0.45 },
          Platform.OS === "web" ? ({ cursor: disabled ? "default" : "pointer" } as object) : null,
          st.focused && focusFromKeyboard() && styles.focused,
        ]}
      >
        {(st: any) => (
          <>
            {ring}
            <View style={[discStyle, st.pressed && !disabled && shadows.neuPressed()]}>
              <View
                style={{
                  width: mark,
                  height: mark,
                  borderRadius: recording ? Math.round(mark * 0.22) : mark / 2,
                  backgroundColor: colors.danger,
                }}
              />
            </View>
          </>
        )}
      </Pressable>
    );
  }

  const icon =
    state === "checking" ? (
      <ClockIcon size={Math.round(disc * 0.34)} color={colors.primaryText} />
    ) : (
      <HandIcon size={Math.round(disc * 0.4)} color={state === "capturing" ? colors.accentCoralText : colors.textTertiary} />
    );
  return (
    <View
      style={{ width: size, height: size, flexShrink: 0 }}
      accessibilityLabel={state === "capturing" ? "Reading your sign" : state === "checking" ? "Checking the sign" : "Hands-free, watching for signs"}
    >
      {ring}
      <View style={discStyle}>{icon}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------

/** How to sign a word, in the empty card. */
function WordTips({ mode, compact }: { mode: "auto" | "manual"; compact?: boolean }) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const size = compact ? 30 : 34;
  const tips =
    mode === "auto"
      ? [
          { icon: <HandIcon size={16} color={colors.primaryText} />, text: "Sign one whole word." },
          { icon: <ClockIcon size={16} color={colors.accentCoralText} />, text: "Then lower or still your hands. The word is read when they settle." },
          { icon: <CheckIcon size={16} color={colors.successText} strokeWidth={2.6} />, text: "Not sure? Nothing is shown. Just sign it again." },
        ]
      : [
          { icon: <View style={[styles.recDot, { backgroundColor: colors.danger }]} />, text: "Press Record." },
          { icon: <HandIcon size={16} color={colors.primaryText} />, text: "Sign one whole word." },
          { icon: <CheckIcon size={16} color={colors.successText} strokeWidth={2.6} />, text: "Press Stop. The top match is shown and spoken." },
        ];
  return (
    <View style={styles.tips}>
      {tips.map((t, i) => (
        <View key={i} style={styles.tipRow}>
          <View style={[styles.tipIcon, { width: size, height: size, borderRadius: size / 2 }, shadows.neuInset("sm")]}>{t.icon}</View>
          <Text style={[styles.tipText, compact && { fontSize: 13.5, lineHeight: 19 }]}>{t.text}</Text>
        </View>
      ))}
    </View>
  );
}

function OtherMatches({ matches, compact }: { matches: WordMatch[]; compact?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  if (matches.length === 0) return null;
  return (
    <View style={styles.others}>
      <Text style={styles.meta}>OTHER MATCHES</Text>
      {matches.map((m) => (
        <View key={m.name} style={styles.otherRow}>
          <Text style={[styles.otherName, compact && { fontSize: 13.5 }]} numberOfLines={1}>
            {m.name}
          </Text>
          <ProgressBar compact readout="none" value={m.confidence / 100} color="primary" label={`${m.name} match`} style={styles.otherBar} />
          <Text style={styles.otherPct}>{Math.round(m.confidence)}%</Text>
        </View>
      ))}
    </View>
  );
}

type MatchesProps = {
  mode: "auto" | "manual";
  top: WordMatch | null;
  others: WordMatch[];
  /** "Translating…", “Hola” in Spanish, or "Spoken in English". */
  speechLine: string;
  speechError?: string | null;
  dense?: boolean;
  tight?: boolean;
  speakLabel: string;
  onSpeak: () => void;
  onShow: () => void;
  onClear: () => void;
  keysHint?: string;
};

export function MatchesCard({ mode, top, others, speechLine, speechError, dense, tight, speakLabel, onSpeak, onShow, onClear, keysHint }: MatchesProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const pct = top ? Math.round(top.confidence) : 0;
  const sure = top ? matchSure(top.confidence) : "";
  const nameSize = dense ? 44 : 56;
  const fit = top ? Math.max(26, Math.min(nameSize, 470 / (top.name.length * 0.6))) : nameSize;

  return (
    <View style={[styles.card, styles.matches, dense && styles.matchesDense]}>
      <View style={styles.head}>
        <Text style={styles.meta}>TOP MATCH</Text>
        {top ? <Text style={[styles.headRight, sure === "Sure" && { color: colors.successText }]}>{`${pct}% · ${sure}`}</Text> : null}
      </View>

      {top ? (
        <>
          <Text style={[styles.topName, { fontSize: fit, lineHeight: Math.round(fit * 1.1) }]} numberOfLines={2} accessibilityLiveRegion="polite">
            {top.name}
          </Text>
          <ProgressBar
            compact
            readout="none"
            value={top.confidence / 100}
            color={top.confidence >= 80 ? "success" : "primary"}
            label="Top match confidence"
          />
          <View style={styles.speechRow}>
            <SpeakerIcon size={16} color={colors.textSecondary} />
            <Text style={styles.speechText} numberOfLines={2}>
              {speechLine}
            </Text>
          </View>
          {speechError ? <Text style={styles.error}>{speechError}</Text> : null}
          <OtherMatches matches={others.slice(0, tight ? 2 : dense ? 3 : 4)} compact={dense} />
        </>
      ) : (
        <View style={[styles.emptyBlock, dense && { gap: 10 }]}>
          <Text style={[styles.emptyTitle, dense && { fontSize: 22, lineHeight: 27 }]}>Sign a word to see it here.</Text>
          <WordTips mode={mode} compact={dense} />
        </View>
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
          disabled={!top}
          accessibilityLabel="Speak it aloud"
          accessibilityHint={top ? undefined : "Sign a word first"}
        />
        <TranslatorButton
          tone="neu"
          size="lg"
          label="Show to someone"
          icon={(c) => <ExpandIcon size={17} color={c} />}
          onPress={onShow}
          disabled={!top}
          accessibilityHint={top ? "Shows the word full screen" : "Sign a word first"}
        />
      </View>
      <View style={styles.actions}>
        <TranslatorButton tone="ghost" grow label="Clear" onPress={onClear} accessibilityLabel="Clear the matches" />
      </View>
      {keysHint && !tight ? <Text style={styles.keys}>{keysHint}</Text> : null}
    </View>
  );
}

export function PhoneMatchCard({ top, others, speechLine }: { top: WordMatch | null; others: WordMatch[]; speechLine: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.card, styles.phoneCard]}>
      <View style={styles.head}>
        <Text style={styles.meta}>TOP MATCH</Text>
        {top ? (
          <Text style={[styles.headRight, top.confidence >= 80 && { color: colors.successText }]}>
            {`${Math.round(top.confidence)}% · ${matchSure(top.confidence)}`}
          </Text>
        ) : null}
      </View>
      {top ? (
        <>
          <Text style={styles.phoneName} numberOfLines={2} accessibilityLiveRegion="polite">
            {top.name}
          </Text>
          <Text style={styles.phoneSpeech} numberOfLines={1}>
            {speechLine}
          </Text>
          <OtherMatches matches={others.slice(0, 3)} compact />
        </>
      ) : (
        <Text style={styles.phoneEmpty}>Sign a word to see it here.</Text>
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
    focused: { outlineColor: colors.focusRing, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as object,
    disc: { position: "absolute", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised },
    meta: { fontFamily: fonts.bodyMedium, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.15, color: colors.textTertiary },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    headRight: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 17, color: colors.textSecondary },

    matches: { flex: 1, minHeight: 0, gap: 14, paddingVertical: 20, paddingHorizontal: 22 },
    matchesDense: { gap: 11, paddingVertical: 16, paddingHorizontal: 18 },
    topName: { fontFamily: fonts.heading, color: colors.textPrimary },
    speechRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.well,
    },
    speechText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, color: colors.textSecondary },
    error: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.dangerText },
    others: { gap: 8 },
    otherRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    otherName: { width: 150, fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 19, color: colors.textPrimary },
    otherBar: { flex: 1, minWidth: 0 },
    otherPct: { width: 38, textAlign: "right", fontFamily: fonts.bodySemiBold, fontSize: 12.5, lineHeight: 16, color: colors.textSecondary },
    emptyBlock: { gap: 12, paddingVertical: 4 },
    emptyTitle: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 31, color: colors.textSecondary },
    tips: { gap: 12 },
    tipRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    tipIcon: { backgroundColor: colors.well, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    tipText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14.5, lineHeight: 20, color: colors.textPrimary },
    recDot: { width: 12, height: 12, borderRadius: 6 },
    spacer: { flexGrow: 1, minHeight: 0 },
    actions: { flexDirection: "row", gap: 10 },
    keys: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: colors.textTertiary },

    phoneCard: { paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
    phoneName: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, color: colors.textPrimary },
    phoneSpeech: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
    phoneEmpty: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.textSecondary },
  });
};
