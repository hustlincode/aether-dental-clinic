"use client";

import { cn } from "@/lib/utils";

/**
 * Animated hamburger menu button.
 * Three lines transform smoothly into an X when `open` is true.
 * Uses CSS classes defined in globals.css (.burger / .burger-line / .burger--open).
 */
export function HamburgerButton({
  open,
  onClick,
  label,
  className = "",
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={open}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition hover:bg-background-alt hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className={`burger ${open ? "burger--open" : ""}`} aria-hidden="true">
        <span className="burger-line burger-line--top" />
        <span className="burger-line burger-line--middle" />
        <span className="burger-line burger-line--bottom" />
      </span>
    </button>
  );
}
