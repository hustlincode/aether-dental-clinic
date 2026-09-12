"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme, type ThemeMode } from "./theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const OPTIONS: { value: ThemeMode; label: string; hint: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", hint: "Always light", icon: Sun },
  { value: "dark", label: "Dark", hint: "Always dark", icon: Moon },
  { value: "system", label: "System", hint: "Match device", icon: Monitor },
];

function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, resolvedTheme, setMode } = useTheme();
  const ActiveIcon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Change theme (current: ${mode})`}
          title={`Theme: ${mode}`}
          className={`group flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface transition-all hover:border-accent hover:bg-accent-soft ${className}`}
        >
          <ActiveIcon
            className="h-4 w-4 text-text-secondary transition-colors group-hover:text-accent"
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 bg-surface">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            if (isThemeMode(value)) setMode(value);
          }}
        >
          {OPTIONS.map(({ value, label, hint, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2.5">
              <Icon className="h-4 w-4 text-text-muted" aria-hidden />
              <span className="flex flex-1 flex-col">
                <span className="text-sm text-text">{label}</span>
                <span className="text-[11px] leading-tight text-text-muted">{hint}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
