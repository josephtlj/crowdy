import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "crowdy:theme";

export type ThemeMode = "light" | "dark";

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
}

const LIGHT: ThemeColors = {
  background: "#F7F5F1",
  surface: "#FFFFFF",
  surfaceAlt: "#F0EDE6",
  text: "#22262B",
  textMuted: "#5B6470",
  border: "#DDD8CE",
  accent: "#EB5757",
};

const DARK: ThemeColors = {
  background: "#121212",
  surface: "#1C1C1E",
  surfaceAlt: "#2A2A2A",
  text: "#FFFFFF",
  textMuted: "#9A9A9A",
  border: "#2A2A2A",
  accent: "#EB5757",
};

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Provides the light/dark theme to every screen and remembers the choice on
 * the device. Starts dark until the saved choice has been read.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark") setMode(stored);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: mode === "dark" ? DARK : LIGHT,
      toggleTheme: () => {
        const next = mode === "dark" ? "light" : "dark";
        setMode(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch((err) => console.error("Failed to store theme:", err));
      },
    }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
