// Manual step-switcher for the auth flow (Login / Register / Verify2FA /
// Setup2FA / ForgotPassword), matching the same useState-based routing App.tsx
// already uses elsewhere in this codebase — see docs/KamustaSign_UI_CRUD_Handoff.md
// Section 4. Wiring the installed-but-unused @react-navigation stack is a
// separate, later step (Section 6, step 3), not folded in here.
//
// The login step is the app's start screen: there's no role to pick before
// signing in (the account's role decides the dashboard), and the sign-up
// form asks for the kind of account instead.
import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import LoginScreen from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import Verify2FAScreen from "../screens/auth/Verify2FAScreen";
import Setup2FAScreen from "../screens/auth/Setup2FAScreen";
import ForgotPasswordScreen from "../screens/auth/ForgotPasswordScreen";
import ConfirmEmailScreen from "../screens/auth/ConfirmEmailScreen";
import type { AuthGateState } from "../lib/authGate";
import type { ProfileRole } from "../lib/queries";

type Step = "login" | "register" | "verify2fa" | "setup2fa" | "forgot" | "confirmEmail";

// "Forgot password?" is opt-in: reset emails need custom SMTP in Supabase
// (its built-in mailer only sends to the project team). The email carries a
// code, typed into ForgotPasswordScreen, so it works in the desktop app too.
// LCSign's project has SMTP since 2026-11-04; .env turns this on.
const passwordResetEnabled = process.env.EXPO_PUBLIC_PASSWORD_RESET === "true";

type Props = {
  accentColor: string;
  authGate: AuthGateState;
  onOpenTranslator: () => void;
  /** No internet: LoginScreen says so and offers the Classroom without an account. */
  offline?: boolean;
  onOpenClassroom?: () => void;
  /** A session survived a reload: the start screen says whose it is. */
  signedInAs: { name: string; role: ProfileRole | null } | null;
  onContinueSignedIn: () => void;
  onSetupPromptActive: (active: boolean) => void;
};

export default function AuthNavigator({
  accentColor,
  authGate,
  onOpenTranslator,
  offline,
  onOpenClassroom,
  signedInAs,
  onContinueSignedIn,
  onSetupPromptActive,
}: Props) {
  // A reload mid-2FA keeps the password step's (aal1) session, so start at
  // the code instead of asking for the password again.
  const [step, setStep] = useState<Step>(authGate.status === "needsMfa" ? "verify2fa" : "login");
  // Carries the typed email between Login, Register and Forgot password.
  const [emailHint, setEmailHint] = useState("");

  useEffect(() => {
    if (authGate.status === "needsMfa") setStep("verify2fa");
  }, [authGate.status]);

  const toLogin = (email?: string) => {
    if (email) setEmailHint(email);
    setStep("login");
  };

  return (
    <View style={styles.flex}>
      {step === "login" && (
        <LoginScreen
          accentColor={accentColor}
          initialEmail={emailHint}
          onNavigateRegister={() => setStep("register")}
          onNeedsMfa={() => setStep("verify2fa")}
          onForgotPassword={
            passwordResetEnabled
              ? (email) => {
                  setEmailHint(email);
                  setStep("forgot");
                }
              : undefined
          }
          onConfirmEmail={(email) => {
            setEmailHint(email);
            setStep("confirmEmail");
          }}
          onOpenTranslator={onOpenTranslator}
          offline={offline}
          onOpenClassroom={onOpenClassroom}
          signedInAs={signedInAs}
          onContinueSignedIn={onContinueSignedIn}
          onSignOut={() => authGate.signOut()}
          notice={authGate.linkError}
          onDismissNotice={authGate.clearLinkError}
        />
      )}

      {step === "register" && (
        <RegisterScreen
          accentColor={accentColor}
          onNavigateLogin={toLogin}
          onRegistered={(role) => {
            // Fresh account, session already exists, no factor enrolled yet.
            // Teachers are offered 2FA before the approval notice; students
            // go straight there (Setup2FAScreen explains why). Admins must
            // have 2FA (0016): App sends them to the setup with no skip.
            if (role === "teacher") {
              onSetupPromptActive(true);
              setStep("setup2fa");
            }
          }}
        />
      )}

      {step === "forgot" && <ForgotPasswordScreen accentColor={accentColor} initialEmail={emailHint} onBack={toLogin} />}

      {step === "confirmEmail" && <ConfirmEmailScreen accentColor={accentColor} email={emailHint} onBack={toLogin} />}

      {step === "verify2fa" && (
        <Verify2FAScreen
          accentColor={accentColor}
          factorId={authGate.mfaFactorId}
          onVerified={authGate.refresh}
          onCancel={async () => {
            await authGate.signOut();
            setStep("login");
          }}
        />
      )}

      {step === "setup2fa" && (
        <Setup2FAScreen
          accentColor={accentColor}
          onDone={() => onSetupPromptActive(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
