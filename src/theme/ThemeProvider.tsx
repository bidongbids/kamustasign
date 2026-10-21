// Light/dark theme for the phone layout (KAMUSTASIGN_LIGHT_THEME_HANDOFF.md
// §4). The light theme exists only on phones (useResponsive().isMobile):
// desktop and tablet always get the dark "Graphite Aurora" palette, whatever
// the saved choice says.
//
// Screens read colors and shadows from useTheme() and build their styles
// with a makeStyles(colors) factory memoised per theme, so switching
// re-renders in place without a reload. A screen that still imports the
// static `colors` from theme.ts is always dark; that's how not-yet-migrated
// screens behave until they're moved over.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palettes, ThemeColors, ThemeName } from "./theme";
import { makeShadows, Shadows } from "./shadows";
import { useResponsive } from "./responsive";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "kamustasign.themePreference";

export type Theme = {
  name: ThemeName;
  colors: ThemeColors;
  shadows: Shadows;
  /** True on phone widths - the only place the light theme applies. */
  isMobile: boolean;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

const DARK: Theme = {
  name: "dark",
  colors: palettes.dark,
  shadows: makeShadows("dark"),
  isMobile: false,
  preference: "system",
  setPreference: () => {},
};

const ThemeContext = createContext<Theme>(DARK);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { isMobile } = useResponsive();
  const scheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "light" || saved === "dark" || saved === "system") setPreferenceState(saved);
      })
      .catch(() => {});
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const wanted: ThemeName = preference === "system" ? (scheme === "light" ? "light" : "dark") : preference;
  const name: ThemeName = isMobile ? wanted : "dark";

  const value = useMemo<Theme>(
    () => ({ name, colors: palettes[name], shadows: makeShadows(name), isMobile, preference, setPreference }),
    [name, isMobile, preference, setPreference]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Styles that depend on the theme, built once per theme:
 *   const makeStyles = (colors: ThemeColors) => StyleSheet.create({...});
 *   const styles = useThemedStyles(makeStyles);
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors, theme: Theme) => T): T {
  const theme = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(theme.colors, theme), [factory, theme.name, theme.isMobile]);
}
