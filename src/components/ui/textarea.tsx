import * as React from "react"
import { cn } from "@/lib/cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // No `outline-none`: the global 2px `var(--focus-ring)` outline is the
        // accessible focus indicator; the ring pair is decorative.
        "flex field-sizing-content min-h-24 w-full rounded-control border border-input bg-surface px-3 py-2 text-base shadow-xs transition-[color,background-color,border-color,box-shadow] placeholder:text-muted-foreground hover:border-border-strong focus-visible:border-accent-line focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-focus/40 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-surface-alt dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
