// Theme: two independent choices, the mode (light / dark) and the colour
// scheme (Graphite Aurora, Ocean, Forest, Sunset), per
// docs/design/design_handoff_classroom_theming/README.md §1. Both are saved
// per device and apply at every width.
//
// Screens read colors and shadows from useTheme() and build their styles
// with a makeStyles(colors) factory memoised per palette, so switching
// re-renders in place without a reload. A screen that still imports the
// static `colors` from theme.ts is always Graphite dark, so new screens
// shouldn't.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palettes, SchemeName, SCHEMES, ThemeColors, ThemeName } from "./theme";
import { makeShadows, Shadows } from "./shadows";
import { applyInteractionStates } from "./interactionStates";
import { useResponsive } from "./responsive";

export type ThemeMode = "light" | "dark";

const MODE_KEY = "kamustasign.themePreference";
const SCHEME_KEY = "kamustasign.colorScheme";
const DEFAULT_MODE: ThemeMode = "dark";
const DEFAULT_SCHEME: SchemeName = "graphite";

export type Theme = {
  /** What the user picked. */
  mode: ThemeMode;
  /** The palette in use: the same as `mode`. */
  name: ThemeName;
  scheme: SchemeName;
  colors: ThemeColors;
  shadows: Shadows;
  /** Phone widths (layout only). */
  isMobile: boolean;
  setMode: (next: ThemeMode) => void;
  setScheme: (next: SchemeName) => void;
  /** Dark + Graphite Aurora. */
  reset: () => void;
};

const isMode = (v: unknown): v is ThemeMode => v === "light" || v === "dark";
// "Match device" was a third choice until 10-30: keep what such a device
// showed by reading its setting once.
const fromSaved = (v: unknown): ThemeMode | null =>
  isMode(v) ? v : v === "system" ? (Appearance.getColorScheme() === "light" ? "light" : "dark") : null;
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
  const [mode, setModeState] = useState<ThemeMode>(() => fromSaved(savedNow(MODE_KEY)) ?? DEFAULT_MODE);
  const [scheme, setSchemeState] = useState<SchemeName>(() => {
    const v = savedNow(SCHEME_KEY);
    return isScheme(v) ? v : DEFAULT_SCHEME;
  });

  useEffect(() => {
    AsyncStorage.multiGet([MODE_KEY, SCHEME_KEY])
      .then(([[, m], [, s]]) => {
        const saved = fromSaved(m);
        if (saved) setModeState(saved);
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

  const name: ThemeName = mode;

  const value = useMemo<Theme>(() => {
    const colors = palettes[scheme][name];
    return { mode, name, scheme, colors, shadows: makeShadows(name, colors), isMobile, setMode, setScheme, reset };
  }, [mode, name, scheme, isMobile, setMode, setScheme, reset]);
  // Hover / pressed / focus colours for every control (web stylesheet).
  useEffect(() => applyInteractionStates(value.name, value.colors), [value.name, value.colors]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Children get the dark palette of the current scheme in either mode. For
 * what sits on the camera or a material object (README §2: the camera, video
 * and the device housings stay near-black), so its text stays light on it.
 */
export function DarkTheme({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const value = useMemo<Theme>(() => {
    if (theme.name === "dark") return theme;
    const colors = palettes[theme.scheme].dark;
    return { ...theme, name: "dark", colors, shadows: makeShadows("dark", colors) };
  }, [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
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
