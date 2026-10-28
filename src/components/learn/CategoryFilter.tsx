// Student: narrow Words to one part of speech ("Verbs", "Question words").
// Big tappable pills in a sideways-scrolling row; each says
// how many of its words are learned, as a count (no percentages for kids).
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { kidTypography, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import type { WordCategory } from "../../lib/wordCategories";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;

export type CategoryOption = { key: WordCategory; label: string; count: number; learned: number };

export default function CategoryFilter({
  options,
  value,
  onChange,
  total,
  accentColor,
}: {
  options: CategoryOption[];
  value: WordCategory | null;
  onChange: (c: WordCategory | null) => void;
  /** Word count for "All words". */
  total: number;
  accentColor: string;
}) {
  const { shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (options.length < 2) return null;
  const pill = (key: WordCategory | null, label: string, meta: string, a11y: string) => {
    const active = value === key;
    return (
      <Pressable
        key={key ?? "all"}
        onPress={() => onChange(key)}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [
          styles.pill,
          active ? { backgroundColor: accentColor, borderColor: accentColor } : [styles.pillIdle, shadows.neuRaised("sm")],
          pressed && styles.pressed,
          webCursor,
        ]}
      >
        <Text style={[styles.label, active && styles.onAccent]}>{label}</Text>
        <Text style={[styles.meta, active && styles.onAccent]}>{meta}</Text>
      </Pressable>
    );
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {pill(null, "All words", `${total}`, `All words, ${total}`)}
      {options.map((o) =>
        pill(o.key, o.label, `${o.learned}/${o.count}`, `${o.label}, ${o.learned} of ${o.count} learned`)
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  row: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pillIdle: { backgroundColor: colors.neuBase, borderColor: colors.border },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  label: { ...kidTypography.kidLabel, color: colors.textPrimary },
  meta: { ...kidTypography.kidLabel, fontSize: 14, color: colors.textSecondary },
  onAccent: { color: colors.textOnPrimary },
});
