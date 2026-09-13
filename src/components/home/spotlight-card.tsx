"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Dependency-free pointer spotlight. A single instance per section delegates
 * `pointermove` to descendants marked with `data-spotlight`, writing the
 * `--spot-x` / `--spot-y` CSS variables consumed by `.home-spotlight::after`.
 *
 * Inert on coarse pointers and under reduced motion; the glow is additionally
 * gated in CSS to fine pointers. Never affects focus order or the a11y tree.
 */
export function SpotlightArea({ children, className }: { children: ReactNode; className?: string }) {
  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-spotlight]");
    if (!card) return;

    const rect = card.getBoundingClientRect();
    card.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    card.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div className={cn(className)} onPointerMove={handlePointerMove}>
      {children}
    </div>
  );
}
