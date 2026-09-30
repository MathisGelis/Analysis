"use client";
// src/lib/theme-context.tsx
//
// Provider de theme cote CLIENT. Le hook useTheme() est utilise par les
// composants interactifs (SettingsDrawer, etc.).
//
// Note : les fonctions helper serveur (getServerTheme, themeBootstrapScript)
// sont dans theme-server.ts pour ne pas etre bundle cote client. Ne pas
// les re-exporter ici.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "fa.theme";
const COOKIE_NAME = "fa_theme";

export function ThemeProvider({
  initialTheme = "dark",
  children,
}: {
  initialTheme?: Theme;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  // Au mount : synchronise depuis localStorage (deja pose par le
  // script anti-flash dans <head>, on recupère ici pour le state React).
  useEffect(() => {
    const fromStorage = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (fromStorage === "dark" || fromStorage === "light") {
      setThemeState(fromStorage);
    }
  }, []);

  const apply = useCallback((t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(STORAGE_KEY, t);
    document.cookie = `${COOKIE_NAME}=${t}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    apply(theme === "dark" ? "light" : "dark");
  }, [apply, theme]);

  const set = useCallback((t: Theme) => apply(t), [apply]);

  return (
    <ThemeContext.Provider value={{ theme, toggle, set }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme doit etre utilise dans <ThemeProvider>");
  return ctx;
}
