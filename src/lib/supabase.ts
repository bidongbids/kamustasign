import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Callers (auth screens, authGate) must check this before making real calls.
// The client below is still constructed either way — with harmless
// placeholder values when unconfigured — so importing this module can never
// crash app boot just because .env hasn't been filled in yet (screens that
// don't touch auth, e.g. the translator, must keep working regardless).
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. " +
      "Copy .env.example to .env and fill in your Supabase project's values, then restart the dev server. " +
      "Auth screens will show a configuration notice instead of calling a real backend."
  );
}

// AsyncStorage isn't safe to import on web (no native module), and Supabase's
// default storage already falls back to localStorage there, so only wire it
// in for iOS/Android.
const auth =
  Platform.OS === "web"
    ? { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    : {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        storage: require("@react-native-async-storage/async-storage").default,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      };

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
  { auth }
);

// A throwaway client that never stores or refreshes a session, for checking
// a password without replacing the signed-in session (which may be aal2) -
// see changePassword in account.ts. Its own storage key keeps supabase-js
// from warning about two clients sharing one.
export function createScratchClient() {
  return createClient(supabaseUrl ?? "https://placeholder.supabase.co", supabaseAnonKey ?? "placeholder-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "lcsign-scratch-auth" },
  });
}
