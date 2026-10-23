# Aether Dental design system

The application uses a light-first monochrome system for patient and staff
surfaces. The source of truth is `src/app/globals.css`; this document records
the contracts that are easy to miss when changing components.

## Theme contract

- `:root` defines the light theme. `[data-theme="dark"]` overrides only values
  that differ.
- Tailwind's `dark:` variant is explicitly bound to that same attribute with
  `@custom-variant dark`. Manual Light, Dark, and System modes therefore use
  one selector path.
- `ThemeProvider` owns preference, persistence, system-theme listening, and the
  optional view transition. `public/theme-init.js` applies the initial value
  before paint.
- `src/lib/cn.ts` is the only class merger. Its generated tables understand the
  custom type, radius, shadow, and easing tokens. Run `npm run audit:classes`
  after changing those families.

## Palette

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | `#fafafa` | `#1b1b1f` | Page background |
| Raised surface | `#ffffff` | `#232328` | Cards, menus, dialogs |
| Alternate surface | `#f4f4f5` | `#2b2b32` | Toolbars, fields, selected rows |
| Primary ink | `#27272a` | `#e4e4e7` | Headings and primary text |
| Secondary ink | `#52525b` | `#c4c4cc` | Supporting text |
| Muted ink | `#62626c` | `#a1a1aa` | Metadata and placeholders |
| Primary action | `#34343b` | `#454550` | Charcoal buttons and active navigation |
| Primary action ink | `#f4f4f5` | `#f4f4f5` | Text/icons on primary actions |

Green, amber, red, and blue are reserved for success, warning, error, and
informational states. They must include a text or icon cue when they carry
meaning. Trends stay neutral; Status Breakdown retains semantic status colors.

The compatibility accent roles remain because existing components consume
them:

- `--accent` / `bg-accent-fill`: primary surface.
- `--accent-ink` / `text-accent`: readable emphasis ink.
- `--accent-line`: functional selected/focus-adjacent border.
- `--accent-surface`: subtle hover or selection wash.

New shared components should prefer standard shadcn semantic utilities such as
`bg-primary`, `text-primary-foreground`, `bg-muted`, `text-muted-foreground`,
and `border-border`.

## Component standards

- Controls use `rounded-control` (8px), cards and overlays use `rounded-card`
  (10px), compact chips use `rounded-chip` (6px), and avatars use
  `rounded-pill`.
- Default fields are 44px high. Dense admin toolbar controls may render at
  36px when their existing pseudo-element preserves the larger hit area.
- `Button`, `Input`, `Textarea`, `Select`, `Dialog`, `Sheet`, `Card`, menus,
  tabs, and form helpers in `src/components/ui` are the shared implementations.
  Feature code should use them when behavior matches.
- Cards use restrained borders and `shadow-xs`. Menus and modal surfaces use
  stronger elevation. Decorative blur is limited to overlay backdrop context.
- Admin layouts are dense and data-first. Public pages use the same tokens with
  larger section spacing and more generous reading measure.

## Typography and motion

Geist Sans is the interface and display family. Geist Mono is reserved for
compact metadata, identifiers, and uppercase micro-labels. Use the semantic
type utilities (`text-title*`, `text-body*`, `text-caption`, `text-eyebrow`,
and `text-stat`) where a shared role exists.

Motion is component-owned. Fast feedback uses 150–200ms; cards use 220ms;
dialogs and reveals use 250ms, with exits at 200ms. Animate transform and
opacity where possible. Every optional effect must resolve to its final state
under `prefers-reduced-motion`.

## Accessibility and validation

The global `:focus-visible` outline is the accessible focus indicator. Shared
controls may add a softer decorative ring but must not suppress the outline.
Normal text requires 4.5:1 contrast; meaningful non-text states require 3:1.

Run these gates after theme or shared-component changes:

```text
npm run typecheck
npm run lint
npm run audit:contrast
npm run audit:classes
npm test
```

Use the theme browser test for manual-mode persistence, opposite OS preference,
Tailwind `dark:` activation, and reduced-motion behavior. Review representative
public and admin screens at mobile and desktop widths in both themes.
