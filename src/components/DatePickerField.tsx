// A date field that shows the date in words ("Sun, Nov 1, 2026") and opens
// a month grid (design T6). The value stays a "YYYY-MM-DD" string or "" -
// the same due_date the database stores. Days are 40x40 targets; on the web
// the arrow keys move the highlighted day (Page Up / Down change month),
// Enter picks it and Esc closes. "Clear date" means no due date.
import React, { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ChevronLeftIcon, ArrowRightIcon } from "./icons/UiIcons";
import { fonts, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { monthGrid, parseDay, toDay } from "../lib/teacherInsights";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const CARD_W = 316;
const CARD_H = 392;

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Read aloud with the date ("Due date, Sun, Nov 1, 2026"). */
  label: string;
  placeholder?: string;
};

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export default function DatePickerField({ value, onChange, label, placeholder = "No due date" }: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const selected = value ? parseDay(value) : null;
  const ref = useRef<View>(null);
  const { width: W, height: H } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cursor, setCursor] = useState<Date>(() => selected ?? new Date());
  const today = new Date();

  const open = () => {
    setCursor(selected ?? new Date());
    ref.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  };
  const close = () => setAnchor(null);
  const pick = (d: Date) => {
    onChange(toDay(d));
    close();
  };

  // Arrow keys move the highlighted day while the calendar is open (web).
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  useEffect(() => {
    if (!anchor || Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const c = cursorRef.current;
      const moves: Record<string, () => Date> = {
        ArrowLeft: () => addDays(c, -1),
        ArrowRight: () => addDays(c, 1),
        ArrowUp: () => addDays(c, -7),
        ArrowDown: () => addDays(c, 7),
        PageUp: () => new Date(c.getFullYear(), c.getMonth() - 1, Math.min(c.getDate(), 28)),
        PageDown: () => new Date(c.getFullYear(), c.getMonth() + 1, Math.min(c.getDate(), 28)),
      };
      if (moves[e.key]) {
        e.preventDefault();
        setCursor(moves[e.key]());
      } else if (e.key === "Enter") {
        e.preventDefault();
        onChange(toDay(c));
        setAnchor(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, onChange]);

  const words = selected ? selected.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : null;
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const weeks = monthGrid(y, m);
  const pos = anchor
    ? {
        left: Math.max(8, Math.min(W - CARD_W - 8, anchor.x + anchor.w - CARD_W)),
        top: anchor.y + anchor.h + 8 + CARD_H < H ? anchor.y + anchor.h + 8 : Math.max(8, anchor.y - CARD_H - 8),
      }
    : null;

  return (
    <>
      <Pressable
        ref={ref}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${words ?? placeholder}. Choose a date`}
        style={({ focused }: any) => [styles.field, (anchor || focused) && styles.fieldOpen, webCursor]}
      >
        <Text style={[styles.fieldText, !words && styles.placeholder]} numberOfLines={1}>
          {words ?? placeholder}
        </Text>
        <CalendarGlyph />
      </Pressable>
      <Modal visible={!!anchor} transparent animationType="none" onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close calendar" />
        {pos ? (
          <View style={[styles.card, shadows.neuRaised("md"), pos]} accessibilityViewIsModal>
            <View style={styles.head}>
              <Pressable
                onPress={() => setCursor(new Date(y, m - 1, 1))}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                style={[styles.nav, shadows.neuRaised("sm"), webCursor]}
              >
                <ChevronLeftIcon size={16} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.month} accessibilityRole="header">
                {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </Text>
              <Pressable
                onPress={() => setCursor(new Date(y, m + 1, 1))}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                style={[styles.nav, shadows.neuRaised("sm"), webCursor]}
              >
                <ArrowRightIcon size={15} color={colors.textPrimary} />
              </Pressable>
            </View>
            <View style={styles.week}>
              {WEEKDAYS.map((d) => (
                <Text key={d} style={styles.weekday}>
                  {d}
                </Text>
              ))}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.week}>
                {week.map((day, di) => {
                  if (!day) return <View key={di} style={styles.day} />;
                  const date = new Date(y, m, day);
                  const isSel = !!selected && sameDay(date, selected);
                  const isCursor = sameDay(date, cursor);
                  const isToday = sameDay(date, today);
                  return (
                    <Pressable
                      key={di}
                      onPress={() => pick(date)}
                      accessibilityRole="button"
                      accessibilityLabel={date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                      accessibilityState={{ selected: isSel }}
                      style={({ hovered }: any) => [
                        styles.day,
                        isSel && styles.daySelected,
                        !isSel && isToday && styles.dayToday,
                        !isSel && isCursor && styles.dayCursor,
                        hovered && !isSel && styles.dayHover,
                        webCursor,
                      ]}
                    >
                      <Text style={[styles.dayText, isSel && styles.dayTextSelected]}>{day}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View style={styles.foot}>
              <Pressable
                onPress={() => {
                  onChange("");
                  close();
                }}
                accessibilityRole="button"
                style={webCursor}
                hitSlop={8}
              >
                <Text style={styles.clear}>Clear date</Text>
              </Pressable>
              <Text style={styles.today}>Today is {today.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</Text>
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

/** A small calendar outline, drawn from Views (the icon set has a clock, not a calendar). */
function CalendarGlyph() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.glyph} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.glyphRings}>
        <View style={styles.glyphRing} />
        <View style={styles.glyphRing} />
      </View>
      <View style={styles.glyphBar} />
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: colors.surfaceElevated,
  },
  fieldOpen: { borderColor: colors.primaryTealLight },
  fieldText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  placeholder: { color: colors.textTertiary },
  card: {
    position: "absolute",
    width: CARD_W,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.name === "dark" ? "rgba(255,255,255,0.1)" : colors.border,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  nav: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  month: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textPrimary },
  week: { flexDirection: "row", justifyContent: "space-between" },
  weekday: { width: 40, textAlign: "center", fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textOnGlass, paddingVertical: 6 },
  day: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginVertical: 1 },
  dayHover: { backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.06)" : colors.surfacePressed },
  daySelected: { backgroundColor: colors.actionPrimaryFill },
  dayToday: { borderWidth: 1.5, borderColor: colors.primaryTealLight },
  dayCursor: { borderWidth: 2, borderColor: colors.focusRing },
  dayText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  dayTextSelected: { color: "#FFFFFF", fontFamily: fonts.bodySemiBold },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingHorizontal: 4 },
  clear: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.primaryTealText },
  today: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnGlass },
  glyph: { width: 18, height: 17, borderRadius: 4, borderWidth: 1.6, borderColor: colors.textOnGlass },
  glyphRings: { position: "absolute", top: -4, left: 3, right: 3, flexDirection: "row", justifyContent: "space-between" },
  glyphRing: { width: 1.6, height: 5, borderRadius: 1, backgroundColor: colors.textOnGlass },
  glyphBar: { marginTop: 4, height: 1.6, backgroundColor: colors.textOnGlass },
});
