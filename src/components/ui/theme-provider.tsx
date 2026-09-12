"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** The user-selected preference. */
  mode: ThemeMode;
  /** The concrete theme currently applied to the document. */
  resolvedTheme: ResolvedTheme;
  /** Update the preference (persisted to localStorage). */
  setMode: (mode: ThemeMode) => void;
  /**
   * @deprecated Back-compat alias for `resolvedTheme`.
   * Existing consumers (e.g. Sonner) read this as the effective theme.
   */
  theme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "aether-theme";

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function resolveStoredMode(stored: string | null): ThemeMode {
  return isThemeMode(stored) ? stored : "system";
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveMode(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? getSystemTheme() : mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Deterministic SSR-safe default; the inline script in the root layout has
  // already set <html data-theme> before paint, and we adopt the stored mode
  // immediately after hydration.
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  const didInit = useRef(false);
  const didMount = useRef(false);

  // ── Initialize from storage / OS preference after hydration ──
  // Deferred to a macrotask: reading localStorage during hydration would make
  // the first client render disagree with the server HTML. This mirrors the
  // previous provider and keeps first paint deterministic.
  useEffect(() => {
    const id = window.setTimeout(() => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        // localStorage may be unavailable
      }

      const initialMode = resolveStoredMode(stored);
      const initialResolved = resolveMode(initialMode);

      setModeState(initialMode);
      setResolvedTheme(initialResolved);
      document.documentElement.setAttribute("data-theme", initialResolved);
      didInit.current = true;
    }, 0);

    return () => window.clearTimeout(id);
  }, []);

  // ── Apply user changes + persist the selected mode ──
  useEffect(() => {
    // Skip the mount run so we never clobber the stored value with the
    // SSR default before initialization has read it.
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (!didInit.current) return;

    const next = resolveMode(mode);
    setResolvedTheme(next);
    document.documentElement.setAttribute("data-theme", next);

    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // localStorage may be unavailable
    }
  }, [mode]);

  // ── Follow OS changes while in "system" mode ──
  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = mq.matches ? "dark" : "light";
      setResolvedTheme(next);
      document.documentElement.setAttribute("data-theme", next);
    };

    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedTheme,
      setMode,
      theme: resolvedTheme,
    }),
    [mode, resolvedTheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
