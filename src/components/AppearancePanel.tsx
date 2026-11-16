// Appearance (design_handoff_classroom_theming §5, frames H4/H6): the mode
// (Light / Dark) and the colour scheme, applied to every
// screen the moment they're picked - no Save, no cross-fade. A popover under
// the header button on desktop/tablet, a bottom sheet on phones.
//
// AppearanceButton is the header button that opens it: mode icon + palette
// icon + "Appearance", or icon-only on phones.
//
// About LCSign (version, updates, error report) sits at the bottom, so it can
// be found from any screen without logging in (AboutSection.tsx).
import React, { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckIcon, CloseIcon, MoonIcon, PaletteIcon, SunIcon } from "./icons/UiIcons";
import { fonts, palettes, radii, SCHEMES, type SchemeName, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme, type ThemeMode } from "../theme/ThemeProvider";
import { focusFromKeyboard } from "../lib/focusVisible";
import AboutSection from "./AboutSection";

const MODES: { key: ThemeMode; label: string; icon: (c: string) => React.ReactNode }[] = [
  { key: "light", label: "Light", icon: (c) => <SunIcon size={15} color={c} /> },
  { key: "dark", label: "Dark", icon: (c) => <MoonIcon size={14} color={c} /> },
];

const schemeLabel = (s: SchemeName) => SCHEMES.find((x) => x.key === s)!.label;

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;

/** Arrow keys move the choice within a radio group (web keyboards). */
function arrowKeys<T>(items: T[], current: T, pick: (v: T) => void) {
  return (e: any) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault?.();
    const i = items.indexOf(current);
    pick(items[(i + step + items.length) % items.length]);
  };
}

