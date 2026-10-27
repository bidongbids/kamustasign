// Around the video call, on the dashboards (0013_video_call_extras.sql):
//  - PresenceDot: online / on a call / offline, from useVideoCall's presence;
//  - MissedCallsCard: unanswered calls, with "Call back" and "Dismiss";
//  - CallNotesCard (teacher): the notes saved from past calls with this class.
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { DashboardCard, dashboardStyles as ds } from "./DashboardShell";
import { ActionButton, ConfirmInline } from "./ManageKit";
import { CheckIcon, PhoneIcon, TrashIcon, VideoIcon } from "../../components/icons/UiIcons";
import { colors, fonts, spacing } from "../../theme/theme";
import type { CallNoteRow, MissedCallRow } from "../../lib/queries";
import type { PresenceStatus } from "../../lib/callSignaling";

export function presenceLabel(status: PresenceStatus | undefined): string {
  return status === "busy" ? "On a call" : status === "available" ? "Online" : "Offline";
}

/**
 * A shape plus the word - status is never colour alone: a filled dot for
 * Online, a diamond for On a call, an outlined ring for Offline.
 */
export function PresenceDot({ status, withLabel = true, size = 9 }: { status: PresenceStatus | undefined; withLabel?: boolean; size?: number }) {
  const text = status === "busy" ? colors.presenceOnCall : status === "available" ? colors.successText : colors.textOnGlass;
  return (
    <View style={styles.presence} accessibilityLabel={presenceLabel(status)}>
      {status === "busy" ? (
        <View style={[styles.diamond, { width: size - 1, height: size - 1, backgroundColor: colors.presenceOnCall }]} />
      ) : (
        <View
          style={[
            { width: size, height: size, borderRadius: size / 2 },
            status === "available" ? { backgroundColor: colors.presenceOnline } : styles.dotOffline,
          ]}
        />
      )}
      {withLabel ? <Text style={[styles.presenceText, { color: text }]}>{presenceLabel(status)}</Text> : null}
    </View>
  );
}

export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return sameDay ? `today at ${time}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${time}`;
}

export function MissedCallsCard({
  calls,
  nameOf,
  onCallBack,
  onDismiss,
  accentColor,
  style,
}: {
  calls: MissedCallRow[];
  nameOf: (callerId: string) => string | null;
  onCallBack: (call: MissedCallRow) => void;
  /** Marks the listed calls seen. */
  onDismiss: (ids: string[]) => void;
  accentColor: string;
  style?: any;
}) {
  if (calls.length === 0) return null;
  // One line per caller: their latest missed call, and how many.
  const byCaller = new Map<string, { latest: MissedCallRow; ids: string[] }>();
  for (const c of calls) {
    const e = byCaller.get(c.caller_id);
    if (e) e.ids.push(c.id);
    else byCaller.set(c.caller_id, { latest: c, ids: [c.id] });
  }
  return (
    <DashboardCard style={[styles.missed, style]}>
      <View style={styles.missedHead}>
        <PhoneIcon size={18} color={colors.accentCoral} />
        <Text style={styles.missedTitle}>
          {calls.length === 1 ? "You missed a call" : `You missed ${calls.length} calls`}
        </Text>
      </View>
      {[...byCaller.values()].map(({ latest, ids }, i) => {
        const name = nameOf(latest.caller_id) ?? "Someone in your class";
        return (
          <View key={latest.caller_id} style={[ds.listItem, i === 0 && ds.listItemFirst, styles.row]}>
            <View style={styles.flex}>
              <Text style={ds.itemTitle} numberOfLines={1}>
                {name}
                {ids.length > 1 ? ` (${ids.length})` : ""}
              </Text>
              <Text style={ds.itemMeta}>Called {formatWhen(latest.created_at)}</Text>
            </View>
            <ActionButton
              label="Call back"
              variant="primary"
              accentColor={accentColor}
              icon={(c) => <VideoIcon size={16} color={c} />}
              onPress={() => {
                onDismiss(ids);
                onCallBack(latest);
              }}
            />
            <ActionButton label={`Dismiss missed call from ${name}`} iconOnly variant="ghost" icon={(c) => <CheckIcon size={16} color={c} />} onPress={() => onDismiss(ids)} />
          </View>
        );
      })}
    </DashboardCard>
  );
}

