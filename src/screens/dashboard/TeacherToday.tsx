// Today (design T1, T10, T11a): what needs the teacher, most urgent first,
// one action per row - missed calls, students under 25%, signs the class is
// stuck on, modules due within a week or overdue, students waiting for a
// class - beside who is online now (the only Call buttons outside the
// roster), the class average, where the class is per group and the last
// saved call notes. Every row is computed from data the dashboard already
// loads (lib/teacherInsights.ts needsYou).
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import ProgressBar from "../../components/ProgressBar";
import { ActionButton, Avatar } from "./ManageKit";
import { PresenceDot, formatWhen, presenceLabel } from "./CallHistory";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  FlagIcon,
  InboxIcon,
  PhoneIcon,
  PlusIcon,
  UsersIcon,
  VideoIcon,
} from "../../components/icons/UiIcons";
import { colors, fonts, radii } from "../../theme/theme";
import { neuInset, neuRaised } from "../../theme/shadows";
import type { CallNoteRow, ClassRow } from "../../lib/queries";
import type { PresenceStatus } from "../../lib/callSignaling";
import { dayWords, firstNameOf, nameList, soonGroupsText, type NeedsYouItem, type classGroupAverages } from "../../lib/teacherInsights";
import { getGroup } from "../../lib/curriculum";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;

type Missed = Extract<NeedsYouItem, { kind: "missed" }>;
type Stuck = Extract<NeedsYouItem, { kind: "stuck" }>;

type Props = {
  klass: ClassRow;
  phone: boolean;
  compact: boolean;
  items: NeedsYouItem[];
  classSize: number;
  classAverage: number;
  groups: ReturnType<typeof classGroupAverages>;
  online: { id: string; name: string; status: PresenceStatus }[];
  presenceOf: (id: string) => PresenceStatus | undefined;
  lastNote: CallNoteRow | null;
  nameOf: (id: string) => string;
  onCallBack: (item: Missed) => void;
  onDismissMissed: (ids: string[]) => void;
  onSeeUnder25: () => void;
  onMakeModule: (item: Stuck) => void;
  onOpenModule: (moduleId: string) => void;
  onAddWaiting: (ids: string[]) => Promise<void>;
  onCall: (s: { id: string; name: string }) => void;
  onAllNotes: () => void;
  onGoStudents: () => void;
};

export default function TeacherToday(props: Props) {
  const { klass, phone, compact, items, classAverage } = props;
  const now = new Date();
  const dateLine = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();

  if (phone) return <TodayPhone {...props} />;

  return (
    <View>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>{dateLine}</Text>
          <Text style={[styles.title, compact && styles.titleCompact]} accessibilityRole="header">
            Today in {klass.name}
          </Text>
        </View>
        <AverageTile value={classAverage} compact={compact} />
      </View>
      <View style={styles.cols}>
        <View style={styles.main}>
          {items.length ? <NeedsCard {...props} /> : <AllCaughtUp onGoStudents={props.onGoStudents} />}
        </View>
        <View style={[styles.side, { width: compact ? 300 : 356 }]}>
          <OnlineCard {...props} />
          <WhereCard groups={props.groups} compact={compact} />
          {!compact ? <NotesCard {...props} /> : null}
        </View>
      </View>
    </View>
  );
}

function AverageTile({ value, compact }: { value: number; compact: boolean }) {
  return (
    <View style={[styles.avgTile, neuInset("sm")]} accessibilityLabel={`Class average ${Math.round(value * 100)}%, over the learning plan, the same figure students see`}>
      <View>
        <Text style={styles.avgValue}>{Math.round(value * 100)}%</Text>
        {!compact ? <Text style={styles.avgLabel}>Class average</Text> : null}
      </View>
      <View style={styles.flex}>
        <Bar value={value} />
        <Text style={styles.avgCaption}>{compact ? "Class average" : "Over the learning plan · same figure students see"}</Text>
      </View>
    </View>
  );
}

