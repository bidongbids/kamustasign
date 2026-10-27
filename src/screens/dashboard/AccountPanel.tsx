// "Your account", opened from the name in the dashboard header
// (DashboardShell): change your name and password, and turn 2FA on or off.
// Teachers and admins are offered 2FA - they can see other people's data.
// Students only see the 2FA section when their account already has it, so
// they can turn it off (Setup2FAScreen explains why they aren't offered it).
// Frosted card, so the auth screens' fields, buttons and styles fit as-is.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import GlassCard from "../../components/GlassCard";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import TwoFactorSetup from "../../components/auth/TwoFactorSetup";
import { CloseIcon } from "../../components/icons/UiIcons";
import { supabase } from "../../lib/supabase";
import { changePassword, getTotpFactor, turnOffTwoFactor } from "../../lib/account";
import { NAME_MAX, cleanTotpCode, newPasswordProblem } from "../../lib/authForms";
import { updateProfileName, type Profile } from "../../lib/queries";
import { colors, fonts, radii, spacing } from "../../theme/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  accentColor: string;
  profile: Profile;
  onProfileChange: (p: Profile) => void;
};

type Status = { kind: "ok" | "error"; text: string } | null;

export default function AccountPanel({ visible, onClose, accentColor, profile, onProfileChange }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close account settings" />
        <ScrollView style={styles.scroller} contentContainerStyle={styles.scrollerContent}>
          <GlassCard tint="frosted" dropShadow radius={radii.lg} padding={spacing.lg}>
            <View style={styles.header}>
              <Text style={styles.title} accessibilityRole="header">
                Your account
              </Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <CloseIcon size={18} color={colors.textOnFrostedMuted} />
              </Pressable>
            </View>
            {/* Mounted per opening, so every field starts fresh. */}
            {visible && <AccountSections accentColor={accentColor} profile={profile} onProfileChange={onProfileChange} />}
          </GlassCard>
        </ScrollView>
      </View>
    </Modal>
  );
}

function AccountSections({ accentColor, profile, onProfileChange }: Omit<Props, "visible" | "onClose">) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);

  return (
    <>
      <Text style={styles.meta}>{email ? `Signed in as ${email}` : " "}</Text>
      <NameSection accentColor={accentColor} profile={profile} onProfileChange={onProfileChange} />
      <PasswordSection accentColor={accentColor} email={email} />
      <TwoFactorSection accentColor={accentColor} role={profile.role} />
    </>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <Text style={[styles.status, status.kind === "error" && styles.statusError]} accessibilityLiveRegion="polite">
      {status.text}
    </Text>
  );
}

function NameSection({ accentColor, profile, onProfileChange }: Omit<Props, "visible" | "onClose">) {
  const [name, setName] = useState(profile.full_name);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const clean = name.trim();
  const unchanged = !clean || clean === profile.full_name;

  const save = async () => {
    if (saving || unchanged) return;
    setSaving(true);
    setStatus(null);
    const { error } = await updateProfileName(profile.id, clean);
    setSaving(false);
    if (error) {
      setStatus({ kind: "error", text: error.message });
      return;
    }
    onProfileChange({ ...profile, full_name: clean });
    setStatus({ kind: "ok", text: "Name saved." });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Name</Text>
      <AuthTextField
        label="Full name"
        value={name}
        onChangeText={setName}
        maxLength={NAME_MAX}
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        enterKeyHint="done"
        onSubmitEditing={save}
      />
      <StatusLine status={status} />
      <AuthButton label="Save name" onPress={save} loading={saving} disabled={unchanged} accentColor={accentColor} />
    </View>
  );
}