/** `compact`: icon only, and the panel is a bottom sheet (phones). `iconOnly`: icon only, popover panel. */
export function AppearanceButton({ compact, iconOnly }: { compact?: boolean; iconOnly?: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const { colors } = theme;
  const modeIcon = theme.name === "dark" ? <MoonIcon size={16} color={colors.textPrimary} /> : <SunIcon size={17} color={colors.textPrimary} />;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Appearance: ${theme.name === "dark" ? "Dark" : "Light"} mode, ${schemeLabel(theme.scheme)} colours`}
        hitSlop={4}
        style={(state: any) => [
          styles.button,
          (compact || iconOnly) && styles.buttonIcon,
          (open || state.pressed) && styles.buttonOn,
          state.focused && focusFromKeyboard() && styles.focused,
        ]}
      >
        {modeIcon}
        {compact || iconOnly ? null : (
          <>
            <PaletteIcon size={17} color={colors.textPrimary} />
            <Text style={styles.buttonText}>Appearance</Text>
          </>
        )}
      </Pressable>
      <AppearancePanel visible={open} onClose={() => setOpen(false)} sheet={compact} />
    </>
  );
}

export default function AppearancePanel({ visible, onClose, sheet }: { visible: boolean; onClose: () => void; sheet?: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { colors } = theme;
  const schemeKeys = SCHEMES.map((s) => s.key);
  const modeKeys = MODES.map((m) => m.key);

  const body = (
    <View style={[styles.card, sheet ? styles.sheet : styles.popover, { maxHeight: height - (sheet ? insets.top + 24 : 96) }]}>
      <ScrollView contentContainerStyle={[styles.content, sheet && { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <View style={styles.headRow}>
          <Text style={styles.title} accessibilityRole="header">
            Appearance
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close Appearance" hitSlop={4} style={(s: any) => [styles.close, s.focused && focusFromKeyboard() && styles.focused]}>
            <CloseIcon size={17} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.group}>
          <Text style={styles.meta}>MODE</Text>
          <View
            style={styles.seg}
            accessibilityRole="radiogroup"
            accessibilityLabel="Mode"
            {...({ onKeyDown: arrowKeys(modeKeys, theme.mode, theme.setMode) } as object)}
          >
            {MODES.map((m) => {
              const on = theme.mode === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => theme.setMode(m.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={m.label}
                  style={(s: any) => [styles.segItem, on && styles.segOn, s.focused && focusFromKeyboard() && styles.focused]}
                >
                  {m.icon(on ? colors.textPrimary : colors.textSecondary)}
                  <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.meta}>COLOUR SCHEME</Text>
          <View
            style={styles.grid}
            accessibilityRole="radiogroup"
            accessibilityLabel="Colour scheme"
            {...({ onKeyDown: arrowKeys(schemeKeys, theme.scheme, theme.setScheme) } as object)}
          >
            {SCHEMES.map((s) => {
              const on = theme.scheme === s.key;
              const p = palettes[s.key][theme.name];
              return (
                <Pressable
                  key={s.key}
                  onPress={() => theme.setScheme(s.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={s.label}
                  style={(st: any) => [styles.scheme, on ? styles.schemeOn : styles.schemeOff, st.focused && focusFromKeyboard() && styles.focused]}
                >
                  {/* A mini screen in that scheme's palette for the current mode. */}
                  <View style={[styles.preview, { backgroundColor: p.background, borderColor: p.border.startsWith("#") ? p.border : p.hairline }]}>
                    <View style={[styles.previewBar, { backgroundColor: p.surfaceRaised }]} />
                    <View style={styles.previewRow}>
                      <View style={[styles.previewPill, { backgroundColor: p.primaryFill }]} />
                      <View style={[styles.previewPill, { backgroundColor: p.accent }]} />
                      <View style={[styles.previewDot, { backgroundColor: p.success }]} />
                    </View>
                  </View>
                  <View style={styles.schemeName}>
                    <Text style={styles.schemeText} numberOfLines={1}>
                      {s.label}
                    </Text>
                    {on ? (
                      <View style={styles.check}>
                        <CheckIcon size={12} color={colors.onPrimary} />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.note}>
          Changes every screen on this device straight away. Ticks, stars and warnings keep the same meaning in every scheme.
        </Text>
        <Pressable onPress={theme.reset} accessibilityRole="button" style={(s: any) => [styles.reset, s.focused && focusFromKeyboard() && styles.focused]}>
          <Text style={styles.resetText}>Reset to default</Text>
        </Pressable>

        <View style={styles.rule} />
        <AboutSection />
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Pressable style={[StyleSheet.absoluteFill, sheet ? styles.scrimSheet : styles.scrim]} onPress={onClose} accessibilityLabel="Close Appearance" />
        {body}
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) => {
  const dark = theme.name === "dark";
  const focused = { outlineColor: colors.focusRing, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as object;
  return StyleSheet.create({
    button: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      borderRadius: radii.pill,
      backgroundColor: colors.surfaceRaised,
      ...theme.shadows.neuRaised("sm"),
      ...webCursor,
    },
    buttonIcon: { width: 44, paddingHorizontal: 0, justifyContent: "center" },
    buttonOn: { backgroundColor: colors.well, ...theme.shadows.neuInset("sm") },
    buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
    focused,

    fill: { flex: 1 },
    scrim: { backgroundColor: "rgba(10,12,16,0.18)" },
    scrimSheet: { backgroundColor: "rgba(10,12,16,0.45)" },
    card: {
      backgroundColor: dark ? colors.surfaceElevated : colors.surfaceRaised,
      borderColor: dark ? "rgba(255,255,255,0.08)" : colors.border,
      borderWidth: 1,
      overflow: "hidden",
      boxShadow: [{ offsetX: 0, offsetY: 18, blurRadius: 44, color: "rgba(0,0,0,0.28)" }],
    } as object,
    popover: { position: "absolute", top: 72, right: 24, width: 420, maxWidth: "92%", borderRadius: 22 } as object,
    sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomWidth: 0 },
    content: { padding: 20, gap: 16 },
    rule: { height: 1, backgroundColor: dark ? "rgba(255,255,255,0.10)" : colors.border },
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
    group: { gap: 8 },
    meta: { fontFamily: fonts.bodyMedium, fontSize: 10.5, letterSpacing: 1.1, color: colors.textTertiary },
    seg: { flexDirection: "row", padding: 4, gap: 2, borderRadius: radii.pill, backgroundColor: colors.well, ...theme.shadows.neuInset("sm") },
    // Two equal halves.
    segItem: {
      flex: 1,
      height: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 10,
      borderRadius: radii.pill,
      ...webCursor,
    },
    segOn: { backgroundColor: colors.surfaceRaised, ...theme.shadows.neuRaised("sm") },
    segText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textSecondary },
    segTextOn: { color: colors.textPrimary },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    scheme: { flexBasis: "47%", flexGrow: 1, gap: 8, padding: 10, borderRadius: radii.md, ...webCursor } as object,
    schemeOn: { borderWidth: 2.5, borderColor: colors.primaryText, backgroundColor: colors.surface },
    schemeOff: { borderWidth: 1, borderColor: dark ? "rgba(255,255,255,0.12)" : colors.border, margin: 1.5 },
    preview: { borderRadius: 10, borderWidth: 1, padding: 8, gap: 6, overflow: "hidden" },
    previewBar: { height: 10, width: "70%", borderRadius: 4 },
    previewRow: { flexDirection: "row", gap: 5, alignItems: "center" },
    previewPill: { width: 30, height: 14, borderRadius: 7 },
    previewDot: { width: 14, height: 14, borderRadius: 7 },
    schemeName: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 20 },
    schemeText: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
    check: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryFill },
    note: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19, color: colors.textSecondary },
    reset: {
      alignSelf: "flex-start",
      height: 38,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: dark ? "rgba(255,255,255,0.16)" : colors.border,
      ...webCursor,
    },
    resetText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary },
  });
};