/** A thin track with a violet fill (green when full). Decorative: the number beside it carries the value. */
export function Bar({ value, height = 7, tone }: { value: number; height?: number; tone?: "violet" | "green" | "gold" | "red" }) {
  const v = Math.max(0, Math.min(1, value));
  const fill =
    tone === "green" || (tone === undefined && v >= 1)
      ? colors.success
      : tone === "gold"
        ? colors.accentCoral
        : tone === "red"
          ? colors.needsPractice
          : colors.primaryTeal;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {v > 0 ? <View style={{ width: `${Math.max(v * 100, 2)}%`, height, borderRadius: height / 2, backgroundColor: fill }} /> : null}
    </View>
  );
}

function IconTile({ kind }: { kind: NeedsYouItem["kind"] }) {
  const icon =
    kind === "missed" ? (
      <PhoneIcon size={19} color={colors.accentCoral} />
    ) : kind === "under25" ? (
      <UsersIcon size={19} color={colors.needsPracticeText} />
    ) : kind === "stuck" ? (
      <FlagIcon size={19} color={colors.accentCoral} />
    ) : kind === "due" ? (
      <CalendarIcon size={19} color={colors.primaryTealText} />
    ) : (
      <InboxIcon size={19} color={colors.successText} />
    );
  return <View style={[styles.iconTile, neuInset("sm")]}>{icon}</View>;
}

// ── Needs you ───────────────────────────────────────────────────────────

function NeedsCard(props: Props) {
  const { items } = props;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} accessibilityRole="header">
          Needs you <Text style={styles.cardCount}>· {items.length}</Text>
        </Text>
        <Text style={styles.cardNote}>Most urgent first</Text>
      </View>
      {items.map((item, i) => (
        <NeedsRow key={item.key} item={item} first={i === 0} {...props} />
      ))}
    </View>
  );
}

