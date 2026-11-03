// The Translator's Settings and Help (design_handoff_translator_fingerspelling
// §3, frame F3): what used to sit in a permanent bottom strip (commit speed,
// the hold meter, "affects accuracy") now opens from a Settings button, in
// plain words. A popover under the button on desktop/tablet, a bottom sheet
// on phones (RN Modal both ways, like AppearancePanel). Choices are saved on
// the device.
//
// - How long to hold a letter: the existing hold presets with plain names.
// - Signing hand: Left / Right, with the reason.
// - Show on the camera: hand points and speed (fps) - display only.
// Help (the "?" button) shows the three tips and the keyboard keys in the
// same popover style.
import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SegmentedToggle from "./SegmentedToggle";
import { HandednessToggle, type Handedness } from "./HandednessPicker";
import { HOLD_PRESETS, holdSeconds } from "./HoldDurationControl";
import { CheckIcon, ClockIcon, CloseIcon, HandIcon } from "./icons/UiIcons";
import { fonts, radii, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { focusFromKeyboard } from "../lib/focusVisible";

// ---------- display prefs (hand points, fps chip) ----------

export type TranslatorDisplay = { points: boolean; fps: boolean };
const DISPLAY_KEY = "kamustasign:translatorDisplay";
const DEFAULT_DISPLAY: TranslatorDisplay = { points: true, fps: false };
const displayListeners = new Set<(v: TranslatorDisplay) => void>();
let displayNow: TranslatorDisplay = DEFAULT_DISPLAY;

/** Shared by every mounted caller, saved on the device. */
export function useTranslatorDisplay(): [TranslatorDisplay, (patch: Partial<TranslatorDisplay>) => void] {
  const [value, setValue] = useState<TranslatorDisplay>(displayNow);
  useEffect(() => {
    let cancelled = false;
    displayListeners.add(setValue);
    AsyncStorage.getItem(DISPLAY_KEY)
      .then((saved) => {
        if (cancelled || !saved) return;
        const parsed = JSON.parse(saved);
        displayNow = {
          points: typeof parsed?.points === "boolean" ? parsed.points : DEFAULT_DISPLAY.points,
          fps: typeof parsed?.fps === "boolean" ? parsed.fps : DEFAULT_DISPLAY.fps,
        };
        setValue(displayNow);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      displayListeners.delete(setValue);
    };
  }, []);
  const update = (patch: Partial<TranslatorDisplay>) => {
    displayNow = { ...displayNow, ...patch };
    displayListeners.forEach((l) => l(displayNow));
    AsyncStorage.setItem(DISPLAY_KEY, JSON.stringify(displayNow)).catch(() => {});
  };
  return [value, update];
}

// ---------- the three fingerspelling tips (empty word card + Help) ----------

export const KEYS_HINT = "Keys: Backspace deletes · Esc clears · Enter speaks";

export function FingerspellTips({ iconSize = 34, textSize = 14.5 }: { iconSize?: number; textSize?: number }) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tips = [
    { icon: <HandIcon size={16} color={colors.primaryText} />, text: "Sign one letter at a time." },
    { icon: <ClockIcon size={16} color={colors.accentCoralText} />, text: "Hold still until the ring fills. Then the letter is added." },
    { icon: <CheckIcon size={16} color={colors.successText} strokeWidth={2.6} />, text: "To repeat a letter, lower your hand first." },
  ];
  return (
    <View style={styles.tips}>
      {tips.map((t, i) => (
        <View key={i} style={styles.tipRow}>
          <View style={[styles.tipIcon, { width: iconSize, height: iconSize, borderRadius: iconSize / 2 }, shadows.neuInset("sm")]}>{t.icon}</View>
          <Text style={[styles.tipText, { fontSize: textSize, lineHeight: Math.round(textSize * 1.4) }]}>{t.text}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------- popover shell ----------

type PopoverProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Phone: a bottom sheet instead of a popover. */
  sheet?: boolean;
  /** Popover: distance from the top of the window (it sits under its button). */
  top?: number;
  children: React.ReactNode;
};

export function TranslatorPopover({ visible, onClose, title, sheet, top = 132, children }: PopoverProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxHeight = sheet ? height * 0.86 : Math.max(240, height - top - 24);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Pressable
          style={[StyleSheet.absoluteFill, sheet ? styles.scrimSheet : styles.scrim]}
          onPress={onClose}
          accessibilityLabel={`Close ${title}`}
        />
        <View
          style={[styles.card, sheet ? [styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }] : [styles.popover, { top }], { maxHeight }]}
          accessibilityViewIsModal
        >
          <View style={styles.headRow}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title}`}
              hitSlop={4}
              style={(s: any) => [styles.close, s.focused && focusFromKeyboard() && styles.focused]}
            >
              <CloseIcon size={17} color={colors.textPrimary} />
            </Pressable>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------- pieces ----------

function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.group}>
      <Text style={styles.meta}>{title.toUpperCase()}</Text>
      {children}
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { shadows } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={(s: any) => [styles.switchRow, s.focused && focusFromKeyboard() && styles.focused]}
    >
      <Text style={styles.switchLabel}>{label}</Text>
      <View style={[styles.switch, value ? styles.switchOn : [styles.switchOff, shadows.neuInset("sm")]]}>
        <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
      </View>
    </Pressable>
  );
}

// ---------- Settings ----------

type SettingsProps = {
  visible: boolean;
  onClose: () => void;
  sheet?: boolean;
  top?: number;
  /** Letters / Numbers: the hold time. */
  holdMs?: number;
  onHoldMs?: (ms: number) => void;
  handedness?: Handedness;
  onHandedness?: (h: Handedness) => void;
  display?: TranslatorDisplay;
  onDisplay?: (patch: Partial<TranslatorDisplay>) => void;
  /** Words (phone): Auto / Manual. */
  captureMode?: "auto" | "manual";
  onCaptureMode?: (m: "auto" | "manual") => void;
  /** Phone: the "Speak in" language row (its trigger opens the language list). */
  speechLanguage?: React.ReactNode;
  /** Phone: Clear word lives here. */
  onClearWord?: () => void;
  /** Phone: how it works. */
  onHelp?: () => void;
};

export function TranslatorSettings({
  visible,
  onClose,
  sheet,
  top,
  holdMs,
  onHoldMs,
  handedness,
  onHandedness,
  display,
  onDisplay,
  captureMode,
  onCaptureMode,
  speechLanguage,
  onClearWord,
  onHelp,
}: SettingsProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <TranslatorPopover visible={visible} onClose={onClose} title="Settings" sheet={sheet} top={top}>
      {holdMs != null && onHoldMs ? (
        <Section title="How long to hold a letter" help="Letters added by mistake? Choose Careful. Signing fast? Choose Fast.">
          <SegmentedToggle
            kind="radio"
            size="md"
            stretch
            itemPadding={8}
            accessibilityLabel="How long to hold a letter"
            value={String(holdMs)}
            onChange={(k) => onHoldMs(Number(k))}
            options={HOLD_PRESETS.map((p) => ({ key: String(p.ms), label: p.label, sub: sheet ? undefined : holdSeconds(p.ms) }))}
          />
        </Section>
      ) : null}
      {captureMode && onCaptureMode ? (
        <Section title="Reading a sign" help="Auto reads each sign when your hands settle. Manual: press Record, sign, then press Stop.">
          <SegmentedToggle
            kind="radio"
            size="md"
            stretch
            accessibilityLabel="Reading a sign"
            value={captureMode}
            onChange={onCaptureMode}
            options={[
              { key: "auto", label: "Auto" },
              { key: "manual", label: "Manual" },
            ]}
          />
        </Section>
      ) : null}
      {handedness && onHandedness ? (
        <Section title="Signing hand" help="The reader was trained on right hands. Left flips the picture for you.">
          <HandednessToggle value={handedness} onChange={onHandedness} size="md" stretch />
        </Section>
      ) : null}
      {speechLanguage ? <Section title="Speak in">{speechLanguage}</Section> : null}
      {display && onDisplay ? (
        <Section title="Show on the camera">
          <SwitchRow label="Hand points" value={display.points} onChange={(v) => onDisplay({ points: v })} />
          <SwitchRow label="Speed (fps)" value={display.fps} onChange={(v) => onDisplay({ fps: v })} />
        </Section>
      ) : null}
      {onClearWord || onHelp ? (
        <View style={styles.footRow}>
          {onClearWord ? (
            <Pressable
              onPress={() => {
                onClearWord();
                onClose();
              }}
              accessibilityRole="button"
              style={(s: any) => [styles.ghost, s.focused && focusFromKeyboard() && styles.focused]}
            >
              <Text style={styles.ghostText}>Clear word</Text>
            </Pressable>
          ) : null}
          {onHelp ? (
            <Pressable onPress={onHelp} accessibilityRole="button" style={(s: any) => [styles.ghost, s.focused && focusFromKeyboard() && styles.focused]}>
              <Text style={styles.ghostText}>How it works</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </TranslatorPopover>
  );
}

// ---------- Help ----------

export function TranslatorHelp({
  visible,
  onClose,
  sheet,
  top,
  what,
  captureMode,
}: {
  visible: boolean;
  onClose: () => void;
  sheet?: boolean;
  top?: number;
  what: "letters" | "numbers" | "words";
  captureMode?: "auto" | "manual";
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <TranslatorPopover visible={visible} onClose={onClose} title="How it works" sheet={sheet} top={top}>
      {what === "words" ? (
        <>
          <Text style={styles.helpBody}>
            {captureMode === "manual"
              ? "Press Record, sign one whole word, then press Stop. The top match is shown and spoken."
              : "Sign one whole word, then lower your hands. The word is read when your hands settle, then shown and spoken."}
          </Text>
          <Text style={styles.help}>Switch between Auto and Manual beside the tabs (on a phone: in Settings).</Text>
        </>
      ) : (
        <>
          <FingerspellTips />
          <Text style={styles.help}>
            Letters and Numbers read different alphabets. Some digits look like letters (O and 0, V and 2), so pick the one you are signing.
          </Text>
          {Platform.OS === "web" && !sheet ? <Text style={styles.keys}>{KEYS_HINT}</Text> : null}
        </>
      )}
    </TranslatorPopover>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) => {
  const dark = theme.name === "dark";
  const focused = { outlineColor: colors.focusRing, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as object;
  const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;
  return StyleSheet.create({
    fill: { flex: 1 },
    scrim: { backgroundColor: "rgba(10,12,16,0.25)" },
    scrimSheet: { backgroundColor: "rgba(10,12,16,0.45)" },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderColor: dark ? "rgba(255,255,255,0.08)" : colors.border,
      borderWidth: 1,
      padding: 20,
      gap: 14,
      boxShadow: [{ offsetX: 0, offsetY: 18, blurRadius: 44, color: dark ? "rgba(0,0,0,0.4)" : "rgba(27,31,42,0.18)" }],
    } as object,
    popover: { position: "absolute", right: 24, width: 420, maxWidth: "92%", borderRadius: 22 } as object,
    sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomWidth: 0, paddingHorizontal: 18 },
    headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontFamily: fonts.heading, fontSize: 21, lineHeight: 26, color: colors.textPrimary },
    close: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: dark ? "rgba(255,255,255,0.16)" : colors.border,
      ...webCursor,
    },
    focused,
    scroll: { flexGrow: 0 },
    body: { gap: 18, paddingBottom: 2 },
    group: { gap: 8 },
    meta: { fontFamily: fonts.bodyMedium, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.1, color: colors.textTertiary },
    help: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19, color: colors.textSecondary },
    helpBody: { fontFamily: fonts.bodyMedium, fontSize: 14.5, lineHeight: 21, color: colors.textPrimary },
    keys: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19, color: colors.textTertiary },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36, borderRadius: 8, ...webCursor },
    switchLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
    switch: { width: 46, height: 28, borderRadius: 14 },
    switchOn: { backgroundColor: colors.primaryFill },
    switchOff: { backgroundColor: colors.well },
    knob: { position: "absolute", top: 3, width: 22, height: 22, borderRadius: 11 },
    knobOn: { right: 3, backgroundColor: "#FFFFFF" },
    knobOff: { left: 3, backgroundColor: colors.textTertiary },
    footRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
    ghost: {
      height: 44,
      paddingHorizontal: 18,
      borderRadius: radii.pill,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: dark ? "rgba(255,255,255,0.16)" : colors.border,
      ...webCursor,
    },
    ghostText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
    tips: { gap: 12 },
    tipRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    tipIcon: { backgroundColor: colors.well, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    tipText: { flex: 1, fontFamily: fonts.bodyMedium, color: colors.textPrimary },
  });
};
