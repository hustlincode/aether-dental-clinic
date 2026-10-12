"use client";

import { Button } from "@/components/ui/button";

/**
 * Animated hamburger menu button.
 * Three lines transform smoothly into an X when `open` is true.
 * Uses CSS classes defined in globals.css (.burger / .burger-line / .burger--open).
 * Renders `<Button variant="ghost" size="icon-sm">` so it inherits the
 * `::after` hit-area contract (40px hit / 32px visual).
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
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={open}
      className={className}
    >
      <span className={`burger ${open ? "burger--open" : ""}`} aria-hidden="true">
        <span className="burger-line burger-line--top" />
        <span className="burger-line burger-line--middle" />
        <span className="burger-line burger-line--bottom" />
      </span>
    </Button>
  );
}
