"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: ReactNode;
  /** Element to render (default `div`). */
  as?: ElementType;
  className?: string;
  /** Stagger direct children instead of animating the wrapper as one block. */
  stagger?: boolean;
}

/**
 * Scroll-reveal wrapper. Content is **visible in the SSR HTML and on first
 * paint** (SEO + no-JS safe, no hidden-content penalty, no CLS); it is only
 * hidden *after hydration* and only when the element is below the fold, then
 * revealed once via IntersectionObserver. No-ops under reduced motion or when
 * IntersectionObserver is unavailable, leaving content visible.
 *
 * One client leaf per section (not per card) keeps hydration minimal.
 */
export function Reveal({ children, as: Tag = "div", className, stagger = false }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Never hide an element already in (or near) the viewport on load — this
    // avoids a post-hydration flash for above-the-fold sections.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    setShown(false);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn(stagger ? "home-reveal-group" : "home-reveal", shown && "is-in", className)}
    >
      {children}
    </Tag>
  );
}
