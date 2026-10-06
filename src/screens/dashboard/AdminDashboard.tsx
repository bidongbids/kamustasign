// Admin dashboard: manage accounts (role + class assignment) and classes
// (create/assign teacher/delete). Real reads/writes against Supabase.
//
// Note: there's no "delete account" action here - profiles.id references
// auth.users(id), and auth.users can only be deleted via Supabase's Admin
// API (a service-role key), which this client-only app deliberately doesn't
// have. Deleting just the profiles row would leave a login with no profile,
// which breaks more than it fixes. Role/class reassignment covers the real
// account-management need for now.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import DashboardShell, { DashboardCard, dashboardStyles as ds } from "./DashboardShell";
import AuthButton from "../../components/auth/AuthButton";
import AuthTextField from "../../components/auth/AuthTextField";
import { colors, fonts, spacing } from "../../theme/theme";
import {
  getMyProfile,
  listAllProfiles,
  updateProfileRoleAndClass,
  listAllClasses,
  listTeacherProfiles,
  adminCreateClass,
  adminDeleteClass,
  toOne,
  type Profile,
  type ProfileRole,
  type ClassRow,
} from "../../lib/queries";

type ProfileWithClass = Profile & {
  classes: { name: string } | { name: string }[] | null;
};
type ClassWithTeacher = ClassRow & {
  profiles: { full_name: string } | { full_name: string }[] | null;
};

const ROLES: ProfileRole[] = ["student", "teacher", "admin"];

type Props = {
  accentColor: string;
  onSignOut: () => void;
  onExitToRoleSelect: () => void;
};

