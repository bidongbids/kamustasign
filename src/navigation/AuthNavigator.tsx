// Manual step-switcher for the auth flow (Login / Register / Verify2FA /
// Setup2FA), matching the same useState-based routing App.tsx already uses
// elsewhere in this codebase — see KamustaSign_UI_CRUD_Handoff.md Section 4.
// Wiring the installed-but-unused @react-navigation stack is a separate,
// later step (Section 6, step 3), not folded in here.
import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import LoginScreen, { Role } from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import Verify2FAScreen from "../screens/auth/Verify2FAScreen";
import Setup2FAScreen from "../screens/auth/Setup2FAScreen";
import type { AuthGateState } from "../lib/authGate";

type Step = "login" | "register" | "verify2fa" | "setup2fa";

type Props = {
  role: Role;
  accentColor: string;
  authGate: AuthGateState;
  onRequestExit: () => void;
  onSetupPromptActive: (active: boolean) => void;
};

export default function AuthNavigator({ role, accentColor, authGate, onRequestExit, onSetupPromptActive }: Props) {
  const [step, setStep] = useState<Step>("login");
  const canRegister = role !== "admin";

  return (
    <View style={styles.flex}>
      {step === "login" && (
        <LoginScreen
          role={role}
          accentColor={accentColor}
          canRegister={canRegister}
          onNavigateRegister={() => setStep("register")}
          onNeedsMfa={() => setStep("verify2fa")}
          onBack={onRequestExit}
        />
      )}

      {step === "register" && role !== "admin" && (
        <RegisterScreen
          role={role}
          accentColor={accentColor}
          onNavigateLogin={() => setStep("login")}
          onRegistered={() => {
            // Fresh account, session already exists, no factor enrolled yet —
            // offer 2FA setup before handing off to the (future) dashboard.
            onSetupPromptActive(true);
            setStep("setup2fa");
          }}
        />
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
