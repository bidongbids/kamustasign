// Manual step-switcher for the auth flow (Login / Register / Verify2FA /
// Setup2FA / ForgotPassword), matching the same useState-based routing App.tsx
// already uses elsewhere in this codebase — see docs/KamustaSign_UI_CRUD_Handoff.md
// Section 4. Wiring the installed-but-unused @react-navigation stack is a
// separate, later step (Section 6, step 3), not folded in here.
import React, { useEffect, useState } from "react";
import { Platform, View, StyleSheet } from "react-native";
import LoginScreen, { Role } from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import Verify2FAScreen from "../screens/auth/Verify2FAScreen";
import Setup2FAScreen from "../screens/auth/Setup2FAScreen";
import ForgotPasswordScreen from "../screens/auth/ForgotPasswordScreen";
import type { AuthGateState } from "../lib/authGate";

type Step = "login" | "register" | "verify2fa" | "setup2fa" | "forgot";

// "Forgot password?" is opt-in: reset emails need custom SMTP in Supabase
// (its built-in mailer only sends to the project team), and the link has to
// open a web page - Electron's app:// shell can't receive it.
const passwordResetEnabled =
  process.env.EXPO_PUBLIC_PASSWORD_RESET === "true" &&
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  window.location.protocol.startsWith("http");

type Props = {
  role: Role;
  accentColor: string;
  authGate: AuthGateState;
  onRequestExit: () => void;
  onSetupPromptActive: (active: boolean) => void;
};

export default function AuthNavigator({ role, accentColor, authGate, onRequestExit, onSetupPromptActive }: Props) {
  // A reload mid-2FA keeps the password step's (aal1) session, so start at
  // the code instead of asking for the password again.
  const [step, setStep] = useState<Step>(authGate.status === "needsMfa" ? "verify2fa" : "login");
  // Carries the typed email between Login, Register and Forgot password.
  const [emailHint, setEmailHint] = useState("");
  const canRegister = role !== "admin";

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
          role={role}
          accentColor={accentColor}
          canRegister={canRegister}
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
          onBack={onRequestExit}
        />
      )}

      {step === "register" && role !== "admin" && (
        <RegisterScreen
          role={role}
          accentColor={accentColor}
          onNavigateLogin={toLogin}
          onRegistered={() => {
            // Fresh account, session already exists, no factor enrolled yet.
            // Teachers are offered 2FA before the dashboard; students go
            // straight in (Setup2FAScreen explains why).
            if (role === "teacher") {
              onSetupPromptActive(true);
              setStep("setup2fa");
            }
          }}
        />
      )}

      {step === "forgot" && (
        <ForgotPasswordScreen role={role} accentColor={accentColor} initialEmail={emailHint} onBack={toLogin} />
      )}

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
          onDone={() => {
            onSetupPromptActive(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