function NeedsRow({ item, first, ...p }: { item: NeedsYouItem; first: boolean } & Props) {
  const [busy, setBusy] = useState(false);
  let title: React.ReactNode;
  let sub: React.ReactNode = null;
  let actions: React.ReactNode = null;
  let label = "";

  if (item.kind === "missed") {
    const status = p.presenceOf(item.callerId);
    title = `You missed a call from ${item.name}${item.ids.length > 1 ? ` (${item.ids.length})` : ""}`;
    sub = (
      <View style={styles.subRow}>
        <Text style={styles.sub}>Called {formatWhen(item.at)} ·</Text>
        <PresenceDot status={status} />
      </View>
    );
    label = `${title}. Called ${formatWhen(item.at)}. ${presenceLabel(status)}`;
    actions = (
      <>
        <ActionButton label="Call back" variant="primary" size="md" icon={(c) => <VideoIcon size={16} color={c} />} onPress={() => p.onCallBack(item)} />
        <ActionButton label="Dismiss" size="md" variant="ghost" style={styles.outline} onPress={() => p.onDismissMissed(item.ids)} />
      </>
    );
  } else if (item.kind === "under25") {
    const n = item.students.length;
    title = `${n} student${n === 1 ? " is" : "s are"} under 25%`;
    const shown = item.students.slice(0, 3).map((s) => `${s.name} ${Math.round(s.overall * 100)}%`);
    const text = shown.join(" · ") + (n > 3 ? ` · and ${n - 3} more` : "");
    sub = <Text style={styles.sub} numberOfLines={1}>{text}</Text>;
    label = `${title}. ${text}`;
    actions = <ActionButton label="See them" size="md" onPress={p.onSeeUnder25} />;
  } else if (item.kind === "stuck") {
    const g = getGroup(item.language, item.group);
    const noun = item.group === "letters" ? (item.signs.length === 1 ? "letter" : "letters") : item.group === "numbers" ? "numbers" : item.signs.length === 1 ? "word" : "words";
    title = `The class is stuck on ${item.signs.length} ${noun}`;
    const top = item.signs[0];
    sub = (
      <View style={styles.subRow}>
        {item.signs.map((s) => (
          <View key={s.sign} style={[styles.signChip, neuRaised("sm")]}>
            <Text style={styles.signChipText}>{s.sign}</Text>
          </View>
        ))}
        <Text style={styles.sub} numberOfLines={1}>
          {top.sign}: {top.learned} of {p.classSize} learned · {top.attempts} tries
        </Text>
      </View>
    );
    label = `${title} in ${g.label}: ${item.signs.map((s) => s.sign).join(", ")}. ${top.sign}: ${top.learned} of ${p.classSize} learned, ${top.attempts} tries`;
    actions = <ActionButton label="Make a module" size="md" onPress={() => p.onMakeModule(item)} />;
  } else if (item.kind === "due") {
    const day = dayWords(item.date);
    const overdue = item.days < 0;
    title = overdue ? `“${item.title}” was due ${day.short}` : `“${item.title}” is due ${day.long}`;
    const when = overdue ? "Overdue" : item.days === 0 ? "Today" : item.days === 1 ? "Tomorrow" : `In ${item.days} days`;
    const text = `${when} · ${item.finished} of ${p.classSize} students finished · ${item.signs} sign${item.signs === 1 ? "" : "s"}`;
    sub = <Text style={[styles.sub, overdue && { color: colors.needsPracticeText }]}>{text}</Text>;
    label = `${title}. ${text}`;
    actions = <ActionButton label="Open module" size="md" onPress={() => p.onOpenModule(item.moduleId)} />;
  } else {
    const n = item.students.length;
    title = `${n} student${n === 1 ? " is" : "s are"} waiting for a class`;
    const text = `${nameList(item.students.map((s) => s.name))} signed up and ${n === 1 ? "has" : "have"} no class yet`;
    sub = <Text style={styles.sub} numberOfLines={2}>{text}</Text>;
    label = `${title}. ${text}`;
    actions = (
      <ActionButton
        label={n === 1 ? `Add ${firstNameOf(item.students[0].name)}` : n === 2 ? "Add both" : `Add all ${n}`}
        size="md"
        loading={busy}
        icon={(c) => <PlusIcon size={14} color={c} />}
        onPress={async () => {
          setBusy(true);
          await p.onAddWaiting(item.students.map((s) => s.id));
          setBusy(false);
        }}
      />
    );
  }

  return (
    <View style={[styles.row, !first && styles.rowRule]}>
      <IconTile kind={item.kind} />
      <View style={styles.rowText} accessible accessibilityLabel={label}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        {sub}
      </View>
      <View style={styles.rowActions}>{actions}</View>
    </View>
  );
}

function AllCaughtUp({ onGoStudents }: { onGoStudents: () => void }) {
  return (
    <View style={[styles.card, styles.caughtUp]}>
      <View style={styles.caughtIcon}>
        <CheckIcon size={28} color={colors.successText} strokeWidth={2.6} />
      </View>
      <Text style={styles.caughtTitle}>All caught up</Text>
      <Text style={styles.caughtBody}>No missed calls, nobody waiting for a class and no modules due this week.</Text>
      <ActionButton label="Go to Students" size="md" onPress={onGoStudents} />
    </View>
  );
}

// ── side column ─────────────────────────────────────────────────────────

function OnlineCard({ online, classSize, onCall, phone }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} accessibilityRole="header">
          Online now
        </Text>
        <Text style={styles.cardNote}>
          {online.length}
          {phone ? "" : ` of ${classSize}`}
        </Text>
      </View>
      {online.length === 0 ? (
        <Text style={styles.empty}>Nobody in this class is online right now.</Text>
      ) : (
        online.map((s) => (
          <View key={s.id} style={styles.personRow}>
            <Avatar name={s.name} color={colors.accentCoral} size={38} />
            <View style={styles.flex}>
              <Text style={styles.personName} numberOfLines={1}>
                {s.name}
              </Text>
              <PresenceDot status={s.status} />
            </View>
            {s.status === "busy" ? (
              <Text style={styles.busy}>Busy</Text>
            ) : phone ? (
              <Pressable
                onPress={() => onCall(s)}
                accessibilityRole="button"
                accessibilityLabel={`Call ${s.name}`}
                style={[styles.roundCall, webCursor]}
              >
                <VideoIcon size={20} color="#FFFFFF" />
              </Pressable>
            ) : (
              <ActionButton label="Call" variant="primary" size="sm" icon={(c) => <VideoIcon size={15} color={c} />} onPress={() => onCall(s)} />
            )}
          </View>
        ))
      )}
    </View>
  );
}

