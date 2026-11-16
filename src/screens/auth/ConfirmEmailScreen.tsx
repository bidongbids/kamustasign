// Reached from the login screen when Supabase says the email isn't confirmed
// yet: the person signed up but never typed the emailed code (closed the app,
// or the code ran out). The first code may be gone, so "Send a new code" is
// available straight away. A right code signs them in; App takes it from
// there (waiting for approval, or the dashboard).
import React from "react";
import { Text } from "react-native";
import AuthScreenShell from "./AuthScreenShell";
import EmailCodeForm from "../../components/auth/EmailCodeForm";
import { useAuthStyles } from "./authStyles";

type Props = {
  accentColor: string;
  email: string;
  onBack: (email?: string) => void;
};

export default function ConfirmEmailScreen({ accentColor, email, onBack }: Props) {
  const s = useAuthStyles();
  return (
    <AuthScreenShell accentColor={accentColor} onBack={() => onBack(email)} backLabel="Back to Log In">
      <Text style={[s.title, { color: accentColor }]}>Confirm your email</Text>
      <Text style={s.subtitle}>
        Enter the 6-digit code we emailed to {email} when you signed up. Lost it, or is it more than an hour old? Send a new one.
      </Text>
      <EmailCodeForm accentColor={accentColor} email={email} purpose="signup" initialWait={0} onVerified={() => {}} />
    </AuthScreenShell>
  );
}
