"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

/**
 * Sticky mobile bottom "Book an appointment" bar.
 * Visible only below `lg`. Dismissible (state-only, intentionally not persisted).
 */
export function MobileBookBar() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Link
          href="/book"
          className="gradient-gold flex flex-1 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-[#0E0F10] shadow-md transition-opacity duration-200 hover:opacity-90"
        >
          Book an appointment
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss booking bar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition hover:bg-background-alt hover:text-text"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}