// Theme: two independent choices, the mode (light / dark / match device) and
// the colour scheme (Graphite Aurora, Ocean, Forest, Sunset), per
// docs/design/design_handoff_classroom_theming/README.md §1. Both are saved
// per device.
//
// Screens read colors and shadows from useTheme() and build their styles
// with a makeStyles(colors) factory memoised per palette, so switching
// re-renders in place without a reload. A screen that still imports the
// static `colors` from theme.ts is always Graphite dark; that's how
// not-yet-migrated screens behave until they're moved over.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palettes, SchemeName, SCHEMES, ThemeColors, ThemeName } from "./theme";
import { makeShadows, Shadows } from "./shadows";
import { useResponsive } from "./responsive";

export type ThemeMode = "system" | "light" | "dark";

const MODE_KEY = "kamustasign.themePreference";
const SCHEME_KEY = "kamustasign.colorScheme";
const DEFAULT_MODE: ThemeMode = "system";
const DEFAULT_SCHEME: SchemeName = "graphite";

// Desktop and tablet stay dark until every screen reads its colours from
// useTheme() (handoff §10, steps 3-5): before that, a light GlassCard would
// hold dark-styled content. Light mode already works on phones.
const LIGHT_ON_EVERY_WIDTH = false;

export type Theme = {
  /** What the user picked. */
  mode: ThemeMode;
  /** Resolved: "system" follows the device. */
  name: ThemeName;
  scheme: SchemeName;
  colors: ThemeColors;
  shadows: Shadows;
  /** Phone widths (layout only). */
  isMobile: boolean;
  setMode: (next: ThemeMode) => void;
  setScheme: (next: SchemeName) => void;
  /** Match device + Graphite Aurora. */
  reset: () => void;
};

const isMode = (v: unknown): v is ThemeMode => v === "system" || v === "light" || v === "dark";
const isScheme = (v: unknown): v is SchemeName => SCHEMES.some((s) => s.key === v);

// AsyncStorage on the web is localStorage under the same key, so the saved
// choice can be read synchronously for the first paint (no dark-to-light
// flash). Native reads it in the effect below.
function savedNow(key: string): string | null {
  if (Platform.OS !== "web") return null;
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

const DARK: Theme = {
  mode: DEFAULT_MODE,
  name: "dark",
  scheme: DEFAULT_SCHEME,
  colors: palettes.graphite.dark,
  shadows: makeShadows("dark", palettes.graphite.dark),
  isMobile: false,
  setMode: () => {},
  setScheme: () => {},
  reset: () => {},
};

const ThemeContext = createContext<Theme>(DARK);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { isMobile } = useResponsive();
  const device = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const v = savedNow(MODE_KEY);
    return isMode(v) ? v : DEFAULT_MODE;
  });
  const [scheme, setSchemeState] = useState<SchemeName>(() => {
    const v = savedNow(SCHEME_KEY);
    return isScheme(v) ? v : DEFAULT_SCHEME;
  });

  useEffect(() => {
    AsyncStorage.multiGet([MODE_KEY, SCHEME_KEY])
      .then(([[, m], [, s]]) => {
        if (isMode(m)) setModeState(m);
        if (isScheme(s)) setSchemeState(s);
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
  }, []);
  const setScheme = useCallback((next: SchemeName) => {
    setSchemeState(next);
    AsyncStorage.setItem(SCHEME_KEY, next).catch(() => {});
  }, []);
  const reset = useCallback(() => {
    setMode(DEFAULT_MODE);
    setScheme(DEFAULT_SCHEME);
  }, [setMode, setScheme]);

  const wanted: ThemeName = mode === "system" ? (device === "light" ? "light" : "dark") : mode;
  const name: ThemeName = isMobile || LIGHT_ON_EVERY_WIDTH ? wanted : "dark";

  const value = useMemo<Theme>(() => {
    const colors = palettes[scheme][name];
    return { mode, name, scheme, colors, shadows: makeShadows(name, colors), isMobile, setMode, setScheme, reset };
  }, [mode, name, scheme, isMobile, setMode, setScheme, reset]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Styles that depend on the theme, built once per palette:
 *   const makeStyles = (colors: ThemeColors) => StyleSheet.create({...});
 *   const styles = useThemedStyles(makeStyles);
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors, theme: Theme) => T): T {
  const theme = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(theme.colors, theme), [factory, theme.colors, theme.isMobile]);
}
