// Admin dashboard: account management only - names and roles, with the
// sign-in email shown via admin_list_accounts (0008). Classes, rosters and
// modules belong to teachers (0009_teacher_classroom.sql); an admin can see
// which class a student is in but not change it.
//
// Note: there's no "create/delete account" action here - profiles.id
// references auth.users(id), and auth users can only be created or deleted
// through Supabase's Admin API (a service-role key), which this client-only
// app deliberately doesn't have. People sign up themselves as a student or a
// teacher; only an admin can make someone an admin.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import DashboardShell, { DashboardCard, dashboardStyles as ds } from "./DashboardShell";
import {
  ActionButton,
  Avatar,
  ChoicePills,
  FieldLabel,
  Notice,
  ROLE_COLORS,
  RoleBadge,
  SearchField,
  StatTile,
  type NoticeState,
} from "./ManageKit";
import { PencilIcon } from "../../components/icons/UiIcons";
import { colors, fonts, radii, spacing } from "../../theme/theme";
import {
  getMyProfile,
  adminListAccounts,
  updateProfileName,
  updateProfileRole,
  listAllClasses,
  type AccountRow,
  type Profile,
  type ProfileRole,
  type ClassRow,
} from "../../lib/queries";

type RoleFilter = "all" | ProfileRole;

const ROLES: ProfileRole[] = ["student", "teacher", "admin"];

type Props = {
  accentColor: string;
  onSignOut: () => void;
  onExitToRoleSelect: () => void;
};

