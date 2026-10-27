// Students (design T2, T10, T11b): the roster as a sortable table of 52px
// rows that still works at 40 students - search, filters with live counts
// (All / Online / Under 25% / Not started), Name · Status · Overall · one
// column per group with a model. Call is a filled button only for students
// who are online; offline it's a dim icon that still rings (they'll see a
// missed call), and it's disabled while they're on another call. Remove
// lives in the ⋯ menu, away from Call. Tapping a row opens the student.
// On a phone: 64px rows with the full name, and a Call button only when
// the student is online.
import React, { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import SegmentedToggle from "../../components/SegmentedToggle";
import { ActionButton, Avatar, ChoicePills, ConfirmInline, SearchField } from "./ManageKit";
import { RowMenu } from "./Overlays";
import { PresenceDot } from "./CallHistory";
import { Bar } from "./TeacherToday";
import { canCopy } from "./TeacherRail";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  EyeIcon,
  PlusIcon,
  PrinterIcon,
  TrashIcon,
  VideoIcon,
} from "../../components/icons/UiIcons";
import { colors, fonts, radii } from "../../theme/theme";
import { neuInset, neuRaised } from "../../theme/shadows";
import { computeOverall, groupKey, planSigns, type ClassPlan } from "../../lib/curriculum";
import {
  availableGroups,
  firstNameOf,
  matchesFilter,
  rosterCounts,
  soonGroupsText,
  sortRoster,
  type RosterFilter,
  type RosterSortKey,
} from "../../lib/teacherInsights";
import type { ClassRow, StudentProgressSummary } from "../../lib/queries";
import type { PresenceStatus } from "../../lib/callSignaling";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;

type Props = {
  klass: ClassRow;
  /** `mastered` already counted under the class plan. */
  students: StudentProgressSummary[];
  plan: ClassPlan;
  presence: Record<string, PresenceStatus>;
  loading: boolean;
  filter: RosterFilter;
  onFilter: (f: RosterFilter) => void;
  /** The table needs ~880px; narrower gets the phone list. */
  table: boolean;
  onOpen: (id: string) => void;
  onCall: (s: { id: string; name: string }) => void;
  onRemove: (s: StudentProgressSummary) => Promise<boolean>;
  onInvite: () => void;
  onPrint: () => void;
  onCopyCode: () => void;
};

const FILTER_LABEL: Record<RosterFilter, string> = { all: "All", online: "Online", under25: "Under 25%", notStarted: "Not started" };

