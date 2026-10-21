// Student: the modules their teacher made for the class, as big tappable
// cards above the curriculum tabs. Picking one narrows the sign grid to that
// module's signs (in the teacher's order); "All signs" goes back to the full
// curriculum. Counts are signs learned (isMastered), like every child-facing
// figure - no percentages.
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CheckIcon, ClockIcon } from "../icons/UiIcons";
import { colors, fonts, kidTypography, radii } from "../../theme/theme";
import { neuRaised } from "../../theme/shadows";
import { getGroup, getLanguage, isMastered } from "../../lib/curriculum";
import { moduleSigns, type ModuleRow } from "../../lib/queries";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;

export type ProgressLookup = (language: string, group: string, sign: string) => { passes: number } | undefined;

function dueLabel(date: string | null): { text: string; late: boolean } | null {
  if (!date) return null;
  const d = new Date(`${date}T23:59:59`);
  if (Number.isNaN(d.getTime())) return null;
  const late = d.getTime() < Date.now();
  const text = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { text: late ? `Was due ${text}` : `Due ${text}`, late };
}

export default function ModuleStrip({
  modules,
  activeId,
  onSelect,
  lookup,
  accentColor,
}: {
  modules: ModuleRow[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  lookup: ProgressLookup;
  accentColor: string;
}) {
  if (modules.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>From your teacher</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Card active={activeId === null} onPress={() => onSelect(null)} accentColor={accentColor} label="All signs">
          <Text style={[styles.title, activeId === null && styles.titleActive]}>All signs</Text>
          <Text style={[styles.meta, activeId === null && styles.metaActive]}>Everything you can practise</Text>
        </Card>
        {modules.map((m) => {
          const signs = moduleSigns(m);
          const learned = signs.filter((s) => isMastered(lookup(m.language, m.sign_group, s))).length;
          const done = signs.length > 0 && learned === signs.length;
          const due = done ? null : dueLabel(m.due_date);
          const active = activeId === m.id;
          return (
            <Card
              key={m.id}
              active={active}
              onPress={() => onSelect(m.id)}
              accentColor={accentColor}
              label={`${m.title}, ${learned} of ${signs.length} learned`}
            >
              <View style={styles.titleRow}>
                <Text style={[styles.title, active && styles.titleActive]} numberOfLines={1}>
                  {m.title}
                </Text>
                {done ? (
                  <View style={styles.doneBadge}>
                    <CheckIcon size={11} color={colors.textOnFrosted} strokeWidth={3.6} />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.meta, active && styles.metaActive]}>
                {getLanguage(m.language).label} {getGroup(m.language, m.sign_group).label} · {learned} of {signs.length} learned
              </Text>
              {due ? (
                <View style={styles.dueRow}>
                  <ClockIcon size={12} color={due.late ? colors.needsPractice : active ? colors.textOnPrimary : colors.textSecondary} />
                  <Text style={[styles.meta, active && styles.metaActive, due.late && styles.late]}>{due.text}</Text>
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Card({
  active,
  onPress,
  accentColor,
  label,
  children,
}: {
  active: boolean;
  onPress: () => void;
  accentColor: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.card,
        active ? { backgroundColor: accentColor, borderColor: accentColor } : [styles.cardIdle, neuRaised("sm")],
        pressed && styles.pressed,
        webCursor,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  heading: { ...kidTypography.kidBody, fontFamily: fonts.bodySemiBold, color: colors.textSecondary, marginBottom: 8 },
  row: { gap: 12, paddingVertical: 4, paddingHorizontal: 2 },
  card: { width: 210, borderRadius: radii.lg, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  cardIdle: { backgroundColor: colors.neuBase, borderColor: colors.border },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 22, color: colors.textPrimary, flexShrink: 1 },
  titleActive: { color: colors.textOnPrimary },
  meta: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  metaActive: { color: colors.textOnPrimary },
  late: { color: colors.needsPractice },
  dueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  doneBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
});