export default function AdminDashboard({ accentColor, onSignOut, onExitToRoleSelect }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [emailsAvailable, setEmailsAvailable] = useState(true);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NoticeState>(null);

  const load = useCallback(async () => {
    const { data: me, error: profileError } = await getMyProfile();
    if (profileError || !me) {
      setNotice({ kind: "error", message: profileError?.message ?? "Couldn't load your profile." });
      setLoading(false);
      return;
    }
    setProfile(me as Profile);

    const [acc, { data: c, error: cErr }] = await Promise.all([adminListAccounts(), listAllClasses()]);
    const firstError = acc.error ?? cErr;
    if (firstError) setNotice({ kind: "error", message: firstError.message });
    if (acc.data) setAccounts(acc.data);
    setEmailsAvailable(acc.emailsAvailable);
    if (!cErr) setClasses((c as ClassRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const classNameById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);
  const count = (role: ProfileRole) => accounts.filter((a) => a.role === role).length;

  return (
    <DashboardShell
      accentColor={accentColor}
      roleLabel="Admin"
      userName={profile?.full_name ?? "..."}
      onSignOut={onSignOut}
      onExitToRoleSelect={onExitToRoleSelect}
      contentMaxWidth={1100}
    >
      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      {loading ? (
        <DashboardCard>
          <Text style={ds.emptyText}>Loading accounts…</Text>
        </DashboardCard>
      ) : (
        <>
          <View style={styles.stats}>
            <StatTile label="Accounts" value={accounts.length} />
            <StatTile label="Students" value={count("student")} color={ROLE_COLORS.student} />
            <StatTile label="Teachers" value={count("teacher")} color={ROLE_COLORS.teacher} />
            <StatTile label="Admins" value={count("admin")} color={ROLE_COLORS.admin} />
          </View>
          <Text style={styles.scopeNote}>
            Teachers create their own classes and invite students. Here you manage who has which kind of account.
          </Text>

          <AccountsList
            accentColor={accentColor}
            selfId={profile?.id ?? null}
            accounts={accounts}
            classNameById={classNameById}
            emailsAvailable={emailsAvailable}
            setNotice={setNotice}
            onSaved={(next) => setAccounts((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
          />
        </>
      )}
    </DashboardShell>
  );
}

function AccountsList({
  accentColor,
  selfId,
  accounts,
  classNameById,
  emailsAvailable,
  setNotice,
  onSaved,
}: {
  accentColor: string;
  selfId: string | null;
  accounts: AccountRow[];
  classNameById: Map<string, string>;
  emailsAvailable: boolean;
  setNotice: (n: NoticeState) => void;
  onSaved: (a: AccountRow) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<ProfileRole>("student");
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);

  const q = search.trim().toLowerCase();
  const visible = accounts.filter((a) => {
    if (filter !== "all" && a.role !== filter) return false;
    return !q || a.full_name.toLowerCase().includes(q) || (a.email ?? "").toLowerCase().includes(q);
  });

  const startEdit = (a: AccountRow) => {
    setEditingId(a.id);
    setDraftRole(a.role);
    setDraftName(a.full_name);
  };

  const save = async (a: AccountRow) => {
    const name = draftName.trim();
    if (!name) return;
    setSaving(true);
    let next: AccountRow = a;
    if (name !== a.full_name) {
      const { error } = await updateProfileName(a.id, name);
      if (error) {
        setSaving(false);
        setNotice({ kind: "error", message: error.message });
        return;
      }
      next = { ...next, full_name: name };
    }
    if (draftRole !== a.role) {
      const { error } = await updateProfileRole(a.id, draftRole);
      if (error) {
        setSaving(false);
        onSaved(next);
        setNotice({ kind: "error", message: error.message });
        return;
      }
      next = { ...next, role: draftRole, class_id: draftRole === "student" ? next.class_id : null };
    }
    setSaving(false);
    onSaved(next);
    setEditingId(null);
    setNotice({ kind: "success", message: `Saved ${name || a.email || "account"}.` });
  };

  const leavesClass = (a: AccountRow) => a.role === "student" && !!a.class_id && draftRole !== "student";

  return (
    <>
      {!emailsAvailable && (
        <Text style={styles.migrationNote}>
          Emails are hidden until the 0008_class_management.sql migration is run in the Supabase SQL Editor.
        </Text>
      )}
      <SearchField value={search} onChangeText={setSearch} placeholder="Search by name or email" />
      <View style={styles.filterRow}>
        <ChoicePills
          options={[
            { key: "all", label: `All (${accounts.length})` },
            { key: "student", label: "Students" },
            { key: "teacher", label: "Teachers" },
            { key: "admin", label: "Admins" },
          ]}
          value={filter}
          onChange={(k) => setFilter(k as RoleFilter)}
          accentColor={accentColor}
        />
      </View>

      <DashboardCard style={styles.card}>
        {visible.length === 0 ? (
          <Text style={ds.emptyText}>No accounts match.</Text>
        ) : (
          visible.map((a, i) => {
            const isSelf = a.id === selfId;
            const editing = editingId === a.id;
            return (
              <View key={a.id} style={[ds.listItem, i === 0 && ds.listItemFirst]}>
                <View style={styles.personRow}>
                  <Avatar name={a.full_name} color={ROLE_COLORS[a.role]} />
                  <View style={styles.flex}>
                    <View style={styles.nameRow}>
                      <Text style={[ds.itemTitle, styles.flexShrink]} numberOfLines={1}>
                        {a.full_name || "(no name)"}
                        {isSelf ? " (you)" : ""}
                      </Text>
                      <RoleBadge role={a.role} />
                    </View>
                    <Text style={ds.itemMeta} numberOfLines={1}>
                      {[
                        a.email,
                        a.role === "student" ? (a.class_id ? classNameById.get(a.class_id) ?? "Unknown class" : "No class") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  {!editing && (
                    <ActionButton
                      label={`Edit ${a.full_name || "account"}`}
                      iconOnly
                      icon={(c) => <PencilIcon size={16} color={c} />}
                      onPress={() => startEdit(a)}
                    />
                  )}
                </View>

                {editing && (
                  <View style={styles.panel}>
                    <FieldLabel>Name</FieldLabel>
                    <TextInput
                      value={draftName}
                      onChangeText={setDraftName}
                      accessibilityLabel="Name"
                      placeholderTextColor={colors.textTertiary}
                      style={styles.input}
                    />
                    <View style={styles.gapTop}>
                      <FieldLabel>Role</FieldLabel>
                      <ChoicePills
                        options={ROLES.map((r) => ({ key: r, label: r[0].toUpperCase() + r.slice(1) }))}
                        value={draftRole}
                        onChange={setDraftRole}
                        accentColor={accentColor}
                      />
                    </View>
                    {isSelf && draftRole !== "admin" && (
                      <Text style={styles.warn}>
                        You'd lose access to this dashboard. Ask another admin to change your role.
                      </Text>
                    )}
                    {leavesClass(a) && (
                      <Text style={styles.warn}>
                        They'll leave {classNameById.get(a.class_id!) ?? "their class"} - only students are in classes.
                      </Text>
                    )}
                    <View style={[styles.row8, styles.gapTop]}>
                      <ActionButton
                        label="Save"
                        variant="primary"
                        accentColor={accentColor}
                        onPress={() => save(a)}
                        loading={saving}
                        disabled={(isSelf && draftRole !== "admin") || !draftName.trim()}
                      />
                      <ActionButton label="Cancel" variant="ghost" onPress={() => setEditingId(null)} disabled={saving} />
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </DashboardCard>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  row8: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  gapTop: { marginTop: spacing.md },
  card: { marginTop: spacing.md },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: spacing.sm },
  scopeNote: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginVertical: spacing.md },
  panel: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterRow: { marginTop: spacing.sm },
  input: {
    minHeight: 42,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    maxWidth: 420,
  },
  warn: { fontFamily: fonts.body, fontSize: 12, color: colors.needsPractice, marginTop: 8 },
  migrationNote: { fontFamily: fonts.body, fontSize: 12, color: colors.accentCoral, marginBottom: spacing.sm },
});
