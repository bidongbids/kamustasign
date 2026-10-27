// Admin dashboard: account management only - names and roles, with the
// sign-in email shown via admin_list_accounts (0008). Classes, rosters and
// modules belong to teachers (0009_teacher_classroom.sql); an admin can see
// which class a student is in but not change it.
//
// Note: there's no "create/delete account" action here - profiles.id
// references auth.users(id), and auth users can only be created or deleted
// through Supabase's Admin API (a service-role key), which this client-only
// app deliberately doesn't have. People sign up themselves as a student or a
// teacher; a teacher sign-up waits here for an admin's approval
// (0011_auth_hardening.sql), and only an admin can make someone an admin.
//
// Layout (design_handoff_teacher_admin_videocall A1-A5): the approvals inbox
// on top only while someone is waiting; then search, the role filter with
// live counts, a class filter and "Group by class"; then the accounts as a
// table (a list on a phone). Editing opens a frosted drawer: the role as
// three cards, and - when it changes - what will happen, in sentences, with
// a confirm button that names the change.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import DashboardShell from "./DashboardShell";
import { ActionButton, Avatar, ChoicePills, ConfirmInline, Notice, ROLE_COLORS, RoleBadge, SearchField, type NoticeState } from "./ManageKit";
import { CloseButton, SelectPill, SideDrawer } from "./Overlays";
import SegmentedToggle from "../../components/SegmentedToggle";
import { AlertCircleIcon, CheckIcon, ChevronDownIcon, InboxIcon, PencilIcon, SearchIcon, ShieldIcon } from "../../components/icons/UiIcons";
import { colors, fonts, radii } from "../../theme/theme";
import { neuInset, neuRaised } from "../../theme/shadows";
import { useResponsive } from "../../theme/responsive";
import {
  adminListAccounts,
  approveTeacher,
  getMyProfile,
  isPendingTeacher,
  listAllClasses,
  updateProfileName,
  updateProfileRole,
  type AccountRow,
  type ClassRow,
  type Profile,
  type ProfileRole,
} from "../../lib/queries";
import {
  classCell,
  filterAccounts,
  firstOf,
  joinedText,
  roleChangeConsequences,
  roleWithArticle,
  type ClassFilter,
  type RoleFilter,
} from "../../lib/adminInsights";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;
const ROLES: ProfileRole[] = ["student", "teacher", "admin"];
const ROLE_TEXT: Record<ProfileRole, { title: string; desc: string }> = {
  student: { title: "Student", desc: "Practises signs. Can be in one class." },
  teacher: { title: "Teacher", desc: "Makes classes, sees their students' progress, calls them." },
  admin: { title: "Admin", desc: "Manages accounts like you do." },
};
const INBOX_SHOWN = 3;

type Props = {
  accentColor: string;
  onSignOut: () => void;
  onExitToRoleSelect: () => void;
  /** The Account panel changed the name or 2FA - App reloads the profile. */
  onAccountChange: () => void;
};

