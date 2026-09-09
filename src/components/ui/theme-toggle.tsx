"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className={`group relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface transition-all hover:border-accent hover:bg-accent-soft ${className}`}
    >
      <Sun
        className={`absolute h-4 w-4 transition-all duration-300 ${
          isDark
            ? "rotate-0 scale-100 text-text-secondary opacity-100"
            : "rotate-90 scale-0 text-accent opacity-0"
        }`}
        strokeWidth={2}
        aria-hidden
      />
      <Moon
        className={`absolute h-4 w-4 transition-all duration-300 ${
          isDark
            ? "-rotate-90 scale-0 text-accent opacity-0"
            : "rotate-0 scale-100 text-text-secondary opacity-100"
        }`}
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}