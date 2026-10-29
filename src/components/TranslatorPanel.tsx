// src/components/TranslatorPanel.tsx
// The single glass instrument panel shared by Letters and Words on desktop —
// design handoff "UI mockups combining design styles"
// (docs/design/design_handoff_translator_instrument/README.md, mocks 4a/4b). Replaces
// the earlier three-stacked-cards-left-column-plus-fixed-camera layout: one
// bounded 1600x706 panel, three vertical bays across the top divided by 1px
// rules, one horizontal control strip along the bottom. Desktop only —
// mobile keeps its existing stacked-card layout untouched (this component
// is never rendered below the desktop breakpoint).
//
// No cell in either region draws its own background/border/shadow — the
// panel is the only surface. Bay 1 (camera) and bay 3 (translation +
// actions) are IDENTICAL in structure between Letters and Words, so they
// live here; only bay 2's content and the three control-strip cells differ
// per mode and are passed in by the caller.
import React, { useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { spacing, typography, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import GlassCard from "./GlassCard";
import { PlayIcon } from "./icons/UiIcons";

// The handoff's numbers (1600x706) are drawn at the 1920x880 mock and are
// literal pixel values, not a fluid layout - on a real laptop screen at
// 100% zoom (much of the target audience: school desks, not 1920-wide
// monitors) that overflows both axes, and since nothing here scrolls, the
// overflow clips the header above it and the control strip below it rather
// than showing a scrollbar. Fix: keep the panel's internal layout at its
// exact spec pixel values (untouched, still "high-fidelity"), but paint the
// whole thing through a CSS transform: scale() sized to whatever space is
// actually available, measured live via onLayout rather than assumed from
// the mock's screen size. Never scales UP past 1:1 on a large monitor.
const PANEL_WIDTH = 1600;
const PANEL_HEIGHT = 706;

type Props = {
  cameraDevice: React.ReactNode;
  bay2: React.ReactNode;
  translationText: string;
  statusLabel: string;
  helperText: string;
  onSpeak: () => void;
  speakDisabled?: boolean;
  actionsRow: React.ReactNode;
  stripCells: [React.ReactNode, React.ReactNode, React.ReactNode];
  /** Shown in place of the translation while it's empty (instead of a bare dash). */
  placeholder?: string;
  /** Replaces the helper paragraph (e.g. a short step-by-step guide). */
  helperContent?: React.ReactNode;
  /** Speak button label/icon override (e.g. "Speaking…" while audio plays). */
  speakLabel?: string;
  speakIcon?: React.ReactNode;
};

export default function TranslatorPanel({
  cameraDevice,
  bay2,
  translationText,
  statusLabel,
  helperText,
  onSpeak,
  speakDisabled = false,
  actionsRow,
  stripCells,
  placeholder,
  helperContent,
  speakLabel,
  speakIcon,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [container, setContainer] = useState({ width: 0, height: 0 });

  function onContainerLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setContainer({ width, height });
  }

  const scale =
    container.width > 0 && container.height > 0
      ? Math.min(1, container.width / PANEL_WIDTH, container.height / PANEL_HEIGHT)
      : 1;

  return (
    <View style={styles.scaleContainer} onLayout={onContainerLayout}>
      <View style={{ width: PANEL_WIDTH * scale, height: PANEL_HEIGHT * scale }}>
        <View style={[styles.scaledPanel, { transform: [{ scale }] } as any]}>
          <GlassCard
            radius={30}
            padding={0}
            dropShadow
            tint="sheer"
            intensity={18}
            contentStyle={styles.panelContent}
            style={styles.panel}
          >
            <View style={styles.topBays}>
              <View style={styles.bay1}>{cameraDevice}</View>
              <View style={styles.rule} />
              <View style={styles.bay2}>{bay2}</View>
              <View style={styles.rule} />
              <View style={styles.bay3}>
                <View style={styles.bay3Header}>
                  <Text style={[typography.meta, styles.eyebrow]}>TRANSLATION</Text>
                  <Text style={styles.statusLabel}>{statusLabel}</Text>
                </View>
                {translationText || !placeholder ? (
                  <Text style={styles.translationText} numberOfLines={1} adjustsFontSizeToFit>
                    {translationText}
                  </Text>
                ) : (
                  <Text style={styles.placeholderText}>{placeholder}</Text>
                )}
                <View style={styles.bay3Rule} />
                {helperContent ?? <Text style={styles.helperText}>{helperText}</Text>}

                <View style={styles.bay3Bottom}>
                  <Pressable
                    onPress={onSpeak}
                    disabled={speakDisabled}
                    accessibilityRole="button"
                    accessibilityLabel="Speak the translation"
                    style={[styles.speakButton, speakDisabled && styles.speakButtonDisabled]}
                  >
                    {speakIcon ?? <PlayIcon size={15} color={colors.textOnAccent} />}
                    <Text style={styles.speakLabel}>{speakLabel ?? "Speak it"}</Text>
                  </Pressable>
                  {actionsRow}
                </View>
              </View>
            </View>

            <View style={styles.stripRule} />
            <View style={styles.strip}>
              {stripCells[0]}
              <View style={styles.stripDivider} />
              {stripCells[1]}
              <View style={styles.stripDivider} />
              {stripCells[2]}
            </View>
          </GlassCard>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  // Fills whatever space the screen gives it (instrumentBody) and centers
  // the scaled-footprint box inside that space.
  scaleContainer: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  // Painted at the fixed spec size regardless of the measured container -
  // transform:scale only affects paint, not layout, so this stays 1600x706
  // for Yoga's purposes while the wrapping Views above (sized to
  // PANEL_WIDTH*scale / PANEL_HEIGHT*scale) reserve exactly its scaled
  // on-screen footprint. transformOrigin '0 0' keeps that footprint's
  // top-left corner pinned to the wrapper's, instead of the default center
  // origin drifting the scaled box out from under its reserved box.
  scaledPanel: {
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    transformOrigin: "0 0",
  } as any,
  panel: {
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
  },
  panelContent: {
    flex: 1,
    flexDirection: "column",
  },
  topBays: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "stretch",
  },
  rule: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.12)" : colors.border,
  },
  bay1: {
    width: 588,
    flexGrow: 0,
    flexShrink: 0,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  bay2: {
    flex: 1,
    minWidth: 0,
    padding: 28,
  },
  bay3: {
    width: 400,
    flexGrow: 0,
    flexShrink: 0,
    padding: 28,
    flexDirection: "column",
  },
  bay3Header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  // Brighter than textTertiary (2.8:1) - labels have to be readable, not
  // decorative, for someone relying entirely on the screen.
  eyebrow: {
    color: colors.textSecondary,
  },
  statusLabel: {
    fontFamily: typography.body.fontFamily,
    fontSize: 11,
    color: colors.textSecondary,
  },
  placeholderText: {
    fontFamily: typography.body.fontFamily,
    fontSize: 20,
    lineHeight: 28,
    color: colors.textSecondary,
    marginTop: 14,
  },
  translationText: {
    ...typography.hero,
    fontSize: 46,
    lineHeight: 51,
    color: colors.textPrimary,
    marginTop: 10,
  },
  bay3Rule: {
    height: 1,
    backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.12)" : colors.border,
    marginTop: 20,
    marginBottom: 20,
  },
  helperText: {
    fontFamily: typography.body.fontFamily,
    fontSize: 12,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  bay3Bottom: {
    marginTop: "auto",
    gap: spacing.md,
  },
  speakButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.accentCoral,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: [{ offsetX: 0, offsetY: 5, blurRadius: 14, color: "rgba(242,178,62,0.3)" }],
  } as any,
  speakButtonDisabled: {
    opacity: 0.45,
  },
  speakLabel: {
    fontFamily: typography.label.fontFamily,
    fontSize: 15,
    color: colors.textOnAccent,
  },
  stripRule: {
    height: 1,
    backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.12)" : colors.border,
  },
  strip: {
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 28,
    gap: 26,
  },
  stripDivider: {
    width: 1,
    height: 74,
    backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.12)" : colors.border,
  },
});