export default function AdminDashboard({ accentColor, onSignOut, onExitToRoleSelect, onAccountChange }: Props) {
  const { width } = useResponsive();
  const phone = width < 768;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [emailsAvailable, setEmailsAvailable] = useState(true);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [classFilter, setClassFilter] = useState<ClassFilter>("all");
  const [grouped, setGrouped] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: me, error: profileError } = await getMyProfile();
    if (profileError || !me) {
      setNotice({ kind: "error", title: "Couldn't load your account", message: profileError?.message ?? "Check the connection and try again.", retry: () => void load() });
      setLoading(false);
      return;
    }
    setProfile(me as Profile);
    const [acc, { data: c, error: cErr }] = await Promise.all([adminListAccounts(), listAllClasses()]);
    const firstError = acc.error ?? cErr;
    if (firstError) setNotice({ kind: "error", title: "Couldn't load accounts", message: "Check the connection, then try again.", retry: () => void load() });
    if (acc.data) setAccounts([...acc.data].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setEmailsAvailable(acc.emailsAvailable);
    if (!cErr) setClasses((c as ClassRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (next: AccountRow) => setAccounts((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  const nameOf = useCallback((id: string) => accounts.find((a) => a.id === id)?.full_name ?? null, [accounts]);
  const pending = accounts.filter(isPendingTeacher);
  const counts = useMemo(() => {
    const c = { all: accounts.length, student: 0, teacher: 0, admin: 0 } as Record<RoleFilter, number>;
    for (const a of accounts) c[a.role] += 1;
    return c;
  }, [accounts]);
  const visible = useMemo(() => filterAccounts(accounts, { role: roleFilter, klass: classFilter, query, classes }), [accounts, roleFilter, classFilter, query, classes]);
  const editing = accounts.find((a) => a.id === editingId) ?? null;
  const displayName = (a: AccountRow) => `${a.full_name || a.email || "(no name)"}${a.id === profile?.id ? " (you)" : ""}`;

  const roleOptions = (["all", "student", "teacher", "admin"] as RoleFilter[]).map((k) => ({
    key: k,
    label: `${k === "all" ? "All" : k === "student" ? "Students" : k === "teacher" ? "Teachers" : "Admins"} ${counts[k]}`,
  }));
  const classOptions = [{ key: "all", label: "All" }, ...[...classes].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ key: c.id, label: c.name })), { key: "none", label: "No class" }];

  return (
    <DashboardShell
      accentColor={accentColor}
      roleLabel="Admin"
      userName={profile?.full_name ?? "..."}
      onSignOut={onSignOut}
      onExitToRoleSelect={onExitToRoleSelect}
      profile={profile}
      onProfileChange={(p) => {
        setProfile(p);
        setAccounts((prev) => prev.map((a) => (a.id === p.id ? { ...a, full_name: p.full_name } : a)));
        onAccountChange();
      }}
      contentMaxWidth={1140}
    >
      <Text style={[styles.title, phone && styles.titlePhone]} accessibilityRole="header">
        Accounts
      </Text>
      {!phone ? <Text style={styles.lede}>Teachers make their own classes and invite students. Here you decide who has which kind of account.</Text> : null}

      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      {!loading ? (
        <ApprovalsInbox accounts={pending} phone={phone} accentColor={accentColor} setNotice={setNotice} onSaved={replace} />
      ) : null}

      {!emailsAvailable ? <Text style={styles.migrationNote}>Emails are hidden until the 0008_class_management.sql migration is run in the Supabase SQL Editor.</Text> : null}

      <View style={[styles.toolbar, phone && styles.toolbarPhone]}>
        <View style={phone ? undefined : styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search by name or email" />
        </View>
        {phone ? (
          <ChoicePills options={roleOptions} value={roleFilter} onChange={setRoleFilter} accentColor={accentColor} />
        ) : (
          <>
            <SegmentedToggle options={roleOptions} value={roleFilter} onChange={setRoleFilter} />
            <SelectPill label="Class" value={classFilter} options={classOptions} onChange={setClassFilter} />
            <View style={styles.flex} />
            <Pressable
              onPress={() => setGrouped((g) => !g)}
              accessibilityRole="switch"
              accessibilityState={{ checked: grouped }}
              accessibilityLabel="Group by class"
              style={[styles.switchRow, webCursor]}
            >
              <Text style={styles.switchLabel}>Group by class</Text>
              <View style={[styles.track, grouped && styles.trackOn, neuInset("sm")]}>
                <View style={[styles.knob, grouped && styles.knobOn]} />
              </View>
            </Pressable>
          </>
        )}
      </View>

      {loading ? (
        <View style={styles.card}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.skelRow}>
              <View style={styles.skelDot} />
              <View style={[styles.skelBar, { width: 220 }]} />
              <View style={[styles.skelBar, { width: 80, height: 22, borderRadius: 11 }]} />
            </View>
          ))}
          <Text style={styles.muted}>Loading accounts…</Text>
        </View>
      ) : visible.length === 0 ? (
        <View style={[styles.card, styles.empty]}>
          <SearchIcon size={26} color={colors.textOnGlass} />
          <Text style={styles.emptyTitle}>{query.trim() ? `No accounts match “${query.trim()}”` : "No accounts match these filters"}</Text>
          <Text style={styles.emptyBody}>Check the spelling, or search by email. Admins can't create accounts: people sign up themselves, then appear here.</Text>
          <ActionButton
            label={query.trim() ? "Clear search" : "Clear filters"}
            onPress={() => {
              setQuery("");
              setRoleFilter("all");
              setClassFilter("all");
            }}
          />
        </View>
      ) : (
        <AccountsList
          accounts={visible}
          classes={classes}
          grouped={grouped && !phone}
          phone={phone}
          displayName={displayName}
          nameOf={nameOf}
          onEdit={setEditingId}
        />
      )}

      <AccountDrawer
        account={editing}
        selfId={profile?.id ?? null}
        classes={classes}
        nameOf={nameOf}
        accentColor={accentColor}
        setNotice={setNotice}
        onSaved={replace}
        onClose={() => setEditingId(null)}
      />
    </DashboardShell>
  );
}