export default function TeacherStudents(props: Props) {
  const { klass, students, plan, presence, loading, filter, onFilter, table } = props;
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<RosterSortKey>("overall");
  const [ascending, setAscending] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const groups = availableGroups();

  const counts = useMemo(() => rosterCounts(students, plan, presence), [students, plan, presence]);
  const q = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      sortRoster(students, sortKey, ascending, plan, presence).filter(
        (s) => matchesFilter(filter, computeOverall(s.mastered, plan), presence[s.id]) && (!q || s.full_name.toLowerCase().includes(q))
      ),
    [students, sortKey, ascending, plan, presence, filter, q]
  );

  const sortBy = (key: RosterSortKey) => {
    if (key === sortKey) setAscending((a) => !a);
    else {
      setSortKey(key);
      setAscending(true);
    }
  };

  const remove = async (s: StudentProgressSummary) => {
    setRemoving(true);
    const ok = await props.onRemove(s);
    setRemoving(false);
    if (ok) setConfirmId(null);
  };

  if (!loading && students.length === 0) return <StudentsEmpty {...props} />;

  const filterLabel = (f: RosterFilter) =>
    f === "all" || f === "online" ? `${FILTER_LABEL[f]} ${counts[f]}` : `${FILTER_LABEL[f]} · ${counts[f]}`;

  if (!table) {
    return (
      <View style={styles.phoneStack}>
        <View style={styles.phoneHead}>
          <Text style={styles.phoneTitle} accessibilityRole="header">
            Students · {students.length}
          </Text>
          <Pressable
            onPress={props.onInvite}
            accessibilityRole="button"
            accessibilityLabel="Invite students"
            style={[styles.roundBtn, neuRaised("sm"), webCursor]}
          >
            <PlusIcon size={18} color={colors.textPrimary} />
          </Pressable>
        </View>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search students" />
        <ChoicePills
          options={(Object.keys(FILTER_LABEL) as RosterFilter[]).map((f) => ({ key: f, label: f === "all" ? "All" : filterLabel(f) }))}
          value={filter}
          onChange={onFilter}
        />
        <View style={[styles.card, styles.phoneList]}>
          {loading && students.length === 0 ? <Skeleton rows={6} /> : null}
          {rows.length === 0 && !loading ? <Text style={styles.empty}>No students match.</Text> : null}
          {rows.map((s, i) => {
            const status = presence[s.id];
            const overall = computeOverall(s.mastered, plan);
            return (
              <Pressable
                key={s.id}
                onPress={() => props.onOpen(s.id)}
                accessibilityRole="button"
                accessibilityLabel={`${s.full_name}, ${statusWord(status)}, ${Math.round(overall * 100)}% overall. Open details`}
                style={({ pressed }) => [styles.phoneRow, i > 0 && styles.rule, pressed && styles.pressed]}
              >
                <Avatar name={s.full_name} color={colors.accentCoral} size={40} />
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>
                    {s.full_name || "(no name)"}
                  </Text>
                  <View style={styles.subRow}>
                    <PresenceDot status={status} />
                    <Text style={styles.sub}>{Math.round(overall * 100)}%</Text>
                  </View>
                </View>
                {status === "available" ? (
                  <Pressable
                    onPress={() => props.onCall({ id: s.id, name: s.full_name })}
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${s.full_name}`}
                    style={[styles.roundCall, webCursor]}
                    hitSlop={4}
                  >
                    <VideoIcon size={20} color="#FFFFFF" />
                  </Pressable>
                ) : (
                  <View style={styles.chev}>
                    <ChevronDownIcon size={15} color={colors.textOnGlass} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  const header = (key: RosterSortKey | null, label: string, style: object, align: "left" | "right" = "left") => {
    if (!key) return <Text style={[styles.th, style, align === "right" && styles.right]}>{label}</Text>;
    const active = key === sortKey;
    const how = key === "name" ? (ascending ? "A to Z" : "Z to A") : key === "status" ? (ascending ? "online first" : "offline first") : ascending ? "lowest first" : "highest first";
    return (
      <Pressable
        onPress={() => sortBy(key)}
        accessibilityRole="button"
        accessibilityLabel={active ? `${label}, sorted ${how}` : `Sort by ${label}`}
        style={[styles.thBtn, style, webCursor]}
        hitSlop={6}
      >
        <Text style={[styles.th, active && styles.thActive]}>{label}</Text>
        {active ? ascending ? <ChevronUpIcon size={12} color={colors.textPrimary} /> : <ChevronDownIcon size={12} color={colors.textPrimary} /> : null}
      </Pressable>
    );
  };

  return (
    <View>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Students
          </Text>
          <Text style={styles.lede}>
            {students.length} in {klass.name}. Lowest overall first, so whoever needs help is at the top.
          </Text>
        </View>
        <View style={styles.headActions}>
          {Platform.OS === "web" ? (
            <ActionButton label="Print class code" size="lg" icon={(c) => <PrinterIcon size={17} color={c} />} onPress={props.onPrint} />
          ) : null}
          <ActionButton label="Invite students" variant="primary" size="lg" icon={(c) => <PlusIcon size={16} color={c} />} onPress={props.onInvite} />
        </View>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.search}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search students" />
        </View>
        <SegmentedToggle
          options={(Object.keys(FILTER_LABEL) as RosterFilter[]).map((f) => ({ key: f, label: filterLabel(f) }))}
          value={filter}
          onChange={onFilter}
        />
        <View style={styles.flex} />
        <Text style={styles.soon}>Numbers and FSL Letters: soon</Text>
      </View>

      <View style={[styles.card, styles.tableCard]}>
        <View style={styles.thead}>
          {header("name", "Name", styles.colName)}
          {header("status", "Status", styles.colStatus)}
          {header("overall", "Overall", styles.colOverall)}
          {groups.map((g) => (
            <React.Fragment key={g.key}>{header(g.key, g.label, styles.colGroup)}</React.Fragment>
          ))}
          {header(null, "Actions", styles.colActions, "right")}
        </View>
        {loading && students.length === 0 ? <Skeleton rows={8} /> : null}
        {rows.length === 0 && !loading ? <Text style={[styles.empty, styles.pad]}>No students match.</Text> : null}
        {rows.map((s) => {
          const status = presence[s.id];
          const overall = computeOverall(s.mastered, plan);
          const first = firstNameOf(s.full_name);
          const name = s.full_name || "(no name)";
          return (
            <View key={s.id}>
              <Pressable
                onPress={() => props.onOpen(s.id)}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${statusWord(status)}, ${Math.round(overall * 100)}% overall. Open details`}
                style={({ hovered, pressed }: any) => [styles.tr, (hovered || confirmId === s.id) && styles.trHover, pressed && styles.pressed, webCursor]}
              >
                <View style={[styles.td, styles.colName]}>
                  <Avatar name={name} color={colors.accentCoral} size={32} />
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                </View>
                <View style={[styles.td, styles.colStatus]}>
                  <PresenceDot status={status} />
                </View>
                <View style={[styles.td, styles.colOverall]}>
                  <View style={styles.flex}>
                    <Bar value={overall} />
                  </View>
                  <Text style={styles.pct}>{Math.round(overall * 100)}%</Text>
                </View>
                {groups.map((g) => {
                  const total = planSigns(g.language, g.group, plan).length;
                  return (
                    <View key={g.key} style={[styles.td, styles.colGroup]}>
                      <Text style={styles.count}>
                        {s.mastered[groupKey(g.language, g.group)] ?? 0}/{total}
                      </Text>
                    </View>
                  );
                })}
                <View style={[styles.td, styles.colActions, styles.actions]}>
                  {status === "available" ? (
                    <ActionButton label="Call" variant="primary" size="sm" icon={(c) => <VideoIcon size={15} color={c} />} onPress={() => props.onCall({ id: s.id, name })} />
                  ) : (
                    <Pressable
                      onPress={() => props.onCall({ id: s.id, name })}
                      disabled={status === "busy"}
                      accessibilityRole="button"
                      accessibilityLabel={
                        status === "busy" ? `Call ${name}, on another call` : `Call ${name} (offline). It will ring, and they'll see a missed call.`
                      }
                      accessibilityState={{ disabled: status === "busy" }}
                      style={[styles.dimCall, status === "busy" && styles.disabled, webCursor]}
                    >
                      <VideoIcon size={16} color={colors.textOnGlass} />
                    </Pressable>
                  )}
                  <RowMenu
                    label={`More for ${name}`}
                    items={[
                      { key: "open", label: "Open details", icon: (c) => <EyeIcon size={17} color={c} />, onPress: () => props.onOpen(s.id) },
                      {
                        key: "call",
                        label: `Call ${first}`,
                        icon: (c) => <VideoIcon size={17} color={c} />,
                        detail: status === "available" ? undefined : status === "busy" ? "on a call" : "offline",
                        disabled: status === "busy",
                        onPress: () => props.onCall({ id: s.id, name }),
                      },
                      { key: "remove", label: "Remove from class…", icon: (c) => <TrashIcon size={17} color={c} />, destructive: true, onPress: () => setConfirmId(s.id) },
                    ]}
                  />
                </View>
              </Pressable>
              {confirmId === s.id ? (
                <View style={styles.confirmWrap}>
                  <ConfirmInline
                    message={`Remove ${name} from ${klass.name}? Their account and progress stay; they just won't be in your class.`}
                    confirmLabel="Remove"
                    onConfirm={() => remove(s)}
                    onCancel={() => setConfirmId(null)}
                    busy={removing}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const statusWord = (s: PresenceStatus | undefined) => (s === "busy" ? "on a call" : s === "available" ? "online" : "offline");

/** Static placeholder rows while the roster loads (no shimmer). */
export function Skeleton({ rows }: { rows: number }) {
  return (
    <View accessibilityLabel="Loading students…" accessibilityLiveRegion="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skelRow}>
          <View style={styles.skelDot} />
          <View style={[styles.skelBar, { width: 140 }]} />
          <View style={[styles.skelBar, styles.flex]} />
          <View style={[styles.skelBar, { width: 56, height: 28, borderRadius: 14 }]} />
        </View>
      ))}
    </View>
  );
}

function StudentsEmpty({ klass, onCopyCode, onPrint, onInvite }: Props) {
  return (
    <View style={[styles.card, styles.emptyCard]}>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        No students yet
      </Text>
      <Text style={styles.emptyBody}>Students type this code on their dashboard to join.</Text>
      <View style={[styles.bigCode, neuInset("sm")]} accessibilityLabel={`Class code ${klass.join_code.split("").join(" ")}`}>
        <Text style={styles.bigCodeText} selectable>
          {klass.join_code}
        </Text>
      </View>
      <View style={styles.emptyActions}>
        {canCopy ? <ActionButton label="Copy" size="md" icon={(c) => <CopyIcon size={15} color={c} />} onPress={onCopyCode} /> : null}
        {Platform.OS === "web" ? <ActionButton label="Print" size="md" icon={(c) => <PrinterIcon size={15} color={c} />} onPress={onPrint} /> : null}
        <ActionButton label="Add students who signed up" variant="primary" size="md" onPress={onInvite} />
      </View>
    </View>
  );
}

/** A print page with the class code in big type (window.print). */
export function printClassCode(klass: ClassRow): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const w = window.open("", "_blank", "width=760,height=600");
  if (!w) return false;
  const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Class code · ${esc(klass.name)}</title>` +
      `<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;padding:56px 24px;color:#111}` +
      `h1{font-size:30px;margin:0 0 12px}p{font-size:20px;line-height:1.5;color:#333;margin:0 auto;max-width:560px}` +
      `.code{font-size:128px;font-weight:800;letter-spacing:.16em;margin:36px 0;font-family:ui-monospace,Consolas,monospace}</style></head>` +
      `<body><h1>${esc(klass.name)}</h1><p>Open LCSign, choose Student, and type this class code on your dashboard to join:</p>` +
      `<div class="code">${esc(klass.join_code)}</div><p>It only works for students who aren't in a class yet.</p></body></html>`
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
  return true;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  right: { textAlign: "right" },
  pad: { padding: 20 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 16, marginBottom: 18 },
  title: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: colors.textPrimary },
  lede: { fontFamily: fonts.body, fontSize: 14.5, color: colors.textOnGlass, marginTop: 6 },
  headActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" },
  search: { width: 300 },
  soon: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textOnGlass },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  tableCard: { overflow: "hidden" },
  thead: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  th: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textOnGlass },
  thActive: { color: colors.textPrimary },
  thBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  tr: { flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  trHover: { backgroundColor: "rgba(255,255,255,0.04)" },
  pressed: { opacity: 0.85 },
  td: { flexDirection: "row", alignItems: "center", gap: 10 },
  colName: { flex: 1.5, minWidth: 0, paddingRight: 12 },
  colStatus: { width: 112 },
  colOverall: { flex: 1.3, minWidth: 0, paddingRight: 16 },
  colGroup: { width: 96 },
  colActions: { width: 112, justifyContent: "flex-end" },
  actions: { gap: 8 },
  name: { flexShrink: 1, fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
  pct: { width: 40, textAlign: "right", fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
  count: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
  dimCall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.14)",
  },
  disabled: { opacity: 0.4 },
  confirmWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.textOnGlass, paddingVertical: 12 },
  skelRow: { flexDirection: "row", alignItems: "center", gap: 16, height: 52, paddingHorizontal: 16 },
  skelDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.07)" },
  skelBar: { height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.07)" },
  emptyCard: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 10 },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 22, color: colors.textPrimary },
  emptyBody: { fontFamily: fonts.body, fontSize: 14.5, color: colors.textOnGlass },
  bigCode: { marginVertical: 10, paddingVertical: 14, paddingHorizontal: 28, borderRadius: radii.md, backgroundColor: colors.neuWell },
  bigCodeText: { fontFamily: fonts.heading, fontSize: 44, letterSpacing: 10, color: colors.textPrimary },
  emptyActions: { flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center" },
  phoneStack: { gap: 14 },
  phoneHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  phoneTitle: { fontFamily: fonts.heading, fontSize: 26, color: colors.textPrimary },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  phoneList: { paddingHorizontal: 14 },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 8 },
  rule: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" },
  subRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 3 },
  sub: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textOnGlass },
  roundCall: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.actionPrimaryFill },
  chev: { transform: [{ rotate: "-90deg" }], padding: 6 },
});
