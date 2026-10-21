// Standing target-language picker for the translate step: set once, every
// sign recognized after that goes straight to that language (see
// docs/FEATURE_REQUEST_translate_tts.md's "confirmed requirement" section) - this
// is deliberately not a per-recognition control.
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ALL_LANGUAGES, PINNED_LANGUAGES, findLanguage } from "../lib/languages";
import { colors, fonts, radii, spacing } from "../theme/theme";
import { shadow } from "../theme/shadows";

const STORAGE_KEY = "kamustasign:targetLanguage";
const DEFAULT_LANGUAGE_CODE = "en";

// Loads the persisted target language on mount and keeps AsyncStorage in
// sync with subsequent changes - shared so every screen with a picker reads/
// writes the same standing preference instead of each keeping its own copy.
export function useSelectedLanguage(): [string, (code: string) => void] {
  const [code, setCode] = useState(DEFAULT_LANGUAGE_CODE);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (!cancelled && saved && findLanguage(saved)) setCode(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (next: string) => {
    setCode(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  return [code, update];
}

type Props = {
  value: string;
  onChange: (code: string) => void;
  accentColor?: string;
  // Lets a caller (e.g. the translator header, which draws its own
  // neumorphic pill) supply a custom trigger instead of the default
  // light-chrome pill below — the modal/search/pinned-languages behavior
  // stays identical either way.
  renderTrigger?: (props: { open: () => void; current: { code: string; name: string } }) => React.ReactNode;
};

export default function LanguagePicker({ value, onChange, accentColor = colors.primaryTeal, renderTrigger }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const current = findLanguage(value) ?? findLanguage(DEFAULT_LANGUAGE_CODE)!;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_LANGUAGES;
    return ALL_LANGUAGES.filter((l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase() === q);
  }, [query]);

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ open: () => setOpen(true), current })
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          style={[styles.trigger, { borderColor: accentColor + "55" }]}
          accessibilityRole="button"
          accessibilityLabel={`Translate to ${current.name}`}
        >
          <Text style={styles.triggerLabel}>Translate to</Text>
          <Text style={[styles.triggerValue, { color: accentColor }]}>{current.name}</Text>
        </Pressable>
      )}

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, shadow("lg")]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Translate to</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search languages..."
              placeholderTextColor={colors.textSecondary}
              style={styles.search}
              autoFocus={Platform_isWeb()}
            />

            {!query && (
              <View style={styles.pinnedRow}>
                {PINNED_LANGUAGES.map((l) => (
                  <Pressable
                    key={l.code}
                    onPress={() => {
                      onChange(l.code);
                      setOpen(false);
                      setQuery("");
                    }}
                    style={[
                      styles.pinnedPill,
                      { borderColor: accentColor },
                      l.code === value && { backgroundColor: accentColor },
                    ]}
                  >
                    <Text style={[styles.pinnedPillText, l.code === value && { color: colors.textOnPrimary }]}>
                      {l.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {filtered.map((l) => (
                <Pressable
                  key={l.code}
                  onPress={() => {
                    onChange(l.code);
                    setOpen(false);
                    setQuery("");
                  }}
                  style={[styles.row, l.code === value && { backgroundColor: accentColor + "1A" }]}
                >
                  <Text style={[styles.rowText, l.code === value && { color: accentColor, fontFamily: fonts.bodySemiBold }]}>
                    {l.name}
                  </Text>
                </Pressable>
              ))}
              {filtered.length === 0 && <Text style={styles.emptyText}>No languages match "{query}".</Text>}
            </ScrollView>

            <Pressable onPress={() => setOpen(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Platform_isWeb() {
  // Local helper instead of importing Platform just for one autoFocus check -
  // avoids autofocus-stealing-keyboard-focus footguns on native.
  return typeof document !== "undefined";
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1.5,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.surface,
  },
  triggerLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  triggerValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
  },
  sheetTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.xs + 4,
    paddingHorizontal: spacing.sm + 4,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  pinnedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: spacing.sm,
  },
  pinnedPill: {
    borderWidth: 1.5,
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  pinnedPillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  list: {
    maxHeight: 320,
  },
  row: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
  },
  rowText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textPrimary,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: "italic",
    paddingVertical: spacing.md,
    textAlign: "center",
  },
  closeBtn: {
    marginTop: spacing.sm,
    alignSelf: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  closeBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
