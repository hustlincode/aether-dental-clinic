"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        {/* `flex-1`, not `w-full`: the Button base carries `shrink-0`, and
            `width:100%` + `flex-shrink:0` beside the 32px dismiss button
            overflows the bar by 40px and pushes the ✕ off-screen.
            `flex-1` resolves to `flex-basis:0` + `flex-grow:1`, so the CTA
            takes exactly the space the dismiss button leaves. */}
        <Button asChild size="default" className="flex-1">
          <Link href="/book">Book an appointment</Link>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss booking bar"
        >
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}