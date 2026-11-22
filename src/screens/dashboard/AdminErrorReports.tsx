// "App errors" on the admin's Accounts page: what went wrong in the app on
// every computer and phone, sent by the app by itself while someone is
// signed in (errorLog.ts -> 0019_error_reports.sql). Admins only; the
// database deletes rows after 30 days.
//
// The page shows a one-line summary card; "View errors" opens a drawer with
// the list, newest first. Each row: the first line of the error, when, whose
// account, which app and version, and where in the app. "Show details" has
// the rest (the stack, the device); Copy puts one report on the clipboard
// for whoever fixes LCSign; Delete removes it once it's dealt with.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ActionButton, ConfirmInline } from "./ManageKit";
import { CloseButton, SideDrawer } from "./Overlays";
import { LoadErrorCard } from "./TeacherStates";
import { AlertCircleIcon, CheckIcon, CopyIcon, TrashIcon } from "../../components/icons/UiIcons";
import { fonts, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { PLATFORM_LABEL } from "../../lib/appVersion";
import { deleteErrorReports, listErrorReports, type AccountRow, type ErrorReportRow } from "../../lib/queries";
import { deviceLabel, firstLine, personText, reportText, sourceText, summarize, summaryText, whenText, type ReportPerson } from "../../lib/errorReports";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;
const mono = Platform.select({ web: "ui-monospace, Consolas, monospace", android: "monospace", default: "Courier" });

type Load = { state: "loading" } | { state: "missing" } | { state: "error" } | { state: "ready"; rows: ErrorReportRow[] };

function copyText(text: string): Promise<boolean> {
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (!clipboard) return Promise.resolve(false);
  return clipboard.writeText(text).then(
    () => true,
    () => false
  );
}

export default function ErrorReportsCard({ accounts, accentColor }: { accounts: AccountRow[]; accentColor: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await listErrorReports();
    if (res.missing) setLoad({ state: "missing" });
    else if (res.error) setLoad({ state: "error" });
    else setLoad({ state: "ready", rows: res.data });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const people = useMemo(() => {
    const map = new Map<string, ReportPerson>();
    for (const a of accounts) map.set(a.id, { name: a.full_name || a.email || "(no name)", role: a.role });
    return map;
  }, [accounts]);

  if (load.state === "error") {
    return (
      <View style={styles.cardSpace}>
        <LoadErrorCard title="Couldn't load the app errors" onRetry={refresh} />
      </View>
    );
  }

  const rows = load.state === "ready" ? load.rows : [];
  const summary = summarize(rows);
  return (
    <View style={[styles.card, styles.cardSpace]}>
      <View style={styles.head}>
        {load.state === "ready" && !rows.length ? (
          <CheckIcon size={18} color={colors.successText} />
        ) : (
          <AlertCircleIcon size={20} color={load.state === "ready" ? colors.attention : colors.textOnGlass} />
        )}
        <Text style={styles.title} accessibilityRole="header">
          App errors
        </Text>
        <View style={styles.flex} />
        {rows.length ? (
          <ActionButton
            label="View errors"
            size="md"
            onPress={() => {
              setOpen(true);
              void refresh();
            }}
          />
        ) : null}
      </View>
      <Text style={styles.body}>
        {load.state === "loading"
          ? "Loading…"
          : load.state === "missing"
            ? "Collecting app errors needs the 0019 database update: run 0019_error_reports.sql in the Supabase SQL Editor."
            : summaryText(summary)}
      </Text>
      <Text style={styles.small}>
        The app sends its errors here by itself while someone is signed in, without email addresses or log-in details. Only admins can see them, and they're
        deleted after 30 days.
      </Text>
      <ErrorReportsDrawer
        visible={open}
        rows={rows}
        people={people}
        accentColor={accentColor}
        onClose={() => setOpen(false)}
        onDeleted={(ids) => setLoad((prev) => (prev.state === "ready" ? { state: "ready", rows: prev.rows.filter((r) => !ids.includes(r.id)) } : prev))}
      />
    </View>
  );
}

function ErrorReportsDrawer({
  visible,
  rows,
  people,
  accentColor,
  onClose,
  onDeleted,
}: {
  visible: boolean;
  rows: ErrorReportRow[];
  people: Map<string, ReportPerson>;
  accentColor: string;
  onClose: () => void;
  onDeleted: (ids: number[]) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const person = (r: ErrorReportRow) => people.get(r.user_id) ?? null;

  useEffect(() => {
    if (!visible) {
      setStatus(null);
      setConfirmAll(false);
    }
  }, [visible]);

  const remove = async (ids: number[]) => {
    setBusy(true);
    const { error } = await deleteErrorReports(ids);
    setBusy(false);
    if (error) {
      setStatus("Couldn't delete. Check the connection and try again.");
      return;
    }
    setConfirmAll(false);
    onDeleted(ids);
    setStatus(ids.length === 1 ? "Deleted." : `Deleted ${ids.length} errors.`);
  };

  const copy = async (text: string, what: string) => {
    setStatus((await copyText(text)) ? `Copied ${what}.` : "Couldn't copy. Use Show details and take a screenshot instead.");
  };

  return (
    <SideDrawer visible={visible} onClose={onClose} width={680} tint="frosted" bare>
      <View style={styles.flex}>
        <View style={styles.drawerHead}>
          <View style={styles.flex}>
            <Text style={styles.drawerTitle} accessibilityRole="header">
              App errors
            </Text>
            <Text style={styles.drawerMeta}>Newest first. Deleted by themselves after 30 days.</Text>
          </View>
          <CloseButton onPress={onClose} onFrosted />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.list}>
          {rows.length === 0 ? <Text style={styles.drawerBody}>No errors left. New ones appear here as the app sends them.</Text> : null}
          {rows.map((r) => (
            <ReportRow
              key={r.id}
              row={r}
              person={person(r)}
              busy={busy}
              onCopy={() => void copy(reportText(r, person(r)), "this error")}
              onDelete={() => void remove([r.id])}
            />
          ))}
        </ScrollView>
        <View style={styles.drawerFoot}>
          {confirmAll ? (
            <View style={styles.flex}>
              <ConfirmInline
                message={`Delete all ${rows.length} error${rows.length === 1 ? "" : "s"}? Do this once they're fixed. New errors still come in.`}
                confirmLabel="Delete all"
                busy={busy}
                onCancel={() => setConfirmAll(false)}
                onConfirm={() => void remove(rows.map((r) => r.id))}
              />
            </View>
          ) : (
            <>
              <Text style={[styles.status, styles.flex]} accessibilityLiveRegion="polite">
                {status ?? ""}
              </Text>
              {rows.length ? (
                <>
                  <ActionButton label="Delete all…" size="md" variant="ghost" onFrosted style={styles.outlineDark} disabled={busy} onPress={() => setConfirmAll(true)} />
                  <ActionButton
                    label="Copy all"
                    size="md"
                    variant="primary"
                    accentColor={accentColor}
                    icon={(c) => <CopyIcon size={15} color={c} />}
                    onPress={() => void copy(rows.map((r) => reportText(r, person(r))).join("\n\n----\n\n"), `${rows.length} error${rows.length === 1 ? "" : "s"}`)}
                  />
                </>
              ) : null}
            </>
          )}
        </View>
      </View>
    </SideDrawer>
  );
}

function ReportRow({
  row,
  person,
  busy,
  onCopy,
  onDelete,
}: {
  row: ErrorReportRow;
  person: ReportPerson;
  busy: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const device = deviceLabel(row.device);
  const meta = [
    whenText(row.happened_at),
    personText(row, person),
    `${PLATFORM_LABEL[row.platform] ?? row.platform} ${row.app_version}`,
    sourceText(row.source),
  ].join(" · ");
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={[styles.rowTitle, styles.flex]} numberOfLines={open ? undefined : 2}>
          {firstLine(row.message)}
        </Text>
        {row.count > 1 ? (
          <View style={styles.countPill} accessibilityLabel={`${row.count} times`}>
            <Text style={styles.countText}>×{row.count}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.rowMeta}>{meta}</Text>
      {open ? (
        <View style={styles.details}>
          <Text style={styles.detailsText} selectable>
            {row.message}
          </Text>
          {row.device ? (
            <Text style={styles.detailsDevice} selectable>
              {device ? `${device}\n` : ""}
              {row.device}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.rowActions}>
        <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={[styles.link, webCursor]}>
          <Text style={styles.linkText}>{open ? "Hide details" : "Show details"}</Text>
        </Pressable>
        <View style={styles.flex} />
        {/* Outlined on the frosted panel, like the account drawer's buttons: readable in both themes. */}
        <ActionButton label="Copy this error" iconOnly size="sm" variant="ghost" onFrosted style={styles.outlineDark} icon={(c) => <CopyIcon size={15} color={c} />} onPress={onCopy} />
        <ActionButton
          label="Delete this error"
          iconOnly
          size="sm"
          variant="ghost"
          onFrosted
          style={styles.outlineDark}
          disabled={busy}
          icon={(c) => <TrashIcon size={15} color={c} />}
          onPress={onDelete}
        />
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    card: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.name === "dark" ? "rgba(255,255,255,0.1)" : colors.border,
      backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.05)" : colors.surface,
      padding: 20,
      gap: 8,
    },
    cardSpace: { marginTop: 18 },
    head: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
    title: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary },
    body: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.textPrimary },
    small: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.textOnGlass },
    // frosted drawer: textOnFrosted only
    drawerHead: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 28, paddingTop: 26, paddingBottom: 14 },
    drawerTitle: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: colors.textOnFrosted },
    drawerMeta: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnFrosted, marginTop: 2 },
    drawerBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textOnFrosted },
    list: { paddingHorizontal: 28, paddingBottom: 20, gap: 10 },
    row: { padding: 14, borderRadius: radii.md, borderWidth: 1, borderColor: "rgba(30,31,38,0.16)", gap: 6 },
    rowHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    rowTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, lineHeight: 20, color: colors.textOnFrosted },
    rowMeta: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.textOnFrosted },
    countPill: { minWidth: 34, height: 24, paddingHorizontal: 8, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#1E222B" },
    countText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: "#FFFFFF" },
    details: { padding: 12, borderRadius: 12, backgroundColor: "rgba(30,31,38,0.07)", gap: 10 },
    detailsText: { fontFamily: mono, fontSize: 12, lineHeight: 17, color: colors.textOnFrosted },
    detailsDevice: { fontFamily: mono, fontSize: 11.5, lineHeight: 16, color: colors.textOnFrosted, opacity: 0.85 },
    rowActions: { flexDirection: "row", alignItems: "center", gap: 6 },
    link: { minHeight: 32, justifyContent: "center" },
    linkText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textOnFrosted, textDecorationLine: "underline" },
    drawerFoot: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      flexWrap: "wrap",
      gap: 10,
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: "rgba(30,31,38,0.14)",
    },
    status: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textOnFrosted },
    outlineDark: { borderWidth: 1.5, borderColor: "rgba(30,31,38,0.4)" },
  });
