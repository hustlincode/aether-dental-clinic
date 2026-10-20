"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme, type ThemeMode } from "./theme-provider";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

/**
 * The three theme modes.
 *
 * `label` is the WHOLE visible string — one word on one line. An earlier
 * build paired every label with an eyebrow hint ("Always light" / "Match
 * device"), which made each row two lines tall and left the icon centred on
 * the gap between them instead of on its own label's line.
 *
 * `detail` is the assistive-technology-only half. Only "System" needs one:
 * "Light" and "Dark" are unambiguous, "System" is not until you know it means
 * the device. It is folded into the radio item's `aria-label`, so the
 * explanation survives for a screen-reader user without putting a second
 * line back on screen.
 */
const OPTIONS: {
  value: ThemeMode;
  label: string;
  detail?: string;
  icon: LucideIcon;
}[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", detail: "matches your device", icon: Monitor },
];

function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, resolvedTheme, setMode } = useTheme();
  const ActiveIcon = resolvedTheme === "dark" ? Moon : Sun;

  const current = OPTIONS.find((option) => option.value === mode) ?? OPTIONS[2];
  // In "system" mode the trigger shows the RESOLVED theme, so both the
  // tooltip and the accessible name have to name two things: the preference,
  // and what it currently resolves to.
  const triggerLabel =
    mode === "system" ? `Theme: System (${resolvedTheme})` : `Theme: ${current.label}`;
  const currentLabel =
    mode === "system" ? `${current.label}, ${resolvedTheme}` : current.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          className={cn("group", className)}
          aria-label={`Change theme (current: ${currentLabel})`}
          title={triggerLabel}
        >
          <ActiveIcon
            className="size-4 text-text-secondary transition-colors duration-(--dur-fast) group-hover:text-accent max-compact:size-5"
            strokeWidth={2}
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>
      {/* No width class: the content hugs its rows, and the base class's
          `min-w-[8rem]` is the floor. `bg-surface` is what `--popover`
          already resolves to, and states it here on purpose. */}
      <DropdownMenuContent align="end" className="bg-surface">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            if (isThemeMode(value)) setMode(value);
          }}
        >
          {OPTIONS.map(({ value, label, detail, icon: Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              indicator="end"
              aria-label={detail ? `${label} (${detail})` : label}
              className="group gap-3"
            >
              {/* A fixed 16px icon slot: every glyph sits on the same optical
                  column and on the same line as its label. */}
              <Icon
                className="size-4 shrink-0 text-text-muted transition-colors duration-(--dur-fast) group-data-[state=checked]:text-accent"
                strokeWidth={2}
                aria-hidden
              />
              <span className="text-sm leading-none whitespace-nowrap text-text transition-colors duration-(--dur-fast) group-data-[state=checked]:text-accent">
                {label}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