function WhereCard({ groups, compact }: { groups: Props["groups"]; compact?: boolean }) {
  return (
    <View style={styles.card}>
      <Text style={[styles.cardTitle, styles.mb]} accessibilityRole="header">
        Where the class is
      </Text>
      <View style={styles.whereList}>
        {groups.map((g) => (
          <View key={g.key} accessible accessibilityLabel={`${g.label}: ${Math.round(g.value * 100)}% learned on average`}>
            <View style={styles.whereRow}>
              <Text style={styles.whereLabel}>{g.label}</Text>
              <Text style={styles.wherePct}>{Math.round(g.value * 100)}%</Text>
            </View>
            <Bar value={g.value} tone="violet" />
          </View>
        ))}
      </View>
      {!compact ? <Text style={[styles.empty, styles.mt]}>{soonGroupsText()}: soon. No model yet.</Text> : null}
    </View>
  );
}

function NotesCard({ lastNote, nameOf, onAllNotes }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} accessibilityRole="header">
          Last call notes
        </Text>
        {lastNote ? (
          <Pressable onPress={onAllNotes} accessibilityRole="button" style={webCursor} hitSlop={8}>
            <Text style={styles.link}>All notes</Text>
          </Pressable>
        ) : null}
      </View>
      {lastNote ? (
        <Pressable
          onPress={onAllNotes}
          accessibilityRole="button"
          accessibilityLabel={`Call notes with ${nameOf(lastNote.student_id)}, ${noteLine(lastNote)}`}
          style={({ hovered }: any) => [styles.noteRow, hovered && styles.hover, webCursor]}
        >
          <Avatar name={nameOf(lastNote.student_id)} color={colors.accentCoral} size={34} />
          <View style={styles.flex}>
            <Text style={styles.personName} numberOfLines={1}>
              {nameOf(lastNote.student_id)} · {clock(lastNote.duration_seconds)}
            </Text>
            <Text style={styles.sub}>{noteLine(lastNote)}</Text>
          </View>
          <View style={styles.chevron}>
            <ChevronDownIcon size={14} color={colors.textOnGlass} />
          </View>
        </Pressable>
      ) : (
        <Text style={styles.empty}>Saved notes from your calls appear here. Save them at the end of a call.</Text>
      )}
    </View>
  );
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function noteLine(n: CallNoteRow): string {
  const date = new Date(n.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const got = n.practice.filter((p) => p.passed).length;
  return n.practice.length ? `${date} · practised ${n.practice.length}, got ${got}` : `${date} · no practice`;
}

// ── phone (T11a) ────────────────────────────────────────────────────────

function TodayPhone(props: Props) {
  const { items } = props;
  const missed = items.filter((i): i is Missed => i.kind === "missed");
  const under = items.find((i) => i.kind === "under25") as Extract<NeedsYouItem, { kind: "under25" }> | undefined;
  const rest = items.filter((i) => i.kind !== "missed" && i.kind !== "under25");
  return (
    <View style={styles.phoneStack}>
      <Text style={styles.phoneTitle} accessibilityRole="header">
        Today
      </Text>
      {missed.map((m) => {
        const status = props.presenceOf(m.callerId);
        return (
          <View key={m.key} style={[styles.card, styles.missedCard]}>
            <View style={styles.missedHead}>
              <PhoneIcon size={20} color={colors.accentCoral} />
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{m.name} called you</Text>
                <Text style={styles.sub}>
                  {formatWhen(m.at).replace(/^today/, "Today")} · {presenceLabel(status)}
                  {status ? "" : " now"}
                </Text>
              </View>
            </View>
            <View style={styles.missedActions}>
              <ActionButton label="Call back" variant="primary" size="lg" icon={(c) => <VideoIcon size={17} color={c} />} onPress={() => props.onCallBack(m)} />
              <ActionButton label="Dismiss" size="lg" variant="ghost" style={styles.outline} onPress={() => props.onDismissMissed(m.ids)} />
            </View>
          </View>
        );
      })}
      <OnlineCard {...props} />
      {under ? (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              Needs help
            </Text>
            <Pressable onPress={props.onSeeUnder25} accessibilityRole="button" style={webCursor} hitSlop={8}>
              <Text style={styles.link}>See all {under.students.length}</Text>
            </Pressable>
          </View>
          {under.students.slice(0, 3).map((s) => (
            <View key={s.id} style={styles.personRow}>
              <Avatar name={s.name} color={colors.accentCoral} size={38} />
              <Text style={[styles.personName, styles.flex]} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={styles.lowPct}>{Math.round(s.overall * 100)}%</Text>
            </View>
          ))}
        </View>
      ) : null}
      {rest.length ? <NeedsCard {...props} items={rest} /> : missed.length || under ? null : <AllCaughtUp onGoStudents={props.onGoStudents} />}
      <WhereCard groups={props.groups} />
      <NotesCard {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  mb: { marginBottom: 12 },
  mt: { marginTop: 14 },
  head: { flexDirection: "row", alignItems: "flex-end", gap: 24, marginBottom: 22 },
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 11.5, letterSpacing: 1.3, color: colors.textOnGlass, marginBottom: 4 },
  title: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: colors.textPrimary },
  titleCompact: { fontSize: 26, lineHeight: 32 },
  avgTile: { flexDirection: "row", alignItems: "center", gap: 18, width: 340, paddingVertical: 14, paddingHorizontal: 18, borderRadius: radii.md, backgroundColor: colors.neuWell },
  avgValue: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 30, color: colors.textPrimary },
  avgLabel: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textOnGlass },
  avgCaption: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.textOnGlass, marginTop: 6 },
  track: { width: "100%", backgroundColor: colors.neuWell, overflow: "hidden" },
  cols: { flexDirection: "row", gap: 22, alignItems: "flex-start" },
  main: { flex: 1, minWidth: 0 },
  side: { gap: 18 },
  card: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 },
  cardTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary },
  cardCount: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textOnGlass },
  cardNote: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textOnGlass },
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14 },
  rowRule: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  iconTile: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuWell },
  rowText: { flex: 1, minWidth: 0, gap: 5 },
  rowTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: colors.textPrimary },
  sub: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnGlass },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  outline: { borderWidth: 1.5, borderColor: colors.border },
  signChip: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  signChipText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textPrimary },
  caughtUp: { alignItems: "center", paddingVertical: 36, gap: 10 },
  caughtIcon: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: colors.success, alignItems: "center", justifyContent: "center" },
  caughtTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.textPrimary },
  caughtBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textOnGlass, textAlign: "center", maxWidth: 360, marginBottom: 6 },
  empty: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnGlass },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  personName: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
  busy: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textOnGlass },
  roundCall: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.actionPrimaryFill },
  whereList: { gap: 14 },
  whereRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  whereLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  wherePct: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  link: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.primaryTealText },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, marginHorizontal: -10, borderRadius: 14 },
  hover: { backgroundColor: "rgba(255,255,255,0.05)" },
  chevron: { transform: [{ rotate: "-90deg" }] },
  phoneStack: { gap: 16 },
  phoneTitle: { fontFamily: fonts.heading, fontSize: 26, color: colors.textPrimary },
  missedCard: { borderColor: "rgba(242,178,62,0.55)", gap: 14 },
  missedHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  missedActions: { flexDirection: "row", gap: 10 },
  lowPct: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.needsPracticeText },
});
