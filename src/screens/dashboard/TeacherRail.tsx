// The teacher's rail (design T1-T10): the class switcher, the four sections
// - Today (with a count of what needs the teacher) · Students · What they
// learn · Progress - and the class code at the foot, one tap to copy.
// Below desktop width the same sections are a bottom tab bar (DashboardShell
// `tabs`) and the switcher sits at the top of the page.
import React, { useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { ActionButton, ConfirmInline } from "./ManageKit";
import {
  BookIcon,
  ChartIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  HomeIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "../../components/icons/UiIcons";
import { colors, fonts, radii } from "../../theme/theme";
import { neuInset, neuRaised } from "../../theme/shadows";
import type { ClassRow } from "../../lib/queries";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;
export const canCopy = Platform.OS === "web" && typeof navigator !== "undefined" && !!navigator.clipboard;

export type TeacherSection = "today" | "students" | "learn" | "progress";

export const SECTIONS: { key: TeacherSection; label: string; short: string; icon: (color: string, size?: number) => React.ReactNode }[] = [
  { key: "today", label: "Today", short: "Today", icon: (c, s = 19) => <HomeIcon size={s} color={c} /> },
  { key: "students", label: "Students", short: "Students", icon: (c, s = 19) => <UsersIcon size={s} color={c} /> },
  { key: "learn", label: "What they learn", short: "Learn", icon: (c, s = 19) => <BookIcon size={s} color={c} /> },
  { key: "progress", label: "Progress", short: "Progress", icon: (c, s = 19) => <ChartIcon size={s} color={c} /> },
];

export type ClassActions = {
  onSelect: (id: string) => void;
  /** Each resolves true when it worked (the popover then closes). */
  onCreate: (name: string) => Promise<boolean>;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
};

type RailProps = {
  classes: ClassRow[];
  klass: ClassRow;
  studentCount: number | null;
  section: TeacherSection;
  onSection: (s: TeacherSection) => void;
  needsCount: number;
  actions: ClassActions;
  onCopyCode: () => void;
};

export function TeacherRail({ classes, klass, studentCount, section, onSection, needsCount, actions, onCopyCode }: RailProps) {
  return (
    <View style={styles.rail}>
      <Text style={styles.eyebrow}>CLASS</Text>
      <ClassSwitcher classes={classes} klass={klass} studentCount={studentCount} actions={actions} />
      <View style={styles.nav} accessibilityRole="tablist">
        {SECTIONS.map((s) => {
          const active = s.key === section;
          const badge = s.key === "today" && needsCount > 0 ? needsCount : 0;
          return (
            <Pressable
              key={s.key}
              onPress={() => onSection(s.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={badge ? `${s.label}, ${badge} thing${badge === 1 ? "" : "s"} need${badge === 1 ? "s" : ""} you` : s.label}
              style={({ hovered }: any) => [styles.navItem, active ? [styles.navActive, neuRaised("sm")] : hovered && styles.navHover, webCursor]}
            >
              {s.icon(active ? colors.textPrimary : colors.textOnGlass)}
              <Text style={[styles.navText, active && styles.navTextActive]} numberOfLines={1}>
                {s.label}
              </Text>
              {badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.flex} />
      <ClassCodeCard code={klass.join_code} onCopy={onCopyCode} />
    </View>
  );
}

export function ClassCodeCard({ code, onCopy }: { code: string; onCopy: () => void }) {
  return (
    <View style={styles.codeCard}>
      <Text style={styles.eyebrow}>CLASS CODE</Text>
      <View style={styles.codeRow}>
        <Text style={styles.code} selectable accessibilityLabel={`Class code ${code.split("").join(" ")}`}>
          {code}
        </Text>
        {canCopy ? (
          <Pressable onPress={onCopy} accessibilityRole="button" accessibilityLabel="Copy class code" style={[styles.copy, neuRaised("sm"), webCursor]} hitSlop={4}>
            <CopyIcon size={16} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.codeHelp}>Students with no class type this to join.</Text>
    </View>
  );
}

// ── ClassSwitcher ───────────────────────────────────────────────────────

type Mode = "list" | "new" | "rename" | "delete";
const POP_W = 300;

export function ClassSwitcher({
  classes,
  klass,
  studentCount,
  actions,
  fullWidth,
}: {
  classes: ClassRow[];
  klass: ClassRow;
  studentCount: number | null;
  actions: ClassActions;
  fullWidth?: boolean;
}) {
  const ref = useRef<View>(null);
  const { width: W } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [mode, setMode] = useState<Mode>("list");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const open = () => {
    setMode("list");
    ref.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  };
  const close = () => {
    if (!busy) setAnchor(null);
  };
  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) setAnchor(null);
  };
  const submit = () => {
    const name = value.trim();
    if (!name || busy) return;
    void run(() => (mode === "new" ? actions.onCreate(name) : actions.onRename(name)));
  };

  const width = fullWidth && anchor ? Math.max(POP_W, anchor.w) : POP_W;
  const left = anchor ? Math.max(8, Math.min(W - width - 8, anchor.x)) : 0;
  const count = studentCount === null ? "…" : `${studentCount} student${studentCount === 1 ? "" : "s"}`;

  return (
    <>
      <Pressable
        ref={ref}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Class: ${klass.name}, ${count}. Switch, add, rename or delete classes`}
        style={({ hovered }: any) => [styles.switcher, neuRaised("sm"), hovered && styles.navHover, webCursor]}
      >
        <View style={styles.switchDot} />
        <View style={styles.flex}>
          <Text style={styles.switchName} numberOfLines={1}>
            {klass.name}
          </Text>
          {!fullWidth ? <Text style={styles.switchMeta}>{count}</Text> : null}
        </View>
        <ChevronDownIcon size={16} color={colors.textOnGlass} />
      </Pressable>
      <Modal visible={!!anchor} transparent animationType="none" onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close class menu" />
        {anchor ? (
          <View style={[styles.pop, neuRaised("md"), { top: anchor.y + anchor.h + 8, left, width }]}>
            {mode === "list" ? (
              <>
                <Text style={styles.popEyebrow}>YOUR CLASSES</Text>
                {classes.map((c) => {
                  const active = c.id === klass.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        setAnchor(null);
                        if (!active) actions.onSelect(c.id);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      style={({ hovered }: any) => [styles.popItem, hovered && styles.popHover, webCursor]}
                    >
                      <View style={[styles.switchDot, !active && styles.dotIdle]} />
                      <Text style={[styles.popText, active && styles.popTextActive]} numberOfLines={1}>
                        {c.name}
                      </Text>
                      {active ? <CheckIcon size={15} color={colors.primaryTealText} /> : null}
                    </Pressable>
                  );
                })}
                <View style={styles.popDivider} />
                <PopAction label="New class" icon={(c) => <PlusIcon size={15} color={c} />} onPress={() => (setValue(""), setMode("new"))} />
                <PopAction label="Rename this class" icon={(c) => <PencilIcon size={15} color={c} />} onPress={() => (setValue(klass.name), setMode("rename"))} />
                <PopAction label="Delete this class…" danger icon={(c) => <TrashIcon size={15} color={c} />} onPress={() => setMode("delete")} />
              </>
            ) : mode === "delete" ? (
              <ConfirmInline
                message={`Delete "${klass.name}"? Its ${studentCount ?? 0} student${studentCount === 1 ? "" : "s"} will be left without a class (their progress is kept). This can't be undone.`}
                confirmLabel="Delete class"
                busy={busy}
                onCancel={() => setMode("list")}
                onConfirm={() => void run(actions.onDelete)}
              />
            ) : (
              <View style={styles.form}>
                <Text style={styles.formLabel}>{mode === "new" ? "New class name" : "Class name"}</Text>
                <TextInput
                  value={value}
                  onChangeText={setValue}
                  autoFocus
                  placeholder="e.g. Grade 6 - Rizal"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel={mode === "new" ? "New class name" : "Class name"}
                  onSubmitEditing={submit}
                  style={[styles.input, neuInset("sm")]}
                />
                <View style={styles.formRow}>
                  <ActionButton label="Cancel" variant="ghost" onPress={() => setMode("list")} disabled={busy} />
                  <ActionButton
                    label={mode === "new" ? "Create class" : "Save"}
                    variant="primary"
                    onPress={submit}
                    loading={busy}
                    disabled={!value.trim()}
                  />
                </View>
              </View>
            )}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

function PopAction({ label, icon, onPress, danger }: { label: string; icon: (c: string) => React.ReactNode; onPress: () => void; danger?: boolean }) {
  const color = danger ? colors.needsPracticeText : colors.textPrimary;
  return (
    <Pressable onPress={onPress} accessibilityRole="menuitem" style={({ hovered }: any) => [styles.popItem, hovered && styles.popHover, webCursor]}>
      {icon(color)}
      <Text style={[styles.popText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  rail: { flex: 1, paddingHorizontal: 12, paddingTop: 22, paddingBottom: 18 },
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 1.2, color: colors.textOnGlass, marginBottom: 10, marginLeft: 6 },
  switcher: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: colors.neuBase,
  },
  switchDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryTeal },
  dotIdle: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.presenceOffline },
  switchName: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  switchMeta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnGlass, marginTop: 1 },
  nav: { marginTop: 28, gap: 6 },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: radii.md },
  navActive: { backgroundColor: colors.neuBase },
  navHover: { backgroundColor: "rgba(255,255,255,0.05)" },
  navText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textOnGlass },
  navTextActive: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.attention,
    backgroundColor: "rgba(242,178,62,0.16)",
  },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.attention },
  codeCard: {
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  code: { fontFamily: fonts.heading, fontSize: 24, letterSpacing: 5, color: colors.textPrimary },
  copy: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  codeHelp: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.textOnGlass, marginTop: 8 },
  pop: {
    position: "absolute",
    padding: 8,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  popEyebrow: { fontFamily: fonts.bodyMedium, fontSize: 10.5, letterSpacing: 1.1, color: colors.textOnGlass, margin: 8 },
  popItem: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingHorizontal: 10, borderRadius: 12 },
  popHover: { backgroundColor: "rgba(255,255,255,0.06)" },
  popText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  popTextActive: { fontFamily: fonts.bodySemiBold },
  popDivider: { height: 1, marginVertical: 6, marginHorizontal: 8, backgroundColor: "rgba(255,255,255,0.1)" },
  form: { padding: 8, gap: 10 },
  formLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textOnGlass },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.neuWell,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textPrimary,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },
  formRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
