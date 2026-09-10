"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function resolveStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem("aether-theme");
    if (isTheme(stored)) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Deterministic SSR-safe default so server and client HTML match during hydration.
  const [theme, setTheme] = useState<Theme>("dark");

  // Adopt the stored theme or OS preference only after hydration.
  useEffect(() => {
    const id = window.setTimeout(() => setTheme(resolveStoredTheme()), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Sync <html data-theme> and localStorage on user changes (skips the initial default render).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("aether-theme", theme);
    } catch {
      // localStorage may be unavailable
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const set = useCallback((t: Theme) => {
    setTheme(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, set }}>
      {children}
    </ThemeContext.Provider>
  );
}