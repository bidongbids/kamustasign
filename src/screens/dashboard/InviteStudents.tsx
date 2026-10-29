// Teacher: the two ways students get into a class (0009_teacher_classroom.sql)
//  - the class's join code, which a student types on their dashboard;
//  - ticking students from the list of accounts that have no class yet.
// Students already in another class never appear in the list - moving them
// is their current teacher's call (they remove them first).
import React, { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { DashboardCard, useDashboardStyles } from "./DashboardShell";
import { ActionButton, Avatar, CheckRow, ConfirmInline, FieldLabel, SearchField, type NoticeState } from "./ManageKit";
import { LoopIcon, PlusIcon } from "../../components/icons/UiIcons";
import { fonts, radii, spacing, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import {
  addStudentsToClass,
  listUnassignedStudents,
  regenerateClassCode,
  type ClassRow,
  type UnassignedStudent,
} from "../../lib/queries";

const canCopy = Platform.OS === "web" && typeof navigator !== "undefined" && !!navigator.clipboard;

export function JoinCodeCard({
  klass,
  setNotice,
  onCodeChanged,
}: {
  klass: ClassRow;
  setNotice: (n: NoticeState) => void;
  onCodeChanged: (code: string) => void;
}) {
  const ds = useDashboardStyles();
  const { shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const regenerate = async () => {
    setBusy(true);
    const { data, error } = await regenerateClassCode(klass.id);
    setBusy(false);
    setConfirmNew(false);
    if (error || !data) {
      setNotice({ kind: "error", message: error?.message ?? "Couldn't make a new code." });
      return;
    }
    onCodeChanged(data);
    setNotice({ kind: "success", message: `New code for ${klass.name}: ${data}. The old one no longer works.` });
  };

  return (
    <DashboardCard title="Class code" style={styles.card}>
      <Text style={ds.itemMeta}>
        Students type this on their dashboard to join {klass.name}. It only works for students who aren't in a class yet.
      </Text>
      <View style={styles.codeRow}>
        <View style={[styles.codeWell, shadows.neuInset("sm")]} accessibilityLabel={`Class code ${klass.join_code.split("").join(" ")}`}>
          <Text style={styles.code} selectable>
            {klass.join_code}
          </Text>
        </View>
        <View style={styles.row8}>
          {canCopy && (
            <ActionButton
              label="Copy"
              onPress={() =>
                navigator.clipboard
                  .writeText(klass.join_code)
                  .then(() => setNotice({ kind: "success", message: "Code copied." }))
                  .catch(() => setNotice({ kind: "error", message: "Couldn't copy - select the code instead." }))
              }
            />
          )}
          <ActionButton
            label="New code"
            variant="ghost"
            icon={(c) => <LoopIcon size={14} color={c} />}
            onPress={() => setConfirmNew(true)}
          />
        </View>
      </View>
      {confirmNew && (
        <ConfirmInline
          message="Make a new code? The current one stops working. Students already in the class stay in it."
          confirmLabel="New code"
          onConfirm={regenerate}
          onCancel={() => setConfirmNew(false)}
          busy={busy}
        />
      )}
    </DashboardCard>
  );
}

export function InviteStudentsCard({
  klass,
  accentColor,
  setNotice,
  onAdded,
}: {
  klass: ClassRow;
  accentColor: string;
  setNotice: (n: NoticeState) => void;
  onAdded: () => void;
}) {
  const ds = useDashboardStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [students, setStudents] = useState<UnassignedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listUnassignedStudents();
    setLoading(false);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return;
    }
    setStudents(data);
    setPicked((prev) => new Set([...prev].filter((id) => data.some((s) => s.id === id))));
  }, [setNotice]);

  useEffect(() => {
    load();
  }, [load, klass.id]);

  const q = search.trim().toLowerCase();
  const visible = students.filter(
    (s) => !q || s.full_name.toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q)
  );
  const allVisiblePicked = visible.length > 0 && visible.every((s) => picked.has(s.id));

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const s of visible) {
        if (allVisiblePicked) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });

  const add = async () => {
    if (picked.size === 0) return;
    setAdding(true);
    const ids = [...picked];
    const { data, error } = await addStudentsToClass(klass.id, ids);
    setAdding(false);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return;
    }
    const skipped = ids.length - data.length;
    setNotice({
      kind: "success",
      message:
        `Added ${data.length} student${data.length === 1 ? "" : "s"} to ${klass.name}.` +
        (skipped ? ` ${skipped} had already joined another class.` : ""),
    });
    setPicked(new Set());
    load();
    onAdded();
  };

  return (
    <DashboardCard title="Invite students" style={styles.card}>
      <Text style={ds.itemMeta}>Tick students who signed up but aren't in a class yet.</Text>
      <View style={styles.gapTop}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search by name or email" />
      </View>

      {loading && students.length === 0 ? (
        <Text style={ds.emptyText}>Loading students…</Text>
      ) : students.length === 0 ? (
        <Text style={ds.emptyText}>
          Every student account is already in a class. New students can sign up, then join with the class code.
        </Text>
      ) : visible.length === 0 ? (
        <Text style={ds.emptyText}>No matching students.</Text>
      ) : (
        <View style={styles.list}>
          <CheckRow checked={allVisiblePicked} onToggle={toggleAll} label="Select all" accentColor={accentColor} style={styles.allRow}>
            <FieldLabel>{allVisiblePicked ? "Clear all" : `Select all (${visible.length})`}</FieldLabel>
          </CheckRow>
          {visible.map((s) => (
            <CheckRow
              key={s.id}
              checked={picked.has(s.id)}
              onToggle={() => toggle(s.id)}
              label={s.full_name || s.email || "Student"}
              accentColor={accentColor}
            >
              <Avatar name={s.full_name} color={colors.accentCoralText} size={32} />
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {s.full_name || "(no name)"}
                </Text>
                {s.email ? (
                  <Text style={ds.itemMeta} numberOfLines={1}>
                    {s.email}
                  </Text>
                ) : null}
              </View>
            </CheckRow>
          ))}
        </View>
      )}

      <View style={[styles.row8, styles.gapTop]}>
        <ActionButton
          label={picked.size ? `Add ${picked.size} to ${klass.name}` : "Add to class"}
          variant="primary"
          accentColor={accentColor}
          icon={(c) => <PlusIcon size={14} color={c} />}
          onPress={add}
          loading={adding}
          disabled={picked.size === 0}
        />
        <ActionButton label="Refresh list" variant="ghost" onPress={load} disabled={loading} />
      </View>
    </DashboardCard>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row8: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  card: { marginTop: spacing.md },
  gapTop: { marginTop: spacing.md },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: spacing.md },
  codeWell: { backgroundColor: colors.neuWell, borderRadius: radii.md, paddingVertical: 10, paddingHorizontal: 20 },
  code: { fontFamily: fonts.heading, fontSize: 30, letterSpacing: 6, color: colors.textPrimary },
  list: { marginTop: spacing.sm, maxHeight: 360, overflow: "scroll" as any },
  allRow: { borderBottomWidth: 1, borderBottomColor: theme.name === "dark" ? "rgba(255,255,255,0.08)" : colors.border },
  name: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
});
