// Offered once, right after a TEACHER or ADMIN signs up (AuthNavigator).
// Those accounts can see students' names, emails and progress, so it's worth
// the extra step. Students aren't asked: a child who loses the phone would be
// locked out, and only an admin with database access can undo 2FA.
// Teachers and admins can also turn it on later in the Account panel.
import React from "react";
import { Text } from "react-native";
import AuthScreenShell from "./AuthScreenShell";
import TwoFactorSetup from "../../components/auth/TwoFactorSetup";
import { authStyles as s } from "./authStyles";

type Props = {
  accentColor: string;
  onDone: () => void;
};

export default function Setup2FAScreen({ accentColor, onDone }: Props) {
  return (
    <AuthScreenShell accentColor={accentColor}>
      <Text style={[s.title, { color: accentColor }]}>Set up 2FA (recommended)</Text>
      <Text style={s.subtitle}>
        Scan this QR code with Google Authenticator, Authy, or a similar app, then enter the code it shows.
      </Text>
      <TwoFactorSetup accentColor={accentColor} cancelLabel="Skip for now" onDone={() => onDone()} />
    </AuthScreenShell>
  );
}