// ── approvals inbox (A1, A3) ────────────────────────────────────────────

function ApprovalsInbox({
  accounts,
  phone,
  accentColor,
  setNotice,
  onSaved,
}: {
  accounts: AccountRow[];
  phone: boolean;
  accentColor: string;
  setNotice: (n: NoticeState) => void;
  onSaved: (a: AccountRow) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (accounts.length === 0) {
    return (
      <View style={[styles.card, styles.inboxEmpty]} accessibilityLiveRegion="polite">
        <CheckIcon size={16} color={colors.successText} />
        <Text style={styles.inboxEmptyText}>No one is waiting for approval.</Text>
      </View>
    );
  }

  const act = async (a: AccountRow, approve: boolean) => {
    setBusyId(a.id);
    const { error } = approve ? await approveTeacher(a.id) : await updateProfileRole(a.id, "student");
    setBusyId(null);
    const name = a.full_name || a.email || "That account";
    if (error) {
      setNotice({ kind: "error", title: `Couldn't save ${name}`, message: "Nothing was changed. Check the connection and try again.", retry: () => void act(a, approve) });
      return;
    }
    setConfirmId(null);
    onSaved(approve ? { ...a, approved: true } : { ...a, role: "student", class_id: null });
    setNotice({ kind: "success", message: approve ? `${name} can now use the teacher dashboard.` : `${name} is now a student account.` });
  };

  const shown = showAll ? accounts : accounts.slice(0, INBOX_SHOWN);
  return (
    <View style={[styles.card, styles.inbox]} accessibilityLabel={`${accounts.length} teacher account${accounts.length === 1 ? "" : "s"} waiting for approval`}>
      <View style={styles.inboxHead}>
        <InboxIcon size={20} color={colors.attention} />
        <Text style={styles.inboxTitle} accessibilityRole="header">
          Waiting for approval
        </Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{accounts.length}</Text>
        </View>
      </View>
      {!phone ? (
        <Text style={styles.inboxBody}>
          Approve only people you know are teachers. An approved teacher can see the names and emails of students who aren't in a class yet.
        </Text>
      ) : null}
      {shown.map((a) => {
        const name = a.full_name || a.email || "(no name)";
        const first = firstOf(name);
        return (
          <View key={a.id} style={styles.inboxRow}>
            <View style={[styles.inboxPerson, phone && styles.inboxPersonPhone]}>
              <Avatar name={name} color={ROLE_COLORS.teacher} size={42} />
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {[a.email, `signed up ${joinedText(a.created_at)}, as a teacher`].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {!phone ? (
                <View style={styles.row8}>
                  <ActionButton label="Approve teacher" variant="primary" size="md" accentColor={accentColor} icon={(c) => <CheckIcon size={15} color={c} />} loading={busyId === a.id && confirmId !== a.id} disabled={busyId !== null} onPress={() => void act(a, true)} />
                  <ActionButton label="Turn down…" size="md" style={styles.turnDown} disabled={busyId !== null} onPress={() => setConfirmId(a.id)} />
                </View>
              ) : null}
            </View>
            {phone ? (
              <View style={styles.row8}>
                <ActionButton label="Approve teacher" variant="primary" size="md" accentColor={accentColor} loading={busyId === a.id && confirmId !== a.id} disabled={busyId !== null} onPress={() => void act(a, true)} />
                <ActionButton label="Turn down…" size="md" style={styles.turnDown} disabled={busyId !== null} onPress={() => setConfirmId(a.id)} />
              </View>
            ) : null}
            {confirmId === a.id ? (
              <ConfirmInline
                message={`Turn down ${name}? The account becomes a student account with no class. ${first} can still sign in, and you can make ${first} a teacher later.`}
                confirmLabel="Make student"
                busy={busyId === a.id}
                onCancel={() => setConfirmId(null)}
                onConfirm={() => void act(a, false)}
              />
            ) : null}
          </View>
        );
      })}
      {accounts.length > INBOX_SHOWN ? (
        <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={webCursor}>
          <Text style={styles.link}>{showAll ? "Show fewer" : `Show all ${accounts.length}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── accounts table / list ───────────────────────────────────────────────

function AccountsList({
  accounts,
  classes,
  grouped,
  phone,
  displayName,
  nameOf,
  onEdit,
}: {
  accounts: AccountRow[];
  classes: ClassRow[];
  grouped: boolean;
  phone: boolean;
  displayName: (a: AccountRow) => string;
  nameOf: (id: string) => string | null;
  onEdit: (id: string) => void;
}) {
  const row = (a: AccountRow, i: number) => {
    const cell = classCell(a, classes);
    const name = displayName(a);
    const cellText = (
      <Text style={[styles.cellText, cell.tone === "pending" && styles.pending, cell.tone === "muted" && styles.cellMuted]} numberOfLines={phone ? 1 : 2}>
        {cell.text}
      </Text>
    );
    if (phone) {
      return (
        <Pressable
          key={a.id}
          onPress={() => onEdit(a.id)}
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${a.role}. ${cell.text}. Edit`}
          style={({ pressed }) => [styles.phoneRow, i > 0 && styles.rule, pressed && { opacity: 0.85 }]}
        >
          <Avatar name={name} color={ROLE_COLORS[a.role]} size={40} />
          <View style={styles.flex}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, styles.shrink]} numberOfLines={1}>
                {name}
              </Text>
              <RoleBadge role={a.role} />
            </View>
            {cellText}
          </View>
          <View style={styles.chev}>
            <ChevronDownIcon size={15} color={colors.textOnGlass} />
          </View>
        </Pressable>
      );
    }
    return (
      <View key={a.id} style={[styles.tr, i > 0 && styles.rule]}>
        <View style={[styles.colName, styles.person]}>
          <Avatar name={name} color={ROLE_COLORS[a.role]} size={36} />
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {a.email ? (
              <Text style={styles.meta} numberOfLines={1}>
                {a.email}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.colRole}>
          <RoleBadge role={a.role} />
        </View>
        <View style={styles.colClass}>{cellText}</View>
        <Text style={[styles.colJoined, styles.cellText]}>{joinedText(a.created_at)}</Text>
        <View style={styles.colEdit}>
          <ActionButton label={`Edit ${name}`} iconOnly size="md" icon={(c) => <PencilIcon size={16} color={c} />} onPress={() => onEdit(a.id)} />
        </View>
      </View>
    );
  };

  const header = !phone ? (
    <View style={styles.thead}>
      <Text style={[styles.th, styles.colName]}>Name</Text>
      <Text style={[styles.th, styles.colRole]}>Role</Text>
      <Text style={[styles.th, styles.colClass]}>Class</Text>
      <Text style={[styles.th, styles.colJoined]}>Joined</Text>
      <View style={styles.colEdit} />
    </View>
  ) : null;

  if (!grouped) {
    return (
      <View style={[styles.card, styles.table, phone && styles.listPhone]}>
        {header}
        {accounts.map(row)}
      </View>
    );
  }

  // Group by class: each class's teacher and students, then students with no
  // class, then the other teachers and the admins.
  const sections: { key: string; title: string; rows: AccountRow[] }[] = [];
  const placed = new Set<string>();
  for (const c of [...classes].sort((a, b) => a.name.localeCompare(b.name))) {
    const rows = accounts.filter((a) => (a.role === "student" && a.class_id === c.id) || (a.role === "teacher" && c.teacher_id === a.id && !placed.has(a.id)));
    if (!rows.length) continue;
    rows.forEach((r) => placed.add(r.id));
    const teacher = c.teacher_id ? nameOf(c.teacher_id) : null;
    sections.push({ key: c.id, title: `${c.name}${teacher ? ` · ${teacher}` : ""}`, rows: rows.sort((a, b) => (a.role === b.role ? 0 : a.role === "teacher" ? -1 : 1)) });
  }
  const rest = (title: string, key: string, pick: (a: AccountRow) => boolean) => {
    const rows = accounts.filter((a) => !placed.has(a.id) && pick(a));
    rows.forEach((r) => placed.add(r.id));
    if (rows.length) sections.push({ key, title, rows });
  };
  rest("No class", "none", (a) => a.role === "student");
  rest("Teachers with no class", "teachers", (a) => a.role === "teacher");
  rest("Admins", "admins", (a) => a.role === "admin");

  return (
    <View style={[styles.card, styles.table]}>
      {header}
      {sections.map((s) => (
        <View key={s.key}>
          <View style={styles.groupHead}>
            <Text style={styles.groupTitle}>{s.title}</Text>
            <Text style={styles.groupCount}>{s.rows.length}</Text>
          </View>
          {s.rows.map(row)}
        </View>
      ))}
    </View>
  );
}

// ── account drawer (A2, A5) ─────────────────────────────────────────────

function AccountDrawer({
  account,
  selfId,
  classes,
  nameOf,
  accentColor,
  setNotice,
  onSaved,
  onClose,
}: {
  account: AccountRow | null;
  selfId: string | null;
  classes: ClassRow[];
  nameOf: (id: string) => string | null;
  accentColor: string;
  setNotice: (n: NoticeState) => void;
  onSaved: (a: AccountRow) => void;
  onClose: () => void;
}) {
  return (
    <SideDrawer visible={!!account} onClose={onClose} width={600} tint="frosted" bare>
      {account ? (
        <AccountForm
          key={account.id}
          a={account}
          self={account.id === selfId}
          classes={classes}
          nameOf={nameOf}
          accentColor={accentColor}
          setNotice={setNotice}
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : null}
    </SideDrawer>
  );
}

function AccountForm({
  a,
  self,
  classes,
  nameOf,
  accentColor,
  setNotice,
  onSaved,
  onClose,
}: {
  a: AccountRow;
  self: boolean;
  classes: ClassRow[];
  nameOf: (id: string) => string | null;
  accentColor: string;
  setNotice: (n: NoticeState) => void;
  onSaved: (a: AccountRow) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(a.full_name);
  const [role, setRole] = useState<ProfileRole>(a.role);
  const [saving, setSaving] = useState(false);
  // Phone: the confirm button full width, within thumb reach (design A5).
  const narrow = useWindowDimensions().width < 768;
  const shown = a.full_name || a.email || "(no name)";
  const first = firstOf(name || shown);
  const roleChanged = role !== a.role;
  const nameChanged = name.trim() !== a.full_name && name.trim().length > 0;
  const consequences = roleChangeConsequences({ ...a, full_name: name || a.full_name }, role, { classes, nameOf });

  const save = async () => {
    const nextName = name.trim();
    if (!nextName) return;
    setSaving(true);
    let next: AccountRow = a;
    if (nextName !== a.full_name) {
      const { error } = await updateProfileName(a.id, nextName);
      if (error) {
        setSaving(false);
        setNotice({ kind: "error", title: `Couldn't save ${shown}`, message: "Nothing was changed. Check the connection and try again.", retry: () => void save() });
        return;
      }
      next = { ...next, full_name: nextName };
    }
    if (roleChanged) {
      const { error } = await updateProfileRole(a.id, role);
      if (error) {
        setSaving(false);
        onSaved(next);
        setNotice({
          kind: "error",
          title: `Couldn't change ${shown}'s account`,
          message: `${next !== a ? "The name was saved, but the" : "The"} kind of account wasn't changed. Check the connection and try again.`,
          retry: () => void save(),
        });
        return;
      }
      next = { ...next, role, class_id: role === "student" ? next.class_id : null, approved: role === "teacher" ? true : next.approved };
    }
    setSaving(false);
    onSaved(next);
    setNotice({ kind: "success", message: roleChanged ? `${nextName} is now ${roleWithArticle(role)}.` : `Saved ${nextName}.` });
    onClose();
  };

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.formHead}>
          <Avatar name={shown} color={ROLE_COLORS[a.role]} size={56} />
          <View style={styles.flex}>
            <Text style={styles.formTitle} accessibilityRole="header" numberOfLines={1}>
              {shown}
              {self ? " (you)" : ""}
            </Text>
            <Text style={styles.formMeta} numberOfLines={1}>
              {[a.email, `joined ${joinedText(a.created_at)}`].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <CloseButton onPress={onClose} onFrosted />
        </View>

        <View>
          <Text style={styles.label}>Name</Text>
          <TextInput value={name} onChangeText={setName} accessibilityLabel="Name" placeholderTextColor={colors.textTertiary} style={styles.input} />
        </View>

        <View>
          <Text style={styles.label}>Kind of account</Text>
          <View style={styles.cards} accessibilityRole="radiogroup">
            {ROLES.map((r) => {
              const on = r === role;
              const locked = self && r !== a.role;
              return (
                <Pressable
                  key={r}
                  onPress={() => !locked && setRole(r)}
                  disabled={locked}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: locked }}
                  accessibilityLabel={`${ROLE_TEXT[r].title}. ${ROLE_TEXT[r].desc}`}
                  style={({ hovered }: any) => [styles.roleCard, on ? styles.roleCardOn : styles.roleCardOff, hovered && !on && !locked && styles.roleCardHover, locked && styles.locked, webCursor]}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                  <View style={styles.flex}>
                    <Text style={[styles.roleTitle, on && styles.onDark]}>{ROLE_TEXT[r].title}</Text>
                    <Text style={[styles.roleDesc, on && styles.onDarkMuted]}>{ROLE_TEXT[r].desc}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {self ? (
            <View style={styles.lockNote}>
              <ShieldIcon size={15} color={colors.textOnFrosted} />
              <Text style={styles.lockText}>You can't change your own role. Ask another admin to do it.</Text>
            </View>
          ) : null}
        </View>

        {roleChanged ? (
          <View style={styles.consequences} accessibilityLiveRegion="polite">
            <View style={styles.consHead}>
              <AlertCircleIcon size={17} color={colors.attention} />
              <Text style={styles.consTitle}>
                What changes if {first} becomes {roleWithArticle(role)}
              </Text>
            </View>
            {consequences.map((c) => (
              <Text key={c} style={styles.consLine}>
                {"•  "}
                {c}
              </Text>
            ))}
            {!narrow ? (
              <View style={styles.consActions}>
                <ActionButton label="Cancel" size="md" style={styles.consCancel} onPress={() => setRole(a.role)} disabled={saving} />
                <ActionButton
                  label={`Yes, make ${first} ${roleWithArticle(role)}`}
                  variant="primary"
                  size="md"
                  accentColor={accentColor}
                  loading={saving}
                  disabled={!name.trim()}
                  onPress={() => void save()}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {narrow && roleChanged ? (
        // Phone: the confirm takes the pinned footer, full width, within thumb reach.
        <View style={[styles.formFoot, styles.formFootNarrow]}>
          <ActionButton
            label={`Yes, make ${first} ${roleWithArticle(role)}`}
            variant="primary"
            size="lg"
            accentColor={accentColor}
            loading={saving}
            disabled={!name.trim()}
            onPress={() => void save()}
          />
          <ActionButton label="Cancel" size="lg" variant="ghost" onFrosted style={styles.outlineDark} onPress={() => setRole(a.role)} disabled={saving} />
        </View>
      ) : (
        <View style={styles.formFoot}>
          {roleChanged ? <Text style={[styles.lockText, styles.flex]}>Confirm the change above to save it.</Text> : null}
          <ActionButton label="Close" size="lg" variant="ghost" onFrosted style={styles.outlineDark} onPress={onClose} disabled={saving} />
          <ActionButton
            label="Save"
            size="lg"
            variant="primary"
            accentColor={accentColor}
            loading={saving && !roleChanged}
            disabled={roleChanged || !nameChanged}
            onPress={() => void save()}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  row8: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: colors.textPrimary },
  titlePhone: { fontSize: 26, lineHeight: 32, marginBottom: 12 },
  lede: { fontFamily: fonts.body, fontSize: 14.5, color: colors.textOnGlass, marginTop: 6, marginBottom: 20 },
  migrationNote: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accentCoral, marginBottom: 12 },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  inbox: { padding: 20, gap: 10, borderColor: colors.attention, borderWidth: 1.5, marginBottom: 18 },
  inboxHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  inboxTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary },
  countBadge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.attention, backgroundColor: "rgba(242,178,62,0.16)" },
  countText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.attention },
  inboxBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textOnGlass },
  inboxRow: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  inboxPerson: { flexDirection: "row", alignItems: "center", gap: 14 },
  inboxPersonPhone: { gap: 12 },
  turnDown: { borderWidth: 1.5, borderColor: colors.attention },
  inboxEmpty: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 18, marginBottom: 18 },
  inboxEmptyText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  link: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.primaryTealText, marginTop: 4 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  toolbarPhone: { flexDirection: "column", alignItems: "stretch" },
  search: { width: 300 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  switchLabel: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.textOnGlass },
  track: { width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: colors.neuWell },
  trackOn: { backgroundColor: colors.adminGray },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textOnGlass },
  knobOn: { transform: [{ translateX: 18 }], backgroundColor: "#FFFFFF" },
  table: { overflow: "hidden" },
  listPhone: { paddingHorizontal: 14 },
  thead: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  th: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textOnGlass },
  tr: { flexDirection: "row", alignItems: "center", minHeight: 60, paddingHorizontal: 18 },
  rule: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" },
  colName: { flex: 2, minWidth: 0, paddingRight: 12 },
  colRole: { width: 120 },
  colClass: { flex: 2.2, minWidth: 0, paddingRight: 12 },
  colJoined: { width: 110 },
  colEdit: { width: 52, alignItems: "flex-end" },
  person: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnGlass, marginTop: 2 },
  cellText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.textPrimary },
  cellMuted: { color: colors.textOnGlass },
  pending: { color: colors.attention },
  groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.03)", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  groupTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
  groupCount: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textOnGlass },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 66, paddingVertical: 8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chev: { transform: [{ rotate: "-90deg" }], padding: 6 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 36, paddingHorizontal: 24 },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary, textAlign: "center" },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textOnGlass, textAlign: "center", maxWidth: 460 },
  muted: { fontFamily: fonts.body, fontSize: 13, color: colors.textOnGlass, padding: 18 },
  skelRow: { flexDirection: "row", alignItems: "center", gap: 16, height: 60, paddingHorizontal: 18 },
  skelDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.07)" },
  skelBar: { height: 12, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.07)" },
  // frosted drawer: textOnFrosted only
  formScroll: { padding: 28, gap: 18 },
  formHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  formTitle: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: colors.textOnFrosted },
  formMeta: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnFrosted, marginTop: 2 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textOnFrosted, marginBottom: 7 },
  input: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  cards: { gap: 10 },
  roleCard: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 68, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.md, borderWidth: 1.5 },
  roleCardOn: { backgroundColor: "#1E222B", borderColor: "#1E222B" },
  roleCardOff: { borderColor: "rgba(30,31,38,0.3)" },
  roleCardHover: { backgroundColor: "rgba(30,31,38,0.06)" },
  locked: { opacity: 0.55 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.textOnFrosted, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: "#FFFFFF" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFFFFF" },
  roleTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: colors.textOnFrosted },
  roleDesc: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnFrosted, marginTop: 2 },
  onDark: { color: "#FFFFFF" },
  onDarkMuted: { color: colors.textOnGlass },
  lockNote: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  lockText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textOnFrosted },
  consequences: { padding: 18, borderRadius: radii.md, backgroundColor: "#1E222B", gap: 8 },
  consHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  consTitle: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15, color: "#FFFFFF" },
  consLine: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textPrimary },
  consActions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 8 },
  formFootNarrow: { flexDirection: "column", alignItems: "stretch", paddingHorizontal: 16 },
  consCancel: { borderWidth: 1.5, borderColor: colors.border },
  formFoot: {
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
});