function PasswordSection({ accentColor, email }: { accentColor: string; email: string | null }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const save = async () => {
    if (saving) return;
    setStatus(null);
    if (!email) {
      setStatus({ kind: "error", text: "Couldn't read your account's email. Close this and try again." });
      return;
    }
    if (!current) {
      setStatus({ kind: "error", text: "Enter your current password." });
      return;
    }
    const problem = newPasswordProblem(next, confirm);
    if (problem) {
      setStatus({ kind: "error", text: problem });
      return;
    }
    setSaving(true);
    const { error } = await changePassword(email, current, next);
    setSaving(false);
    if (error) {
      setStatus({ kind: "error", text: error });
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setStatus({ kind: "ok", text: "Password changed. Use the new one next time you log in." });
  };

  return (
    <View style={[styles.section, styles.sectionRule]}>
      <Text style={styles.sectionTitle}>Password</Text>
      <AuthTextField
        label="Current password"
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        enterKeyHint="next"
        submitBehavior="submit"
        onSubmitEditing={() => nextRef.current?.focus()}
      />
      <AuthTextField
        ref={nextRef}
        label="New password"
        value={next}
        onChangeText={setNext}
        secureTextEntry
        placeholder="At least 8 characters"
        textContentType="newPassword"
        autoComplete="new-password"
        enterKeyHint="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <AuthTextField
        ref={confirmRef}
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        enterKeyHint="done"
        onSubmitEditing={save}
      />
      <StatusLine status={status} />
      <AuthButton label="Change password" onPress={save} loading={saving} accentColor={accentColor} />
    </View>
  );
}

function TwoFactorSection({ accentColor, role }: { accentColor: string; role: Profile["role"] }) {
  // undefined while loading; null = no 2FA on this account.
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"idle" | "setup" | "turnOff">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  // A full code submits itself, so typing and Enter can both fire one.
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    const { factorId: id, error } = await getTotpFactor();
    setFactorId(id);
    if (error) setStatus({ kind: "error", text: error });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A student's section only appears once we know they already have 2FA.
  if (role === "student" && !factorId) return null;

  const turnOff = async (value: string) => {
    if (!factorId || busyRef.current) return;
    const digits = cleanTotpCode(value);
    if (digits.length !== 6) {
      setStatus({ kind: "error", text: "Enter the 6-digit code from your authenticator app." });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setStatus(null);
    const { error } = await turnOffTwoFactor(factorId, digits);
    busyRef.current = false;
    setBusy(false);
    if (error) {
      setStatus({ kind: "error", text: error });
      setCode("");
      return;
    }
    setFactorId(null);
    setMode("idle");
    setCode("");
    setStatus({ kind: "ok", text: "2FA is off. You'll log in with just your password." });
  };

  return (
    <View style={[styles.section, styles.sectionRule]}>
      <Text style={styles.sectionTitle}>Two-factor sign-in (2FA)</Text>
      {factorId === undefined ? (
        <Text style={styles.body}>Checking…</Text>
      ) : mode === "setup" ? (
        <>
          <Text style={styles.body}>
            Scan this QR code with Google Authenticator, Authy, or a similar app, then enter the code it shows.
          </Text>
          <TwoFactorSetup
            accentColor={accentColor}
            cancelLabel="Cancel"
            onDone={(enabled) => {
              setMode("idle");
              if (!enabled) return;
              setStatus({ kind: "ok", text: "2FA is on. Logging in will ask for a code from your phone." });
              load();
            }}
          />
        </>
      ) : factorId ? (
        <>
          <Text style={styles.body}>On. Logging in asks for a code from your authenticator app.</Text>
          {mode === "turnOff" && (
            <AuthTextField
              label="6-digit code"
              value={code}
              onChangeText={(text) => {
                const digits = cleanTotpCode(text);
                setCode(digits);
                if (digits.length === 6) turnOff(digits);
              }}
              keyboardType="number-pad"
              placeholder="123456"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              enterKeyHint="done"
              autoFocus
              onSubmitEditing={() => turnOff(code)}
            />
          )}
          <StatusLine status={status} />
          {mode === "turnOff" ? (
            <>
              <AuthButton label="Turn off 2FA" onPress={() => turnOff(code)} loading={busy} accentColor={accentColor} />
              <View style={styles.gapTop}>
                <AuthButton
                  label="Keep 2FA on"
                  variant="secondary"
                  onPress={() => {
                    setMode("idle");
                    setCode("");
                    setStatus(null);
                  }}
                />
              </View>
            </>
          ) : (
            <AuthButton
              label="Turn off 2FA"
              variant="secondary"
              onPress={() => {
                setMode("turnOff");
                setStatus({ kind: "ok", text: "Enter a code from your authenticator app to confirm." });
              }}
            />
          )}
        </>
      ) : (
        <>
          <Text style={styles.body}>
            Off. With 2FA, logging in also needs a code from an app on your phone, so a stolen password isn't enough.
          </Text>
          <StatusLine status={status} />
          <AuthButton
            label="Set up 2FA"
            onPress={() => {
              setMode("setup");
              setStatus(null);
            }}
            accentColor={accentColor}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  // Shrinks to the window and scrolls when the 2FA QR code makes the card tall.
  scroller: { width: "100%", maxWidth: 480, flexGrow: 0, flexShrink: 1 },
  scrollerContent: { paddingVertical: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.textOnFrosted },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.textOnFrostedMuted, marginTop: 2 },
  section: { marginTop: spacing.lg },
  sectionRule: { borderTopWidth: 1, borderTopColor: "rgba(30,31,38,0.14)", paddingTop: spacing.lg },
  sectionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textOnFrosted, marginBottom: spacing.sm },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textOnFrostedMuted, marginBottom: spacing.md },
  // Green and gold don't read on frosted glass (theme.ts), so a saved
  // message is plain dark text; errors keep the auth screens' red.
  status: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textOnFrosted, marginBottom: spacing.sm },
  statusError: { color: colors.needsPractice },
  gapTop: { marginTop: spacing.sm },
});