const length = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function CallNotesCard({
  notes,
  nameOf,
  onDelete,
  loading,
}: {
  notes: CallNoteRow[];
  nameOf: (studentId: string) => string;
  onDelete: (id: string) => Promise<void>;
  loading?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <DashboardCard title={`Call notes (${notes.length})`} style={styles.card}>
      {loading && notes.length === 0 ? (
        <Text style={ds.emptyText}>Loading call notes…</Text>
      ) : notes.length === 0 ? (
        <Text style={ds.emptyText}>
          After a call, tap “Save notes” to keep what was signed and practised. Saved notes show up here.
        </Text>
      ) : (
        notes.map((n, i) => {
          const passed = n.practice.filter((p) => p.passed).length;
          const open = openId === n.id;
          return (
            <View key={n.id} style={[ds.listItem, i === 0 && ds.listItemFirst]}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={ds.itemTitle} numberOfLines={1}>
                    {nameOf(n.student_id)}
                  </Text>
                  <Text style={ds.itemMeta}>
                    {formatWhen(n.started_at)} · {length(n.duration_seconds)}
                    {n.practice.length ? ` · practised ${n.practice.length}, passed ${passed}` : ""}
                  </Text>
                </View>
                <ActionButton label={open ? "Hide" : "View"} variant="ghost" onPress={() => setOpenId(open ? null : n.id)} />
                <ActionButton label="Delete call notes" iconOnly variant="ghost" icon={(c) => <TrashIcon size={16} color={c} />} onPress={() => setConfirmId(n.id)} />
              </View>
              {open ? (
                <View style={styles.detail}>
                  {n.practice.map((p, j) => (
                    <Text key={j} style={styles.detailText}>
                      {p.passed ? "✓" : "·"} {p.sign} - {p.passed ? "passed" : "not yet"}
                      {p.confidence > 0 ? `, best ${Math.round(p.confidence * 100)}%` : ""} ({p.tries} {p.tries === 1 ? "try" : "tries"})
                    </Text>
                  ))}
                  <Text style={styles.detailText}>
                    <Text style={styles.detailLabel}>You signed: </Text>
                    {n.teacher_text || "-"}
                  </Text>
                  <Text style={styles.detailText}>
                    <Text style={styles.detailLabel}>{nameOf(n.student_id)} signed: </Text>
                    {n.student_text || "-"}
                  </Text>
                </View>
              ) : null}
              {confirmId === n.id ? (
                <ConfirmInline
                  message="Delete these call notes? This can't be undone."
                  confirmLabel="Delete"
                  busy={busy}
                  onCancel={() => setConfirmId(null)}
                  onConfirm={async () => {
                    setBusy(true);
                    await onDelete(n.id);
                    setBusy(false);
                    setConfirmId(null);
                  }}
                />
              ) : null}
            </View>
          );
        })
      )}
    </DashboardCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  card: { marginTop: spacing.md },
  presence: { flexDirection: "row", alignItems: "center", gap: 6 },
  diamond: { transform: [{ rotate: "45deg" }], borderRadius: 1.5 },
  dotOffline: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.presenceOffline },
  presenceText: { fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  missed: { marginBottom: spacing.md, borderColor: "rgba(242,178,62,0.45)" },
  missedHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
  missedTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.textPrimary },
  detail: { marginTop: spacing.sm, gap: 4, paddingLeft: 2 },
  detailText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textPrimary },
  detailLabel: { fontFamily: fonts.bodySemiBold, color: colors.textSecondary },
});
