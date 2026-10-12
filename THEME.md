# THEME.md — Aether Dental design tokens

A complete reference for the token layer in **`src/app/globals.css`**, written
for someone who did not write it. Every contrast ratio below was measured, not
estimated — see [Tooling](#tooling).

If you only read one section, read [The three rules](#the-three-rules-you-cannot-infer-from-the-css).

| | |
|---|---|
| Stylesheet | `src/app/globals.css` (980 lines) |
| Contrast gate | `npm run audit:contrast` → `scripts/audit-contrast.mjs` |
| Class-merge gate | `npm run audit:classes` → `scripts/audit-classes.mts` |
| Lint gate | `npm run lint` → `eslint-local-rules/` (7 local rules) |
| Inventory | 118 tokens in `:root`, 50 overrides in `[data-theme="dark"]`, 137 mappings in `@theme inline` |
| Themes | `:root` = light (the default). `[data-theme="dark"]` overrides **only what differs**. |

---

## Contents

1. [The three rules you cannot infer from the CSS](#the-three-rules-you-cannot-infer-from-the-css)
2. [How the stylesheet is organised](#how-the-stylesheet-is-organised)
3. [Token reference](#token-reference)
4. [Typography scale](#typography-scale)
5. [Focus](#focus)
6. [Tooling](#tooling)
7. [Guardrails](#guardrails)
8. [Adding a shadcn component](#adding-a-shadcn-component)
9. [Known exceptions](#known-exceptions)

---

## The three rules you cannot infer from the CSS

### 1. The accent has four roles

The brand gold `#D4AF37` cannot do everything. It is split into four tokens by
**the contrast requirement of the thing you are painting**, never by eye.

| Role | Token | Tailwind | Use it for | Why |
|---|---|---|---|---|
| **Fill** | `--accent` | `bg-accent-fill` | large gold surfaces, primary buttons | needs DARK ink on top (`#0E0F10`, 9.12:1) |
| **Ink** | `--accent-ink` | `text-accent`, `border-accent`, `ring-accent`, `fill-accent` | gold *text*, gold icons, gold rules | gold on white is only **2.10:1** — it needs darkening to `#7A5C12` (6.24:1) to read as text |
| **Line** | `--accent-line` | `border-accent-line` | a gold border that carries meaning (focus-adjacent states, selected controls) | alpha-composited to **3.59:1**, clears WCAG 1.4.11 |
| **Surface** | `--accent-surface` (= `--accent-soft`) | `bg-accent-surface`, `bg-accent-soft` | a 10 % gold wash behind ink | a wash, not a fill; it must let the ink underneath win |

Pick by asking *"what is this gold doing?"* — filling an area, colouring a
glyph, drawing a meaningful border, or tinting a background. Two further
companions exist and are theme-aware: `--accent-hover` (fill hover,
`bg-accent-fill-hover`) and `--accent-ink-hover` (`hover:text-accent-hover`).

### 2. `bg-accent` is gold **ink**, not gold fill

`@theme inline` re-points `--color-accent` at `--accent-ink`. Therefore:

| Write this | Never this |
|---|---|
| `bg-accent-fill` (gold surface) | ~~`bg-accent`~~ (dark gold block) |
| `bg-accent-surface` / `bg-accent-soft` (shadcn "subtle hover") | |
| `bg-accent-fill-hover` | ~~`bg-accent-hover`~~ |
| `text-accent`, `border-accent`, `hover:text-accent-hover` | *(these are correct — they want the ink)* |

**Any component added from the shadcn CLI must be reviewed against this.**
Stock shadcn components emit `bg-accent` (its dropdown-item hover, its tabs,
its alert variants, …). Dropped in unmodified, they render a `#7A5C12`
dark-gold block — a visible brand regression that no automated test will catch.
`aether-theme/no-accent-as-fill` and `no-accent-hover-confusion` now make it a
lint error; see [Guardrails](#guardrails) and the
[checklist](#adding-a-shadcn-component).

### 3. `--home-*` is a namespace, not a second system

The `.home-*` / `--home-*` block at the bottom of `globals.css` is
**DESIGN.md-protected** and is an *alias layer*, not a fork. Its motion tokens
are literally `var(--ease-out)`, `var(--dur-card)` and friends.

- New global tokens do **not** get a `.home-*` twin. Add the global token and
  use it.
- If a homepage token has no global counterpart today (e.g. `--home-spot`,
  `--home-card-lift`), it is homepage-only by choice — not a template.
- The computed values in that block are unchanged by its promotion to the global
  layer; see the appendix in [DESIGN.md](DESIGN.md).

---

## How the stylesheet is organised

Nine sections, in this order. The order is load-bearing.

```
1. @imports                        tailwindcss + tw-animate-css
2. :root                           light theme (the default)
3. [data-theme="dark"]             overrides ONLY; never restates a light value
4. :root                           theme-INDEPENDENT tokens
                                   (radius / canvas / z-index / motion / density)
5. @theme inline                   the Tailwind v4 mappings
6. @keyframes + --animate-*        durations tokenised
7. @layer base + :focus-visible    colour-scheme, focus, selection, scrollbars
8. canvas / card-surface / gradients
9. .home-*                         DESIGN.md-protected; aliases only
```

Four invariants. **Two are machine-checked by `npm run audit:contrast`; two are
review-only.** The split matters — do not read "machine-checked" as "safe to
regress".

| # | Invariant | Enforced by |
|---|---|---|
| 1 | A colour token has exactly **one** job (surface / ink / line / accent) | **Review only.** Nothing can decide "is this token doing two jobs?" — it is a design intent, and a wrong split is usually invisible to a ratio check. |
| 2 | `[data-theme="dark"]` declares **only** what differs from `:root` | **`audit:contrast`** — one assertion per dark declaration, comparing the resolved value against the `:root` one. A redundant restatement fails with its `globals.css` line. |
| 3 | The shadcn alias block is declared **exactly once**, in `:root` | **Review only.** The audit checks the *tokens* exist and alias correctly; it does not know a block is duplicated elsewhere. |
| 4 | Theme-independent tokens are declared **exactly once**, in `:root` | **Review only.** Same gap. Invariant 2 catches the symptom when a theme-independent token turns up inside `[data-theme="dark"]`, but not a second `:root` copy. |

> **Why the z-index and duration tokens live in `:root`, not `@theme inline`.**
> Tailwind v4 tree-shakes `@theme` variables: only the ones a generated utility
> actually consumes are emitted into the output. A token no utility reads is
> dropped silently, whatever namespace it uses — verified against Tailwind 4.3.3
> by compiling the same token three ways:
>
> | declared in | emitted? |
> |---|---|
> | `:root` | **yes** |
> | `@theme inline` | no |
> | `@theme` | no |
>
> `--z-*` has no utility at all, and `duration-(--dur-fast)` is an *arbitrary*
> value — the compiled rule reads `--tw-duration: var(--dur-fast)`, so Tailwind
> cannot see that it depends on a theme entry. Moving `--z-modal`, `--dur-fast`
> and `--stagger` into `@theme inline` drops all three from the bundle. They stay
> in `:root`, which is emitted verbatim.

---

## Token reference

### Colour — surfaces

| Token | Tailwind | Light | Dark |
|---|---|---|---|
| `--background` | `bg-background` | `#f5f5f4` | `#0E0F10` |
| `--background-alt` | `bg-background-alt` | `#e7e5e4` | `#141516` |
| `--surface` | `bg-surface` | `#ffffff` | `#1F2326` |
| `--surface-alt` | `bg-surface-alt` | `#fafaf9` | `#262a2e` |
| `--overlay` | `bg-overlay` | `rgba(14,15,16,0.45)` | `rgba(0,0,0,0.6)` |

### Colour — ink

| Token | Tailwind | Light | Dark | on `--surface` (light / dark) |
|---|---|---|---|---|
| `--text` | `text-text` | `#0e0f10` | `#F8F9FA` | 19.19 / 15.02 |
| `--text-secondary` | `text-text-secondary` | `#44403c` | `#D1D5DB` | 10.27 / 10.74 |
| `--text-muted` | `text-text-muted` | `#5E666E` | `#9CA3AF` | 5.83 / 6.23 |

All three clear 4.5:1 on **all four** surfaces in both themes. The tightest
light case is `--text-muted` on `--background-alt` at **4.64:1** — that is why
`#616A73` was rejected (4.38:1).

### Colour — accent roles

| Token | Tailwind | Light | Dark | measured |
|---|---|---|---|---|
| `--accent` | `bg-accent-fill` | `#D4AF37` | `#D4AF37` *(identical — not restated in dark)* | ink on it: 9.12 |
| `--accent-hover` | `bg-accent-fill-hover` | `#E6C76B` | `#E6C76B` | ink on it: 11.65 |
| `--accent-ink` | `text-accent`, `border-accent`, `ring-accent`, `fill-accent` | `#7A5C12` | `#E6C76B` | on `--surface`: 6.24 / 9.61 |
| `--accent-ink-hover` | `hover:text-accent-hover` | `#5A430C` | `#F0DCA0` | on `--surface`: 9.36 / 11.65 |
| `--accent-soft` | `bg-accent-soft` | `rgba(212,175,55,0.10)` | `rgba(212,175,55,0.12)` | ink on the wash: 5.82 / 7.62 |
| `--accent-surface` | `bg-accent-surface` | `= var(--accent-soft)` | *inherits* | — |

`--accent` on light surfaces, for the record — **this is why it can never be text**:

| | `--background` | `--surface` | `--background-alt` | `--surface-alt` |
|---|---|---|---|---|
| light | 1.93 | 2.10 | 1.67 | 2.01 |
| dark | 9.12 | 7.53 | 8.69 | 6.87 |

### Lines & focus

| Token | Tailwind | Light | Dark | on `--surface` | Role |
|---|---|---|---|---|---|
| `--border` | `border-border` | `rgba(14,15,16,0.10)` | `rgba(248,249,250,0.10)` | 1.24 / 1.34 | structural hairline |
| `--border-strong` | `border-border-strong` | `rgba(14,15,16,0.18)` | `rgba(248,249,250,0.18)` | 1.48 / 1.77 | structural, heavier |
| `--border-accent` | `border-border-accent` | `rgba(212,175,55,0.40)` | `rgba(212,175,55,0.45)` | 1.33 / 2.62 | **decorative only** |
| `--accent-line` | `border-accent-line` | `rgba(122,92,18,0.75)` | `rgba(212,175,55,0.75)` | **3.59 / 4.86** | **functional** gold border |
| `--ring` | `ring-ring` | `rgba(122,92,18,0.28)` | `rgba(230,199,107,0.28)` | 1.52 / 1.99 | **decorative glow only** |
| `--focus-ring` | `ring-focus` | `#8A6A12` | `#E6C76B` | **5.06 / 9.61** | the one accent allowed as a focus ring |

Measured against every surface:

| | `--surface` | `--background` | `--surface-alt` | `--background-alt` |
|---|---|---|---|---|
| `--accent-line` light | 3.59 | 3.41 | 3.48 | 3.12 |
| `--accent-line` dark | 4.86 | 5.54 | 4.55 | 5.40 |
| `--focus-ring` light | 5.06 | 4.64 | 4.84 | 4.03 |
| `--focus-ring` dark | 9.61 | 11.65 | 8.77 | 11.10 |

On the gold chip wash, `--focus-ring` still clears 4.5:1 (**4.72** light /
**7.62** dark), and `--accent-ink` on `--accent-soft` over `--background` reads
**5.37 / 9.64**.

**`--border-accent` and `--ring` are below 3:1 on purpose.** A hairline that
only tints a card edge (always paired with a transform, a shadow or a rail) is
exempt from WCAG 1.4.11 as decoration. If a border must *communicate*, use
`--accent-line`.

### Status

Ink and background are separate tokens. Always paint a status chip with its
own pair — never `--text` on `--error-bg`.

| Status | Ink | Light / dark | Background | Light / dark | Ink on chip (light / dark) |
|---|---|---|---|---|---|
| success | `--success` | `#15803d` / `#4ade80` | `--success-bg` | `#dcfce7` / `rgba(74,222,128,0.12)` | 4.57 / 7.07 |
| warning | `--warning` | `#92400e` / `#fbbf24` | `--warning-bg` | `#fef3c7` / `rgba(251,191,36,0.12)` | 6.37 / 7.27 |
| error | `--error` | `#b91c1c` / `#f87171` | `--error-bg` | `#fee2e2` / `rgba(248,113,113,0.12)` | 5.30 / 4.82 |
| info | `--info` | `#1d4ed8` / `#60a5fa` | `--info-bg` | `#dbeafe` / `rgba(96,165,250,0.12)` | 5.49 / 5.06 |
| neutral | `--neutral` | `#4b5563` / `#9ca3af` | `--neutral-bg` | `#f3f4f6` / `rgba(156,163,175,0.12)` | 6.87 / 5.09 |

> ⚠️ **The neutral chip ink is `text-neutral-c`, not `text-neutral`.**
> `--color-neutral-c` is a deliberate naming dodge: mapping `--color-neutral`
> would clobber Tailwind's built-in `neutral-50 … neutral-950` scale, and every
> `bg-neutral-500` in the tree would silently resolve to the clinic grey.
> `--color-neutral-bg` keeps its plain name because it does not collide.
> **Do not "fix" the `-c` suffix.**

### Sidebar (admin)

| Token | Tailwind | Light | Dark |
|---|---|---|---|
| `--sidebar-bg` | `bg-sidebar-bg` | `#fafaf9` | `#0E0F10` |
| `--sidebar-surface` | `bg-sidebar-surface` | `#ffffff` | `#1F2326` |
| `--sidebar-text` | `text-sidebar-text` | `#0e0f10` | `#F8F9FA` |
| `--sidebar-text-muted` | `text-sidebar-text-muted` | `= var(--text-muted)` | `= var(--text-muted)` |
| `--sidebar-hover` | `hover:bg-sidebar-hover` | `rgba(212,175,55,0.10)` | *(same — not restated)* |
| `--sidebar-border` | `border-sidebar-border` | `rgba(14,15,16,0.08)` | `rgba(248,249,250,0.08)` |

Measured: `--sidebar-text` on `--sidebar-bg` **18.37 / 18.20**, on
`--sidebar-surface` **19.19 / 15.02**. `--sidebar-text-muted` on `--sidebar-bg`
**5.58 / 7.56**, on `--sidebar-surface` **5.83 / 6.23**. P0 removed a
`/70` opacity that measured **2.68:1**; never re-add it.

### Chart

**Data visualisation only. Never use a `--chart-*` token for UI chrome.**
`--chart-1` is a *different* gold from the brand fill in light mode — a series
stroke has to clear 3:1 on a white card, and `#D4AF37` does not (2.10:1).

| Slot | Light | on `#ffffff` | Dark | on `#1F2326` |
|---|---|---|---|---|
| `--chart-1` | `#A16207` | 4.92 | `#D4AF37` | 7.53 |
| `--chart-2` | `#1d4ed8` | 6.70 | `#60a5fa` | 6.23 |
| `--chart-3` | `#15803d` | 5.02 | `#4ade80` | 9.08 |
| `--chart-4` | `#b91c1c` | 6.47 | `#f87171` | 5.72 |
| `--chart-5` | `#5E666E` | 5.83 | `#9CA3AF` | 6.23 |
| `--chart-axis` | `= var(--text-muted)` | 5.83 (text, needs 4.5) | `= var(--text-muted)` | 6.23 |
| `--chart-grid` | `#e7e5e4` | 1.26 (decorative) | `rgba(248,249,250,0.08)` | 1.26 (decorative) |
| `--chart-surface` | `= var(--surface)` | — | `= var(--surface)` | — |

Slot meanings are identical across themes; only the values change. Series
geometry owes 3:1 (WCAG 1.4.11); axis ticks are **text** and owe 4.5:1.

### Canvas & gradient

| Token | Light | Dark |
|---|---|---|
| `--canvas-dot` | `rgba(14,15,16,0.035)` | `rgba(248,249,250,0.045)` |
| `--canvas-glow` | `rgba(212,175,55,0.07)` | `rgba(212,175,55,0.09)` |
| `--canvas-dot-tile` | `22px 22px` | *(same)* |
| `--hero-start` / `--hero-end` | `#f5f5f4` / `#e7e5e4` | `#0E0F10` / `#1F2326` |

`.canvas-base` is the foundation every canvas shares; `.admin-canvas` (two
glows) and `.home-canvas` (one centred glow) stack on top of the same dot grid.
`.gradient-gold` and `.gradient-gold-text` are **not** tokenised — they
hard-code `#D4AF37 → #E6C76B` in both themes, because a gradient cannot read a
`var()` pair. `.gradient-gold-text` is therefore dark-theme-only by contract;
in light mode use `.home-stat-value` / `--accent-ink` instead.

### Radius

Two coexisting families. The **semantic** one is what you write.

| Semantic token | Tailwind | Value | Replaces | Use for |
|---|---|---|---|---|
| `--radius-control` | `rounded-control` | `0.5rem` | `rounded-lg` | buttons, inputs, selects, inline chips |
| `--radius-card` | `rounded-card` | `0.75rem` | `rounded-xl` | cards, panels, modals, sheets |
| `--radius-chip` | `rounded-chip` | `0.375rem` | `rounded-md` | badges, tags, small status pills |
| `--radius-pill` | `rounded-pill` | `9999px` | `rounded-full` | avatars, full-round chips |

Q8 was decided *semantic*, deliberately: the shadcn-compat `--radius-sm/md/lg/xl`
stay declared (values equal to Tailwind's own scale, so the two can never
disagree) and keep their built-in meaning, so nothing is silently clobbered.
`rounded-sm` (4px) and `rounded-xs` (2px) are **not** tokenised; see
[Known exceptions](#known-exceptions).

### Elevation

| Token | Tailwind | Light | Dark |
|---|---|---|---|
| `--shadow-xs` | `shadow-xs` | `0 1px 2px rgba(0,0,0,.04)` | `0 1px 2px rgba(0,0,0,.28)` |
| `--shadow-sm` | `shadow-sm` | `0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)` | `…0.3, …0.2` |
| `--shadow-md` | `shadow-md` | `0 4px 12px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.04)` | `…0.35, …0.25` |
| `--shadow-lg` | `shadow-lg` | `0 10px 25px rgba(0,0,0,.08), 0 4px 10px rgba(0,0,0,.04)` | `…0.4, …0.2` |
| `--shadow-xl` | `shadow-xl` | `0 24px 48px rgba(0,0,0,.12)` | `0 24px 48px rgba(0,0,0,.5)` |
| `--shadow` | *(legacy alias of `--shadow-sm`)* | `var(--shadow-sm)` | `var(--shadow-sm)` |
| `--shadow-focus` | `shadow-focus` | `0 0 0 3px color-mix(in srgb, var(--focus-ring) 35%, transparent)` | **theme-DEPENDENT** — `--focus-ring` is overridden in dark, so this resolves to a different colour per theme. It is not restated in `[data-theme="dark"]`; it re-resolves. |

Because `@theme inline` maps each of these onto the identically named Tailwind
utility, **`shadow-xs/sm/md/lg/xl` *are* the tokens** — the compiled rule is
literally `--tw-shadow: var(--shadow-sm)`. Only `shadow-2xl`, `shadow-inner` and
arbitrary `shadow-[…]` are raw Tailwind values, and the lint rule knows the
difference by reading the stylesheet. `--shadow` exists only because
`.card-surface` and `.home-card:active` read it; it aliases `--shadow-sm` so the
dark step is declared once instead of restated per theme.

### Motion

Easing (Tailwind: `ease-out`, `ease-std`, `ease-in-out`):

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | decelerating "settle" — entrances, lifts |
| `--ease-std` | `cubic-bezier(0.4, 0, 0.2, 1)` | standard — colour cross-fades, overlays |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | symmetric — slides, sheets |

Durations — Tailwind has no `--duration-*` namespace, so write them with the
v4 parenthesis shorthand:

| Token | Value | Use | Class |
|---|---|---|---|
| `--dur-micro` | `140ms` | icon nudge, arrow shift | `duration-(--dur-micro)` |
| `--dur-fast` | `200ms` | hover colour, borders, theme cross-fade | `duration-(--dur-fast)` |
| `--dur-card` | `220ms` | card lift, rail | `duration-(--dur-card)` |
| `--dur-slow` | `320ms` | panel / modal enter | `duration-(--dur-slow)` |
| `--dur-reveal` | `420ms` | scroll reveal | `duration-(--dur-reveal)` |
| `--dur-overlay-in` | `500ms` | Radix overlay **enter** | `data-[state=open]:duration-(--dur-overlay-in)` |
| `--dur-overlay-out` | `300ms` | Radix overlay **exit** | `data-[state=closed]:duration-(--dur-overlay-out)` |
| `--stagger` | `55ms` | staggered children | `calc(var(--stagger) * n)` |

Animations: `--animate-fade-in`, `--animate-slide-up`, `--animate-slide-down`,
`--animate-scale-in` (one-shot, tokenised duration) and `--animate-pulse-gold`
(loops keep an absolute `2s`). Transitions are **component-owned** — there is
deliberately no global `[data-theme] * { transition-* }` rule; the theme swap
animates through a View Transition instead.

### Density

`--control-height-*` are **hit** heights, not visual heights. The visual box is
set by the Button `size` variant; the target is the `::after` pseudo-element that
escapes it vertically at the button's own width. `default` renders **36px tall**
and hits **44px** — that is the whole point of the hit-area contract, and it is
why these tokens must not be read as "how big the button looks".

| Token | Value | Hit | Button sizes |
|---|---|---|---|
| `--control-height-sm` | `2rem` (32px) | 32px | `xs` / `icon-xs` |
| `--control-height-md` | `2.75rem` (44px) | 44px, **default** (WCAG 2.5.5) | `default` / `icon` |
| `--control-height-lg` | `3rem` (48px) | 48px | `lg` / `icon-lg` |
| — | *no token* | 40px | `sm` / `icon-sm` |
| `--control-padding-x-md` | `1rem` | | |
| `--touch-target-min` | `2.75rem` (44px) | house default target | |
| `--touch-target-aa-min` | `1.5rem` (24px) | WCAG 2.5.8 absolute floor | |
| `--card-gap` | `1.5rem` | equals the `gap-6` Card shipped before P3 | |

Note the suffix shift: the tokens predate the Button `size` scale and are named
for *position in the ladder*, not for the size that now owns the value —
`--control-height-sm` (32px) backs `xs`, not `sm`.

**`sm` / `icon-sm` (40px hit) is deliberately un-tokenised.** The alternative,
`--control-height-xs: 2.5rem`, would make the scale count *up* as it goes *down*
(`xs` 40px > `sm` 32px). A scale that reads that way is a worse defect than a
documented hole, and these tokens have **no consumer** — `button.tsx` sets its
visual box with `h-*` and its target with `after:-inset-y-*`, so nothing can
regress. `sm` was left at a 40px hit rather than 44 on purpose: raising it would
push the expansion to Δ = 6px and force a 12px (`gap-3`) minimum vertical gap in
the dense admin stacks.

There is deliberately no `--space-*` scale: Tailwind's spacing scale already is
one. `[data-density="compact"]` is opt-in and **must stay inside
`@media (pointer: fine)`** — compact shrinks the target below 44px, so applying
it on touch re-introduces finding A13.

### Z-index

| Token | Value |
|---|---|
| `--z-base` | `0` |
| `--z-raised` | `10` |
| `--z-sticky` | `20` |
| `--z-drawer` | `30` |
| `--z-overlay` | `40` |
| `--z-modal` | `50` |
| `--z-toast` | `60` |

Consumed as `z-index: var(--z-modal)` from hand-written CSS. Never write
`z-[999]`.

---

## Typography scale

| Token | Class | Size | Line-height | Tracking | Weight | Use for |
|---|---|---|---|---|---|---|
| `--text-display-xl` | `text-display-xl` | `clamp(2.5rem, 1.25rem + 4.8vw, 4.5rem)` | 1.04 | −0.025em | 560 | the hero H1, homepage only |
| `--text-display-lg` | `text-display-lg` | `clamp(1.875rem, 1.4rem + 2vw, 2.75rem)` | 1.1 | −0.02em | 540 | homepage section H2 |
| `--text-display-md` | `text-display-md` | `clamp(1.375rem, 1.2rem + 0.7vw, 1.75rem)` | 1.15 | −0.015em | 560 | homepage card headline (the featured service card) |
| `--text-display-sm` | `text-display-sm` | `1.125rem` | 1.35 | −0.01em | 560 | smallest serif step; **currently unused** — take it before adding a new one |
| `--text-stat` | `text-stat` | `clamp(1.75rem, 1.3rem + 1.4vw, 2.5rem)` | 1 | −0.02em | 600 | the big trust-bar numbers |
| `--text-title-lg` | `text-title-lg` | `1.5rem` | 1.25 | −0.015em | 600 | page title (admin, booking) |
| `--text-title` | `text-title` | `1.25rem` | 1.3 | −0.01em | 600 | section title |
| `--text-title-sm` | `text-title-sm` | `1.0625rem` | 1.4 | −0.005em | 600 | card title, dialog title |
| `--text-body-lg` | `text-body-lg` | `1.125rem` | 1.6 | — | 400 | lead paragraph |
| `--text-body` | `text-body` | `1rem` | 1.6 | — | 400 | **default body** |
| `--text-body-sm` | `text-body-sm` | `0.9375rem` | 1.55 | — | 400 | secondary body; lifts the 12/14px floor to 15px |
| `--text-caption` | `text-caption` | `0.8125rem` | 1.45 | — | 500 | metadata; replaces `text-xs` (12px) |
| `--text-eyebrow` | `text-eyebrow` | `0.6875rem` | 1 | **0.2em** | 500 | Geist Mono, uppercase micro-label |
| `--text-micro` | `text-micro` | `0.625rem` | 1 | **0** | 600 | glyphs in fixed boxes |
| `--text-label` | `text-label` | `0.875rem` | 1 | −0.005em | 600 | control labels, table headers |

All fifteen steps are registered in **`cn.config.mjs`** as `font-size`
utilities, and `npm run audit:classes` fails if one is ever missing from either
side. That is not bookkeeping: without it the `cn` merge engine files every one
of them as a *text colour* and a `size` variant's type scale silently deletes a
`variant`'s ink. See [Tooling](#npm-runauditclasses). A new step needs the
`globals.css` declaration, the `cn.config.mjs` entry, `npm run cn:build`, and
this table.

Fonts: `--font-sans` → Geist Sans (everywhere), `--font-mono` → Geist Mono,
`--font-display` → Fraunces. **`--font-display` resolves only inside the
homepage** — `Fraunces` is loaded by `src/components/home/home-fonts.ts` and the
variable class is applied to the homepage root only, so admin routes never
download the serif (decision Q4). Outside `/` the variable is undefined and
`font-display` safely falls back.

The display steps also have hand-written aliases for the homepage:
`.home-display-xl/lg/md/sm` mirror `--text-display-*` byte-for-byte and
`.home-display` supplies the Fraunces family; `.home-stat` mirrors
`--text-stat`, and `.home-eyebrow` mirrors `--text-eyebrow` and adds
`text-transform: uppercase`. Use them on `/` so the homepage keeps its scoped
font loading. Testimonial quotes use `.home-quote-text`, a homepage-only clamp
step (1–1.125rem, line-height 1.5) — deliberately quieter than
`--text-display-md`.

### Why `--text-micro` exists, and why it carries no tracking

`--text-eyebrow` is 11px with **0.2em** tracking. That tracking is correct for a
word ("SERVICES") and catastrophic for a glyph: at 0.2em a single digit gains
~2.2px of trailing space on each side, which pushes a one-character step numeral
out of a 16–20px container and visibly un-centres it.

`--text-micro` is the same 10px size for glyphs in fixed boxes — step numerals,
avatar initials, unread-count badges, calendar chips — and its tracking is
deliberately **0**. Do not "normalise" it to match `--text-eyebrow`, and do not
put a word in it. If you need a small tracked label, use `--text-eyebrow`; if you
need a small untracked glyph, use `--text-micro`.

> The scale is **additive by design**: `--text-body-sm` yields `text-body-sm`,
> *not* `text-sm`, so Tailwind's built-in `text-sm` / `text-xs` keep working
> untouched. Prefer the token, but nothing breaks if you reach for the built-in.

---

## Focus

The **global** rule in `globals.css` is:

```css
:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
```

That outline is the **only** perceivable keyboard focus indicator in the design
system. `--focus-ring` measures 4.03:1–5.06:1 in light and 8.77:1–11.65:1 in
dark, against every surface.

> **`--ring` is decorative only** (1.52:1 light / 1.99:1 dark). A
> `ring-ring/20` halo does not indicate focus to anyone.

### The house focus idiom

Copy this fragment onto any control:

```
focus:border-accent focus-visible:border-accent-line focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-focus/40
```

- `focus:border-accent` — mouse-focus feedback (border tint).
- `focus-visible:border-accent-line` — the accessible 3:1+ border, matching the
  shadcn primitives.
- `focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-focus/40`
  — the decorative halo. It rides *on top of* the global outline, it does not
  replace it.

Pair it with a transition that includes `box-shadow` so the halo animates:
`transition-[color,box-shadow]`.

The shadcn primitives (`input.tsx`, `textarea.tsx`, `select.tsx`,
`button.tsx`, `accordion.tsx`, `tabs.tsx`, …) use the shorter form without the
`focus:` mouse half, because they already manage their own border state:

```
focus-visible:border-accent-line focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-focus/40
```

### What you must never write

`outline-none`, `focus:outline-none`, or `focus-visible:ring-0` on an
interactive element. Any one of them removes the only focus indicator the user
can see.

#### What actually went wrong before P0.2 — read this before "fixing" it again

The story this section used to tell was wrong in a way that mattered, so it is
worth stating precisely.

**`outline-none` never suppressed anything.** Tailwind emits `.outline-none`
and `.focus\:outline-none` *inside* `@layer utilities`, while the global
`:focus-visible` rule in `globals.css` is **unlayered**. Per CSS Cascade Level 5
§6.4.4, unlayered normal declarations sort after every `@layer`, so the outline
always won. Measured in the compiled bundle:

| rule | byte offset | inside `@layer utilities` (12364–74631)? |
|---|---|---|
| `.outline-hidden` | 41018 | yes |
| `.outline-none` | 45492 | yes |
| `:focus-visible { outline: 2px solid var(--focus-ring) }` | 81106 | **no — unlayered** |

So the pre-P0.2 defect was **not** a missing indicator. It was a *faint* one:
the rule read `outline: 2px solid var(--accent)`, and `--accent` is the brand
gold `#D4AF37` — **2.10:1** on white, **1.93:1** on `--background`. WCAG 1.4.11
asks 3:1 of a non-text indicator, so the indicator was present and failed.

P0.2 fixed it by re-pointing the outline at `--focus-ring`: **5.06:1** on
`--surface` in light, **9.61:1** in dark, and never below 4.03:1 on any surface
in either theme. That is the whole defect, and it is why the rule is
`var(--focus-ring)` and not `var(--accent)`.

#### The conversion path

**Five** declaration sites on `/book` and `/login` carried
`focus:outline-none focus:ring-2 focus:ring-ring` (P5):

| Site | Field |
|---|---|
| `book/page.tsx` | the Notes textarea (step 4) |
| `book/page.tsx` | the shared `Field` input — four rendered fields: first name, last name, email, phone |
| `book/page.tsx` | the electronic-signature input (step 6 consent) |
| `login/page.tsx` | email |
| `login/page.tsx` | password |

Under the cascade above, each of those fields still showed the **2.10:1 gold
outline**, plus a decorative `--ring` halo at 1.24:1 that indicates nothing.
Neither half of the pair met 3:1. P5 replaced them with the house focus idiom,
which now inherits a 4.03:1–5.06:1 outline and an equally consistent border.

---

## Tooling

### `npm run audit:contrast`

Zero dependencies. Reads `src/app/globals.css` directly, resolves `var()`
references, composites alpha over the real backdrop, and checks a table of
pairings in **both themes**. Current result: **264 passed, 0 failed, 0 skipped**,
exit 0.

**What it enforces**

| Group | Requirement | Count |
|---|---|---|
| Ink on all four surfaces + sidebar | 4.5:1 (WCAG 1.4.3) | 25 pairs × 2 themes |
| Ink on the gold chip wash | 4.5:1, alpha composited | 2 × 2 |
| Status chips | 4.5:1 | 5 × 2 |
| `--accent-line`, `--focus-ring` | 3:1 (WCAG 1.4.11) | 6 × 2 |
| Chart series / axis | 3:1 series, 4.5:1 axis | 6 × 2 |
| No redundant restatement | every declaration in `[data-theme="dark"]` must resolve to something `:root` does not already provide — the failure names the token and its `globals.css` line | 50 |
| Token presence & shape | `--cream` **must be absent**; `--accent-surface`, `--muted-foreground`, `--chart-axis`, `--chart-surface` must alias correctly | 9 × 2 |
| `@theme inline` mappings | incl. `--color-accent = var(--accent-ink)`, `--color-cream` removed | 19 |
| Math fixtures | 89 literal values — see below | 89 |
| **Total** | | **264** |

The **no-redundant-restatement** group deserves a note too. It is the machine
half of invariant 2: one assertion per declaration inside
`[data-theme="dark"]`, resolved against the *dark* theme and compared with the
value `:root` would have provided. Resolving both sides against the same theme
is what makes the check correct for `var()` declarations — a custom property
substitutes lazily, so `--x: var(--y)` written twice is still redundant even
though `--y` resolves to a different colour per theme. A token `:root` never
declares is a **new** token, not a restatement, and is always allowed. A value
that cannot be resolved is never reported, so the gate cannot fail for a reason
the author cannot act on.

**What it deliberately does not enforce**

| Thing | Why |
|---|---|
| "One job per colour token" | a design intent, not a measurable property — review-only (see the invariants table above) |
| "The alias block / theme-independent tokens are declared exactly once" | the audit checks the tokens exist and alias correctly; it cannot see that a block was duplicated into another selector — review-only |

The **math fixtures** deserve a note. They do not read `globals.css`; they are
literal colours paired with the ratio this project has published. Their job is
to stop a bug in the audit's own maths — above all the alpha-compositing trap —
from hiding behind "the tokens moved". They include the *baseline failures* on
purpose (e.g. `#9ca3af` on `#f5f5f4` = 2.33:1) so the numbers stay honest about
what P0 fixed.

**What else it deliberately does not enforce**

| Thing | Why |
|---|---|
| `--border-accent` (1.33 / 2.62) | a decorative hairline, exempt under the WCAG 1.4.11 decoration clause. Every use is paired with a transform, shadow or rail. |
| `--border`, `--border-strong` (< 3) | structural hairlines, not UI-component boundaries. Cards are identified by surface contrast + shadow. |
| `--ring` (1.52 / 1.99) | decorative glow, never the focus indicator |
| `--chart-grid` | gridlines are decoration |
| Typography, radius, motion, density, z-index | no contrast requirement; the ESLint rules cover raw values instead |

There is deliberately **no `--fix` flag**. Silently rewriting brand values is how
a palette rots.

### `npm run audit:classes`

Contrast is a *token* property. **Class merging is not** — the same token can be
declared correctly in `globals.css` and still be silently dropped at render time,
because the `cn` engine decides which utility wins by looking the class up in
lookup tables compiled from *stock* Tailwind. That failure is invisible to
`tsc`, to `eslint`, and to `audit:contrast`; it exists only in the string `cn()`
returns.

Zero dependencies. Parses `@theme inline` out of `globals.css`, compares it with
`cn.config.mjs`, then calls the **real** engine — the one `src/lib/cn.ts`
imports — over the real `buttonVariants` matrix. Current result: **116 checks,
0 failed**, exit 0.

**What it enforces**

| Group | Requirement |
|---|---|
| Token registration | every `--text-*` step in `@theme inline` is registered in `cn.config.mjs`, and vice versa — 2 directional checks |
| Classification | each of the 15 steps survives next to a colour **and** beats a sibling step, i.e. it is in the `font-size` group, not `text-color` |
| Table freshness | the generated `src/lib/cn-tables.ts` merges identically to a fresh compile of `cn.config.mjs` |
| Button matrix | all 7 variants × 8 sizes keep the variant's ink alongside the size's type-scale token, checked both through `cn(buttonVariants(…))` and layer-by-layer so a failure names the cause |
| Precedence | a `className` colour still beats the variant colour, and still leaves the size's font-size intact |
| Other families | `rounded-*`, `shadow-*`, `ease-*` and `duration-(--dur-*)` collapse to the last of their own group and never collide with a colour |
| Import surface | no `src/**` file imports `cn`, `clsx` or `tailwind-merge` directly |

#### Why this gate exists — the regression it was written for

Components imported `cn` straight from the npm package. Its stock config has two
open-ended validators: `theme.text` is `[isTshirtSize]`, so `body-sm` is *not* a
font size, and `theme.color` is `[isAny]`, so `text-body-sm` **is** a text colour.
Every step in the table above was therefore filed under `text-color`, and
`text-color` conflicts with `text-color`. Since `cva` emits base → variant →
size → `className`, the `size` variant's type scale evicted the `variant`'s ink:

```ts
cn("bg-accent-fill text-primary-foreground", "text-body-sm")
// stock cn  -> "bg-accent-fill text-body-sm"          text-primary-foreground GONE
// this repo -> "bg-accent-fill text-primary-foreground text-body-sm"
```

Gold (`#D4AF37`) CTAs then inherited `--text`. Light mode hid it (`--text` and
`--primary-foreground` are both `#0e0f10`); dark mode put `#F8F9FA` on gold at
**1.99:1**. Two `className` workarounds had grown up to compensate, and were
deleted once the cause was fixed.

#### Changing it

`cn.config.mjs` is the source of truth for the merge tables. Add a token to
`globals.css` and the gate fails until you also add it there, then:

```powershell
npm run cn:build   # regenerates src/lib/cn-tables.ts from cn.config.mjs
npm run audit:classes
```

`--full` is deliberate: subsetting would drop any class group no scanned file
happens to mention, which would let a dynamically built class name stop merging
with no warning. The output is 13.9 KB / 5.4 KB gzip — ~0.4 KB more than the
stock tables it replaces.

**One `cn`, always.** Import it from `@/lib/cn` (or `@/lib/utils`, which
re-exports it). The gate fails if any component reaches past it, because that is
both how the regression got in and the only way back.

---

## Guardrails

Seven local ESLint rules in **`eslint-local-rules/`**, wired into
`eslint.config.mjs` as `aether-theme/*`, scoped to `src/**/*.{ts,tsx}`, at
**`error`**. A local plugin is a local module — `package.json` is unchanged.

| Rule | Bans | Use instead |
|---|---|---|
| `no-accent-as-fill` | `bg-accent`, `bg-accent/50`, `hover:bg-accent` | `bg-accent-fill` / `bg-accent-surface` |
| `no-accent-hover-confusion` | `bg-accent-hover` | `bg-accent-fill-hover` |
| `no-raw-font-size` | `text-[14px]`, `text-[0.9375rem]` | `text-body-sm`, `text-caption`, … |
| `no-raw-radius` | `rounded-md/lg/xl/2xl/3xl/4xl/full` | `rounded-control/card/chip/pill` |
| `no-raw-shadow` | `shadow-2xl`, `shadow-inner`, `shadow-[…]` | `shadow-xs/sm/md/lg/xl/focus` |
| `no-raw-duration` | `duration-300` | `duration-(--dur-fast)` |
| `no-focus-outline-none` | `outline-none` on an interactive element | the house focus idiom |

### How they avoid matching comments

**A comment is not an AST node.** The rules never call `getText()` and never
scan source; they read only `Literal.value` and `TemplateElement.value.cooked`,
walking via `sourceCode.visitorKeys`. A `// …` or `/* … */` lives only in the
token stream between nodes and can never reach either.

This matters because of a real regression: an earlier pass scanned raw source,
found the word *shadow* in an English comment, and Tailwind compiled a dead
`.shadow{}` rule into the production bundle.

That trap has a second edge, and the plugin fell into it too. Tailwind v4 scans
**every un-ignored file in the repo** — `.md` and `.mjs` included — so the
plugin's own prose, which has to name the utilities it bans, re-emitted
`.shadow{}`, `.shadow-2xl{}` and `.shadow-inner{}`: **668 bytes of dead rules**.
Two layers now stop it, and both are load-bearing:

1. **No contiguous literal.** `eslint-local-rules/` names utilities by role or by
   custom property, and `lib/rules.mjs` assembles the spellings it genuinely
   needs from fragments (`spell("sha", "dow-")`).
2. **A `@source not` guard** — `@source not "../../eslint-local-rules";` at the
   top of `globals.css`, resolved from that file's directory. Even a careless
   edit that reintroduces a literal stays harmless.

`README.md` at the repo root, `scripts/`, and the root `*.mjs` configs were
audited the same way and emit no dead rule. Every other `*.md` in the repo is
excluded by `.gitignore` (`*.md` + `!README.md`) and so is outside the scanner.

A string is only inspected when it is *positionally* a class string: the value
of a `className` attribute, an argument to `cn` / `clsx` / `cva` /
`classNames` / `twMerge`, or the initialiser of a `*Class` constant. Class
strings are then split on whitespace (bracket- and paren-aware) and matched token
by token. Each violation is reported at the **offending token's own range**, so
two problems on one long `className` land on two different columns.

`globals.css` is never linted — ESLint does not parse CSS, and the rules are
scoped to `.ts`/`.tsx` anyway, so the token declarations and the protected
`.home-*` block are out of reach by construction. See
[`eslint-local-rules/README.md`](eslint-local-rules/README.md).

---

## Adding a shadcn component

1. **Run the CLI.** `npx shadcn@latest add <name>` (not pinned in
   `package.json`; `components.json` is at the repo root, style `new-york`,
   `cssVariables: true`). It writes into `src/components/ui/` via the `ui`
   alias.
2. **Check `git diff src/app/globals.css`.** The CLI edits that file. It is
   hand-owned and structured in nine deliberate sections — revert anything it
   appended, and hand-place a token instead if one is genuinely needed.
3. **`bg-accent` → `bg-accent-fill` or `bg-accent-surface`.** Stock shadcn emits
   `bg-accent` for its subtle-hover surfaces. `bg-accent` is gold **ink**
   (`#7A5C12`); you want the wash. This is the single highest-value check on the
   list — see rule 2 above.
4. **Focus.** Stock shadcn puts its focus affordance on a `ring-*` utility. In
   this system that ring is decoration, so replace whatever focus styling the
   component ships with the house focus idiom — and never let it emit
   `outline-none` on a control.
5. **Radius.** `rounded-md` / `rounded-lg` / `rounded-xl` → `rounded-chip` /
   `rounded-control` / `rounded-card`.
6. **Raw values.** `text-[13px]` → a type token; `duration-300` →
   `duration-(--dur-fast)`; `shadow-2xl` → `shadow-xl`; `rounded-full` →
   `rounded-pill`.
7. **Status colours.** Replace any `text-red-500` / `bg-green-100` with
   `text-error` / `bg-success-bg` etc. The `-c` suffix on neutral is not a typo.
8. **Keep the `className` passthrough** (`cn(base, className)`) so callers can
   extend the primitive.
9. **Run all five gates** and expect a clean exit from each:
   ```powershell
   npm run audit:contrast   # 264 passed, 0 failed
   npm run audit:classes    # 116 checks, 0 failed
   npx tsc --noEmit
   npm run lint             # 0 errors, 0 warnings
   npm run build
   ```
10. **Update this file** if you added a token. A token that exists in
    `globals.css` but not here is a trap for the next reader.
11. **Register a new token in `cn.config.mjs` too**, then `npm run cn:build`.
    A `@theme` token the merge tables do not know is not inert — it lands in
    whatever catch-all group matches its prefix. See
    [`audit:classes`](#npm-runauditclasses).

---

## Known exceptions

Real, current, and deliberate. Not a to-do list.

| Thing | Where | Why |
|---|---|---|
| `rounded-sm` (4px), `rounded-xs` (2px) | 8 sites in `data-table.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `sheet.tsx` | No `--radius-*` mapping backs them (only the four semantic ones are in `@theme inline`), and they are used on micro-elements like icon buttons and separators — not on a control, card or chip. Not banned. |
| `shadow-none` | 5 sites | Not a shadow value; it cancels Chrome's UA inset shadow on `<input>`/`<select>`. |
| `outline-none` on `DialogContent` / `PopoverContent` | `dialog.tsx`, `popover.tsx` | **Belt-and-braces, not a suppression.** Radix convention on a non-focusable overlay panel, and it does not need to do anything: the global `:focus-visible` rule is unlayered and wins over the layered utility anyway (see [§ Focus](#focus)), so this declaration is inert either way. Keep it as a guard for the day the focus rule is moved into a layer; delete it if it ever produces a visible ring on a panel. Never copy it to a control. |
| `DropdownMenuItem` has no `transition` — the hover wash **snaps** | `dropdown-menu.tsx:76,94,130,213` | **Intentional. Do not add one.** Keyboard menu navigation is a discrete, ordered sequence; a cross-fade makes the active item lag the caret. This is the one primitive that lost its animation when the global `[data-theme] *` transition rule was deleted (finding B3) — that deletion was the point. |
| `transition: box-shadow 0.2s ease, …` | `.card-surface` in `globals.css` | A raw `0.2s`, equivalent to `--dur-fast`. Inside the hand-owned stylesheet, which ESLint does not lint. |
| `transition: transform 260ms …` | `.home-card__rail` in `globals.css` | Raw `260ms` inside the DESIGN.md-protected `.home-*` block. Untouched by P0–P5 on purpose. |
| `accent-[#E4B90F]` | `book/page.tsx` consent checkbox | `accent-*` is the CSS property for a checkbox's native tick colour, not a Tailwind background utility. Out of scope for the accent-role rules. |
| `.gradient-gold` / `.gradient-gold-text` | `globals.css` | Hard-code `#D4AF37 → #E6C76B`. A gradient cannot read a `var()` pair. |
| `after:content-['']` — a redundant-looking declaration | `button.tsx` base, `select.tsx` `size="sm"`, `data-table.tsx` `toolbarInputClass` | **Belt-and-braces, not an artefact.** Tailwind's `after:` variant emits `content: var(--tw-content)` and `@property --tw-content` has `initial-value: ""` — so on any browser with `@property` the pseudo renders without it. On browsers WITHOUT it (Safari < 16.4, Firefox < 128) `--tw-content` is an unregistered custom property, `content: var(--tw-content)` fails at computed-value time, `content` computes to `normal`, and **no pseudo-element is generated at all** — the control silently loses its entire hit area. Cost: one declaration. Never "clean it up" as redundant. |
| The `::after` hit expansion is clipped by any clipping ancestor | `ui/table.tsx` (`overflow-x-auto`, which forces computed `overflow-y: auto`) | **Known weakness, not a bug.** Inside `<DataTable>` it is neutralised by `[&>div]:overflow-visible` (`data-table.tsx:173`), so the only real exposure is `appointments-list.tsx`'s own scrollport, where the first and last visible rows lose up to 4px of expansion at the edge. Every visual box there is ≥ 28px, so WCAG 2.5.8 still holds. `left-0 right-0` means there is **no** horizontal overhang, so dense `gap-1` toolbars are unaffected. |