// Teacher: booked video calls (0017_call_bookings.sql). A student can only
// call during the time their teacher booked for them; the teacher can still
// call anyone. Two pieces:
//  - BookedCallsCard (Today): today's booked calls across every class, a
//    Call button when one is on now, and "Book a call";
//  - CallScheduleDrawer: every upcoming booking by day (change time,
//    cancel), and the booking form - a student, a day, a length, and a start
//    time where times that would overlap another call are crossed out. The
//    database refuses an overlap anyway (exclusion constraints), so two
//    calls can never be booked for the same time.
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ActionButton, Avatar, ConfirmInline, type NoticeState } from "./ManageKit";
import { CloseButton, RowMenu, SelectPill, SideDrawer } from "./Overlays";
import DatePickerField from "../../components/DatePickerField";
import { useNow } from "../../hooks/useNow";
import { AlertCircleIcon, CalendarIcon, PencilIcon, PlusIcon, TrashIcon, VideoIcon } from "../../components/icons/UiIcons";
import { fonts, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { cancelBooking, saveBooking, type ClassRow } from "../../lib/queries";
import { parseDay, toDay } from "../../lib/teacherInsights";
import {
  CALL_LENGTHS,
  DEFAULT_LENGTH,
  EARLY_MS,
  byDay,
  bookingWords,
  dayWords,
  partOfDay,
  rangeWords,
  startTimes,
  startsInWords,
  timeWords,
  upcomingBookings,
  type CallBooking,
} from "../../lib/callSchedule";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;

const nameOfBooking = (b: CallBooking, fallback?: (id: string) => string) => b.student?.full_name || fallback?.(b.student_id) || "A student";
const isOn = (b: CallBooking, now: number) => Date.parse(b.starts_at) - EARLY_MS <= now && now < Date.parse(b.ends_at);

// ── Today card ──────────────────────────────────────────────────────────

export function BookedCallsCard({
  bookings,
  missing,
  error,
  onRetry,
  klass,
  classes,
  nameOf,
  onBook,
  onOpenAll,
  onCall,
  onOpenClass,
}: {
  bookings: CallBooking[];
  /** 0017 isn't applied yet: booking is off and calls work as before. */
  missing: boolean;
  /** The last load failed (the list may be out of date). */
  error?: boolean;
  onRetry?: () => void;
  klass: ClassRow;
  classes: ClassRow[];
  nameOf: (id: string) => string;
  onBook: () => void;
  onOpenAll: () => void;
  onCall: (s: { id: string; name: string }) => void;
  onOpenClass: (classId: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const now = useNow();
  const upcoming = upcomingBookings(bookings, now);
  const today = upcoming.filter((b) => dayWords(Date.parse(b.starts_at), now) === "Today");
  const next = today.length ? null : upcoming[0] ?? null;
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "another class";

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} accessibilityRole="header">
          Booked calls
        </Text>
        {!missing && upcoming.length ? (
          <Pressable onPress={onOpenAll} accessibilityRole="button" accessibilityLabel="All booked calls" style={webCursor} hitSlop={8}>
            <Text style={styles.link}>All {upcoming.length}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityRole="alert">
          <Text style={[styles.empty, styles.flex]}>Couldn't load your booked calls.</Text>
          {onRetry ? (
            <Pressable onPress={onRetry} accessibilityRole="button" style={webCursor} hitSlop={8}>
              <Text style={styles.link}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {missing ? (
        <Text style={styles.empty}>Booking calls needs the 0017 database update. Until then, students can call you at any time.</Text>
      ) : (
        <>
          {today.length === 0 ? (
            <Text style={styles.empty}>
              {next
                ? `No calls booked today. Next: ${nameOfBooking(next, nameOf)}, ${bookingWords(next, now)}.`
                : "No calls booked. Students can only call you at a time you book for them."}
            </Text>
          ) : (
            today.map((b) => {
              const name = nameOfBooking(b, nameOf);
              const here = b.class_id === klass.id;
              const soon = startsInWords(b, now);
              return (
                <View key={b.id} style={styles.personRow}>
                  <Avatar name={name} color={colors.accentCoralText} size={38} />
                  <View style={styles.flex}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.sub} numberOfLines={2}>
                      {rangeWords(b)}
                      {soon && soon !== "Now" ? ` · ${soon}` : ""}
                      {here ? "" : ` · ${className(b.class_id)}`}
                    </Text>
                  </View>
                  {isOn(b, now) ? (
                    here ? (
                      <ActionButton label="Call" variant="primary" size="sm" icon={(c) => <VideoIcon size={15} color={c} />} onPress={() => onCall({ id: b.student_id, name })} />
                    ) : (
                      // Rings reach only the selected class's students.
                      <ActionButton label="Open class" size="sm" onPress={() => onOpenClass(b.class_id)} />
                    )
                  ) : null}
                </View>
              );
            })
          )}
          <View style={styles.cardFoot}>
            <ActionButton label="Book a call" size="sm" icon={(c) => <PlusIcon size={14} color={c} />} onPress={onBook} />
          </View>
        </>
      )}
    </View>
  );
}

// ── drawer: the list and the form ───────────────────────────────────────

export type ScheduleState =
  | { mode: "list" }
  /** `booking`: move that booking. `studentId`: start with that student. `back`: Cancel returns to the list. */
  | { mode: "form"; booking?: CallBooking | null; studentId?: string | null; back?: boolean };

type DrawerProps = {
  state: ScheduleState | null;
  onState: (next: ScheduleState | null) => void;
  teacherId: string;
  klass: ClassRow;
  classes: ClassRow[];
  /** The selected class's students - who can be booked. */
  students: { id: string; full_name: string }[];
  bookings: CallBooking[];
  missing: boolean;
  nameOf: (id: string) => string;
  /** Reload the bookings after a change. */
  onChanged: () => Promise<void>;
  setNotice: (n: NoticeState) => void;
};

export function CallScheduleDrawer(props: DrawerProps) {
  const { state, onState } = props;
  return (
    <SideDrawer visible={!!state} onClose={() => onState(null)} width={620} tint="frosted" bare>
      {state?.mode === "list" ? <ScheduleList {...props} /> : null}
      {state?.mode === "form" ? (
        <BookingForm key={state.booking?.id ?? `new-${state.studentId ?? ""}`} {...props} form={state} />
      ) : null}
    </SideDrawer>
  );
}

function ScheduleList({ onState, classes, bookings, missing, nameOf, onChanged, setNotice }: DrawerProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const now = useNow();
  const days = byDay(upcomingBookings(bookings, now), now);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const manyClasses = classes.length > 1;

  const cancel = async (b: CallBooking) => {
    setBusy(true);
    const { error } = await cancelBooking(b.id);
    setBusy(false);
    setConfirmId(null);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return;
    }
    setNotice({ kind: "success", message: `Cancelled the call with ${nameOfBooking(b, nameOf)}, ${bookingWords(b, now)}.` });
    await onChanged();
  };

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.formPad}>
        <View style={styles.formHead}>
          <Text style={styles.formTitle} accessibilityRole="header">
            Booked calls
          </Text>
          <CloseButton onPress={() => onState(null)} onFrosted />
        </View>
        <Text style={styles.formMuted}>
          Students can only call you during the time you book for them, from 5 minutes before. You can still call any student at any time. Two calls can't be booked
          for the same time{manyClasses ? ", across all your classes" : ""}.
        </Text>
        {missing ? (
          <Text style={styles.problemText}>Booking calls needs the 0017 database update. Ask your admin to apply it.</Text>
        ) : (
          <>
            <View style={styles.listTop}>
              <ActionButton label="Book a call" variant="primary" size="md" icon={(c) => <PlusIcon size={15} color={c} />} onPress={() => onState({ mode: "form", back: true })} />
            </View>
            {days.length === 0 ? <Text style={styles.formMuted}>No calls booked yet.</Text> : null}
            {days.map((d) => (
              <View key={d.key} style={styles.dayBlock}>
                <Text style={styles.dayTitle}>{d.label.toUpperCase()}</Text>
                {d.items.map((b) => {
                  const name = nameOfBooking(b, nameOf);
                  return (
                    <View key={b.id}>
                      <View style={styles.bookingRow}>
                        <View style={styles.timeCol}>
                          <Text style={styles.timeText}>{timeWords(Date.parse(b.starts_at))}</Text>
                          <Text style={styles.timeSub}>{Math.round((Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60_000)} min</Text>
                        </View>
                        <Avatar name={name} color={colors.accentCoralText} size={36} />
                        <View style={styles.flex}>
                          <Text style={styles.rowName} numberOfLines={1}>
                            {name}
                          </Text>
                          <Text style={styles.rowSub} numberOfLines={1}>
                            {rangeWords(b)}
                            {manyClasses ? ` · ${classes.find((c) => c.id === b.class_id)?.name ?? ""}` : ""}
                          </Text>
                        </View>
                        <RowMenu
                          label={`More for the call with ${name}`}
                          items={[
                            {
                              key: "move",
                              label: "Change time",
                              icon: (c) => <PencilIcon size={17} color={c} />,
                              // Moving keeps the booking's class and student; only the time changes.
                              onPress: () => onState({ mode: "form", booking: b, back: true }),
                            },
                            { key: "cancel", label: "Cancel call…", destructive: true, icon: (c) => <TrashIcon size={17} color={c} />, onPress: () => setConfirmId(b.id) },
                          ]}
                        />
                      </View>
                      {confirmId === b.id ? (
                        <ConfirmInline
                          message={`Cancel the call with ${name}, ${bookingWords(b, now)}?`}
                          confirmLabel="Cancel call"
                          cancelLabel="Keep it"
                          busy={busy}
                          onCancel={() => setConfirmId(null)}
                          onConfirm={() => void cancel(b)}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function BookingForm({ form, onState, teacherId, klass, students, bookings, nameOf, onChanged, setNotice }: DrawerProps & { form: Extract<ScheduleState, { mode: "form" }> }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const now = useNow();
  const moving = form.booking ?? null;
  const initialLength = moving ? Math.round((Date.parse(moving.ends_at) - Date.parse(moving.starts_at)) / 60_000) : DEFAULT_LENGTH;
  const [studentId, setStudentId] = useState<string>(moving?.student_id ?? form.studentId ?? students[0]?.id ?? "");
  const [day, setDay] = useState<string>(toDay(moving ? new Date(moving.starts_at) : new Date()));
  const [length, setLength] = useState<number>(initialLength);
  const [start, setStart] = useState<number | null>(moving ? Date.parse(moving.starts_at) : null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const dayDate = parseDay(day);
  const times = useMemo(
    () => (dayDate ? startTimes(dayDate, length, bookings, now, moving?.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, length, bookings, Math.floor(now / 60_000), moving?.id]
  );
  const open = times.filter((x) => !x.past);
  const chosen = start !== null ? times.find((x) => x.at === start) ?? null : null;
  // A change of day or length can make the chosen time taken, past or gone.
  const startOk = !!chosen && !chosen.past && !chosen.clash;
  useEffect(() => {
    if (start !== null && !startOk) setStart(null);
  }, [start, startOk]);

  const student = students.find((s) => s.id === studentId) ?? null;
  const studentName = student?.full_name ?? (moving ? nameOfBooking(moving, nameOf) : "");
  const canSave = !!studentId && startOk && !saving;
  const close = () => onState(form.back ? { mode: "list" } : null);

  const save = async () => {
    if (!canSave || !chosen) return;
    setSaving(true);
    setProblem(null);
    const starts = new Date(chosen.at);
    const ends = new Date(chosen.at + length * 60_000);
    const { error } = await saveBooking(
      { class_id: moving?.class_id ?? klass.id, teacher_id: teacherId, student_id: studentId, starts_at: starts.toISOString(), ends_at: ends.toISOString() },
      moving?.id
    );
    setSaving(false);
    if (error) {
      // Someone else's booking may have just taken the time: refresh, so it shows as taken.
      setProblem(error.message);
      void onChanged();
      return;
    }
    const words = bookingWords({ starts_at: starts.toISOString(), ends_at: ends.toISOString() }, Date.now());
    setNotice({ kind: "success", message: `${moving ? "Moved" : "Booked"} a call with ${studentName}: ${words}.` });
    await onChanged();
    close();
  };

  const pill = (label: string, active: boolean, onPress: () => void, a11y?: string) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={a11y ?? label}
      style={[styles.fPill, active ? styles.fPillOn : styles.fPillOff, webCursor]}
    >
      <Text style={[styles.fPillText, active && styles.fPillTextOn]}>{label}</Text>
    </Pressable>
  );

  const parts = (["Morning", "Afternoon", "Evening"] as const)
    .map((p) => ({ part: p, items: open.filter((x) => partOfDay(x.at) === p) }))
    .filter((p) => p.items.length);

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.flex} contentContainerStyle={[styles.form, styles.formPad]} keyboardShouldPersistTaps="handled">
        <View style={styles.formHead}>
          <Text style={styles.formTitle} accessibilityRole="header">
            {moving ? "Change call time" : "Book a call"}
          </Text>
          <CloseButton onPress={() => onState(null)} onFrosted />
        </View>

        <View>
          <Text style={styles.label}>Student</Text>
          {moving ? (
            <Text style={styles.fixed}>{studentName}</Text>
          ) : students.length ? (
            <SelectPill label="Student" value={studentId} options={students.map((s) => ({ key: s.id, label: s.full_name }))} onChange={setStudentId} />
          ) : (
            <Text style={styles.formMuted}>No students in {klass.name} yet.</Text>
          )}
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.dayCol}>
            <Text style={styles.label}>Day</Text>
            <DatePickerField value={day} onChange={setDay} label="Call day" placeholder="Pick a day" />
          </View>
          <View style={styles.lengthCol}>
            <Text style={styles.label}>Length</Text>
            <View style={styles.pillRow} accessibilityRole="radiogroup">
              {CALL_LENGTHS.map((m) => pill(`${m} min`, length === m, () => setLength(m), `${m} minutes`))}
            </View>
          </View>
        </View>

        <View style={styles.gap10}>
          <Text style={styles.label}>Start time</Text>
          {!dayDate ? (
            <Text style={styles.formMuted}>Pick a day first.</Text>
          ) : parts.length === 0 ? (
            <Text style={styles.formMuted}>No times left {dayWords(dayDate.getTime(), now) === "Today" ? "today" : "that day"}. Pick another day.</Text>
          ) : (
            parts.map(({ part, items }) => (
              <View key={part} style={styles.partBlock}>
                <Text style={styles.partTitle}>{part}</Text>
                <View style={styles.pillRow} accessibilityRole="radiogroup">
                  {items.map((x) => {
                    const active = x.at === start;
                    const taken = !!x.clash;
                    return (
                      <Pressable
                        key={x.at}
                        onPress={() => setStart(x.at)}
                        disabled={taken}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active, disabled: taken }}
                        accessibilityLabel={taken ? `${x.label}, taken: call with ${nameOfBooking(x.clash!, nameOf)}` : x.label}
                        style={[styles.timePill, active ? styles.fPillOn : taken ? styles.timeTaken : styles.fPillOff, !taken && webCursor]}
                      >
                        <Text style={[styles.timePillText, active && styles.fPillTextOn, taken && styles.timeTakenText]}>{x.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}
          {parts.length ? <Text style={styles.formMuted}>Crossed out: you already have a call then.</Text> : null}
        </View>
      </ScrollView>

      <View style={styles.formFootPinned}>
        <View style={styles.flex}>
          {problem ? (
            <View style={styles.problem} accessibilityLiveRegion="polite">
              <AlertCircleIcon size={14} color={colors.textOnFrosted} />
              <Text style={[styles.problemText, styles.flex]}>{problem}</Text>
            </View>
          ) : chosen && startOk ? (
            <View style={styles.problem}>
              <CalendarIcon size={15} color={colors.textOnFrosted} />
              <Text style={[styles.summary, styles.flex]} numberOfLines={2}>
                {studentName} · {bookingWords({ starts_at: new Date(chosen.at).toISOString(), ends_at: new Date(chosen.at + length * 60_000).toISOString() }, now)}
              </Text>
            </View>
          ) : (
            <Text style={styles.problemText}>{studentId ? "Pick a start time." : "Pick a student."}</Text>
          )}
        </View>
        <ActionButton label="Cancel" size="lg" variant="ghost" onFrosted style={styles.outlineDark} onPress={close} disabled={saving} />
        <ActionButton label={moving ? "Save time" : "Book call"} size="lg" variant="primary" onPress={() => void save()} loading={saving} disabled={!canSave && !saving} />
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    gap10: { gap: 10 },
    // Today card (same look as TeacherToday's cards)
    card: {
      padding: 20,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.name === "dark" ? "rgba(255,255,255,0.1)" : colors.border,
      backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.05)" : colors.surface,
    },
    cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 },
    cardTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary },
    cardFoot: { flexDirection: "row", marginTop: 12 },
    errorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
    link: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.primaryTealText },
    empty: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnGlass },
    personRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
    personName: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
    sub: { fontFamily: fonts.body, fontSize: 13, color: colors.textOnGlass },
    // frosted drawer (textOnFrosted only)
    form: { gap: 20 },
    formPad: { padding: 28, paddingBottom: 32, gap: 18 },
    formHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    formTitle: { fontFamily: fonts.heading, fontSize: 25, lineHeight: 31, color: colors.textOnFrosted },
    formMuted: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnFrosted },
    label: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textOnFrosted, marginBottom: 7 },
    fixed: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.textOnFrosted },
    fieldRow: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
    dayCol: { width: 250 },
    // On its own row under the day unless there's room for all four pills.
    lengthCol: { flex: 1, minWidth: 330 },
    pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
    fPill: { minHeight: 40, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    fPillOn: { backgroundColor: colors.actionPrimaryFill, borderColor: colors.actionPrimaryFill },
    fPillOff: { borderColor: "rgba(30,31,38,0.35)", backgroundColor: "transparent" },
    fPillText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textOnFrosted },
    fPillTextOn: { color: "#FFFFFF" },
    partBlock: { gap: 8 },
    partTitle: { fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 1, color: colors.textOnFrosted, textTransform: "uppercase" },
    timePill: { minHeight: 40, minWidth: 92, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    timePillText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textOnFrosted },
    timeTaken: { borderColor: "rgba(30,31,38,0.14)", borderStyle: "dashed", backgroundColor: "rgba(30,31,38,0.06)" },
    timeTakenText: { textDecorationLine: "line-through", opacity: 0.55 },
    problem: { flexDirection: "row", alignItems: "center", gap: 8 },
    problemText: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 18, color: colors.textOnFrosted },
    summary: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, lineHeight: 19, color: colors.textOnFrosted },
    formFootPinned: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 12,
      paddingHorizontal: 28,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: "rgba(30,31,38,0.14)",
    },
    outlineDark: { borderWidth: 1.5, borderColor: "rgba(30,31,38,0.4)" },
    // list
    listTop: { flexDirection: "row" },
    dayBlock: { gap: 4 },
    dayTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, letterSpacing: 1.2, color: colors.textOnFrosted, marginTop: 6, marginBottom: 4 },
    bookingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: "rgba(30,31,38,0.07)",
      marginBottom: 6,
    },
    timeCol: { width: 74 },
    timeText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textOnFrosted },
    timeSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnFrosted },
    rowName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textOnFrosted },
    rowSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textOnFrosted },
  });
