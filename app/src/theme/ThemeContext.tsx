import React, { createContext, useContext, useMemo, useState } from "react";

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

// In-memory only for now - resets on app restart. Fine for demoing the
// toggle; persisting the choice (e.g. AsyncStorage) is a small addition
// later if wanted, not built now since it wasn't asked for.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: mode === "dark" ? DARK : LIGHT,
      toggleTheme: () => setMode((m) => (m === "dark" ? "light" : "dark")),
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
