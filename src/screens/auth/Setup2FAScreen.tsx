// Offered once, right after a TEACHER signs up (AuthNavigator), and
// REQUIRED for every ADMIN account (App, `required`): admins manage every
// account, and since 0016_admin_requires_2fa.sql their admin powers only work
// after an authenticator code, so an admin without 2FA is sent here on every
// login until it's set up. Teachers can skip; students aren't asked: a child
// who loses the phone would be locked out, and only an admin with database
// access can undo 2FA. Teachers and admins can also turn it on later in the
// Account panel.
import React from "react";
import { Text } from "react-native";
import AuthScreenShell from "./AuthScreenShell";
import TwoFactorSetup from "../../components/auth/TwoFactorSetup";
import { useAuthStyles } from "./authStyles";

type Props = {
  accentColor: string;
  /** No skipping: the button under the code logs out instead. */
  required?: boolean;
  /** true once 2FA is on; false when skipped (or, when required, "Log out"). */
  onDone: (enabled: boolean) => void;
};

export default function Setup2FAScreen({ accentColor, required = false, onDone }: Props) {
  const s = useAuthStyles();
  return (
    <AuthScreenShell accentColor={accentColor}>
      <Text style={[s.title, { color: accentColor }]}>{required ? "Set up 2FA to continue" : "Set up 2FA (recommended)"}</Text>
      <Text style={s.subtitle}>
        {required
          ? "Admin accounts must use two-factor sign-in. Scan this QR code with Google Authenticator, Microsoft Authenticator or a similar app, then enter the code it shows. Also save the key below somewhere safe: it sets the app up again on a new phone."
          : "Scan this QR code with Google Authenticator, Authy, or a similar app, then enter the code it shows."}
      </Text>
      <TwoFactorSetup accentColor={accentColor} cancelLabel={required ? "Log out" : "Skip for now"} onDone={onDone} />
    </AuthScreenShell>
  );
}
