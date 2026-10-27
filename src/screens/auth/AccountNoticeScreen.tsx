// Shown after sign-in when the account can't use a dashboard yet: a teacher
// sign-up an admin hasn't approved (0011_auth_hardening.sql), or an account
// whose profile couldn't be loaded.
import React, { useState } from "react";
import { View, Text } from "react-native";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { authStyles as s } from "./authStyles";
import { spacing } from "../../theme/theme";

type Props = {
  accentColor: string;
  title: string;
  message: string;
  onCheckAgain: () => Promise<void>;
  onSignOut: () => void;
};

export default function AccountNoticeScreen({ accentColor, title, message, onCheckAgain, onSignOut }: Props) {
  const [checking, setChecking] = useState(false);

  return (
    <AuthScreenShell accentColor={accentColor}>
      <Text style={[s.title, { color: accentColor }]}>{title}</Text>
      <Text style={s.subtitle}>{message}</Text>
      <AuthButton
        label="Check again"
        loading={checking}
        accentColor={accentColor}
        onPress={async () => {
          setChecking(true);
          await onCheckAgain();
          setChecking(false);
        }}
      />
      <View style={{ marginTop: spacing.sm, width: "100%" }}>
        <AuthButton label="Log out" onPress={onSignOut} variant="secondary" />
      </View>
    </AuthScreenShell>
  );
}