export default function AdminDashboard({ accentColor, onSignOut, onExitToRoleSelect }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<ProfileWithClass[]>([]);
  const [classes, setClasses] = useState<ClassWithTeacher[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [newClassName, setNewClassName] = useState("");
  const [newClassTeacherId, setNewClassTeacherId] = useState<string | null>(null);
  const [creatingClass, setCreatingClass] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: me, error: profileError } = await getMyProfile();
    if (profileError || !me) {
      setError(profileError?.message ?? "Couldn't load your profile.");
      setLoading(false);
      return;
    }
    setProfile(me as Profile);

    const [{ data: p, error: pErr }, { data: c, error: cErr }, { data: t, error: tErr }] = await Promise.all([
      listAllProfiles(),
      listAllClasses(),
      listTeacherProfiles(),
    ]);
    if (pErr) setError(pErr.message);
    else setProfiles((p as unknown as ProfileWithClass[]) ?? []);
    if (cErr) setError((prev) => prev ?? cErr.message);
    else setClasses((c as unknown as ClassWithTeacher[]) ?? []);
    if (tErr) setError((prev) => prev ?? tErr.message);
    else setTeachers((t as { id: string; full_name: string }[]) ?? []);

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdateProfile = async (p: ProfileWithClass, role: ProfileRole, classId: string | null) => {
    const { error: err } = await updateProfileRoleAndClass(p.id, role, classId);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    setCreatingClass(true);
    const { error: err } = await adminCreateClass(newClassName.trim(), newClassTeacherId);
    setCreatingClass(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNewClassName("");
    setNewClassTeacherId(null);
    load();
  };

  const handleDeleteClass = async (id: string) => {
    const { error: err } = await adminDeleteClass(id);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  };

  // Group classes by the teacher who owns them (via classes.teacher_id),
  // so the admin sees each teacher's classes together instead of one flat
  // list. Classes with no teacher_id land in a trailing "Unassigned" group.
  type ClassGroup = { key: string; teacherName: string; items: ClassWithTeacher[] };
  const classGroups: ClassGroup[] = (() => {
    const map = new Map<string, ClassGroup>();
    for (const c of classes) {
      const teacher = toOne(c.profiles);
      const key = c.teacher_id ?? "unassigned";
      const teacherName = teacher?.full_name || "Unassigned";
      if (!map.has(key)) map.set(key, { key, teacherName, items: [] });
      map.get(key)!.items.push(c);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === "unassigned") return 1;
      if (b.key === "unassigned") return -1;
      return a.teacherName.localeCompare(b.teacherName);
    });
  })();

  return (
    <DashboardShell
      accentColor={accentColor}
      roleLabel="Admin"
      userName={profile?.full_name ?? "..."}
      onSignOut={onSignOut}
      onExitToRoleSelect={onExitToRoleSelect}
    >
      {error ? <Text style={ds.errorText}>{error}</Text> : null}

      {loading ? (
        <Text style={ds.emptyText}>Loading...</Text>
      ) : (
        <>
          <Text style={ds.sectionTitle}>Accounts</Text>
          <DashboardCard>
            <Text style={ds.itemMeta}>
              Emails aren't shown here - they live in Supabase's auth.users table, not exposed to the
              client app by design. Name/role/class come from the public profiles table.
            </Text>
            {profiles.length === 0 ? (
              <Text style={ds.emptyText}>No accounts yet.</Text>
            ) : (
              profiles.map((p, i) => {
                const profileClass = toOne(p.classes);
                return (
                <View key={p.id} style={[ds.listItem, i === 0 && ds.listItemFirst]}>
                  <Text style={ds.itemTitle}>{p.full_name || "(no name)"}</Text>
                  <Text style={ds.itemMeta}>
                    {p.role} {profileClass ? `· ${profileClass.name}` : "· no class"}
                  </Text>

                  {editingProfileId === p.id ? (
                    <View style={styles.editForm}>
                      <Text style={styles.miniLabel}>Role</Text>
                      <View style={ds.pillRow}>
                        {ROLES.map((r) => (
                          <Pressable
                            key={r}
                            onPress={() => handleUpdateProfile(p, r, p.class_id)}
                            style={[ds.pill, { borderColor: accentColor }, p.role === r && { backgroundColor: accentColor }]}
                          >
                            <Text style={[ds.pillText, { color: p.role === r ? colors.textOnPrimary : colors.textOnFrosted }]}>
                              {r}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={styles.miniLabel}>Class</Text>
                      <View style={ds.pillRow}>
                        <Pressable
                          onPress={() => handleUpdateProfile(p, p.role, null)}
                          style={[ds.pill, { borderColor: accentColor }, !p.class_id && { backgroundColor: accentColor }]}
                        >
                          <Text style={[ds.pillText, { color: !p.class_id ? colors.textOnPrimary : colors.textOnFrosted }]}>none</Text>
                        </Pressable>
                        {classes.map((c) => (
                          <Pressable
                            key={c.id}
                            onPress={() => handleUpdateProfile(p, p.role, c.id)}
                            style={[ds.pill, { borderColor: accentColor }, p.class_id === c.id && { backgroundColor: accentColor }]}
                          >
                            <Text style={[ds.pillText, { color: p.class_id === c.id ? colors.textOnPrimary : colors.textOnFrosted }]}>
                              {c.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <AuthButton label="Done" variant="secondary" onPress={() => setEditingProfileId(null)} style={styles.doneButton} />
                    </View>
                  ) : (
                    <AuthButton
                      label="Edit"
                      variant="secondary"
                      accentColor={accentColor}
                      onPress={() => setEditingProfileId(p.id)}
                      style={styles.inlineButton}
                    />
                  )}
                </View>
                );
              })
            )}
          </DashboardCard>

          <Text style={ds.sectionTitle}>Classes</Text>
          <DashboardCard title="Create a class">
            <AuthTextField label="New class name" value={newClassName} onChangeText={setNewClassName} placeholder="e.g. Grade 7 - Mabini" />
            <Text style={styles.miniLabel}>Teacher</Text>
            <View style={ds.pillRow}>
              {teachers.length === 0 ? (
                <Text style={ds.emptyText}>No teacher accounts yet - create one first.</Text>
              ) : (
                teachers.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => setNewClassTeacherId(t.id)}
                    style={[ds.pill, { borderColor: accentColor }, newClassTeacherId === t.id && { backgroundColor: accentColor }]}
                  >
                    <Text style={[ds.pillText, { color: newClassTeacherId === t.id ? colors.textOnPrimary : colors.textOnFrosted }]}>
                      {t.full_name}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
            <View style={{ height: spacing.sm }} />
            <AuthButton
              label={creatingClass ? "Creating..." : "Create class"}
              accentColor={accentColor}
              loading={creatingClass}
              onPress={handleCreateClass}
            />
          </DashboardCard>

          {classGroups.length === 0 ? (
            <DashboardCard>
              <Text style={ds.emptyText}>No classes yet.</Text>
            </DashboardCard>
          ) : (
            classGroups.map((group) => (
              <DashboardCard key={group.key} title={group.teacherName}>
                {group.items.map((c, i) => (
                  <View key={c.id} style={[ds.listItem, i === 0 && ds.listItemFirst, ds.spaceBetween]}>
                    <Text style={ds.itemTitle}>{c.name}</Text>
                    <AuthButton
                      label="Delete"
                      variant="secondary"
                      onPress={() => handleDeleteClass(c.id)}
                      style={styles.inlineButton}
                    />
                  </View>
                ))}
              </DashboardCard>
            ))
          )}
        </>
      )}
    </DashboardShell>
  );
}

const styles = StyleSheet.create({
  inlineButton: { minWidth: 90, marginTop: spacing.xs },
  doneButton: { minWidth: 90, marginTop: spacing.sm },
  editForm: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  miniLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textOnFrostedMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
});
