import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"
import { Slot } from "radix-ui"

/** Destructive styling. `danger` is the readable alias; `destructive` is kept
 *  so existing call sites and any future shadcn `add` keep working. */
const destructiveStyles =
  "bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:focus-visible:ring-destructive/40"

/* Focus idiom (P3.4). The *accessible* indicator is the global
   `:focus-visible { outline: 2px solid var(--focus-ring) }` in globals.css — a
   focusable element must never declare `outline-none`, or that outline is
   suppressed and nothing perceivable is left. The ring pair below is a purely
   decorative glow (`--ring` is the low-contrast token); it carries no contrast
   contract. Every focusable primitive in src/components uses this same pair. */

/* ─── Hit-area contract (the core of this revision) ───
   The visual box is set by `size`. The TARGET is this one pseudo-element,
   which escapes the box vertically at the button's own width.

     after:absolute after:left-0 after:right-0 after:-inset-y-N
     after:content-['']

   `left-0 right-0` ⇒ the pseudo is exactly as wide as the button, so two
   horizontally adjacent buttons can never collide, at any gap.
   `-inset-y-N`   ⇒ expansion is purely vertical. Two VERTICALLY adjacent
                    buttons collide only when gap < N_A + N_B. No size here
                    exceeds N = 4px (0.25rem), so the safe minimum vertical
                    gap is 8px — `gap-2` — for every pair in the scale.

   `after:content-['']` is REQUIRED, not belt-and-braces: without an explicit
   content value the rule compiles to `content: var(--tw-content)`, and on
   browsers lacking `@property` (Safari <16.4, Firefox <128) that fails at
   computed-value time, `content` computes to `normal`, and NO pseudo-element
   is generated — silently deleting the hit area.

   The expansion is clipped by any ancestor that clips (`overflow: hidden`,
   `auto` or `scroll`) and truncates at the clip edge. Cells and cards with
   12px or more of padding absorb it; only a control flush against a
   scrollport edge loses part of its expansion.

   The base carries NO font-size, NO gap and NO svg size. Those belong to the
   `size` variants: two classes setting one property resolve by stylesheet
   order, not class order, and a size that disagrees with the base must win
   deterministically. */
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap transition-[color,box-shadow,background-color,border-color,transform] duration-(--dur-fast) ease-out focus-visible:border-accent-line focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-focus/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 after:absolute after:left-0 after:right-0 after:content-[''] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:translate-y-px active:bg-primary/85",
        destructive: destructiveStyles,
        danger: destructiveStyles,
        outline: "border border-border-strong bg-surface shadow-xs hover:bg-accent-surface hover:text-foreground active:translate-y-px",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 active:translate-y-px",
        ghost: "hover:bg-accent-surface hover:text-foreground active:bg-accent-surface/80",
        link: "text-foreground underline-offset-4 hover:text-accent-hover hover:underline",
      },
      size: {
        xs: "h-7 gap-1.5 px-2.5 text-caption leading-none after:-inset-y-0.5 has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 px-3.5 text-body-sm leading-none after:-inset-y-1 has-[>svg]:px-3 [&_svg:not([class*='size-'])]:size-4",
        default: "h-9 gap-2 px-5 text-body-sm leading-none after:-inset-y-1 has-[>svg]:px-4 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-11 gap-2 px-6 text-body font-medium leading-none tracking-[-0.005em] after:-inset-y-0.5 has-[>svg]:px-5 [&_svg:not([class*='size-'])]:size-4.5",
        "icon-xs": "size-7 after:-inset-y-0.5 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 after:-inset-y-1 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-9 after:-inset-y-1 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-11 after:-inset-y-0.5 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
