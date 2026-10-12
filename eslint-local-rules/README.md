# eslint-local-rules

A **local ESLint plugin** — a plain module inside the repo. Nothing here is an
npm dependency; `package.json` is untouched. `eslint.config.mjs` imports
`./eslint-local-rules/index.mjs` directly and registers the seven rules as
`aether-theme/*`, scoped to `src/**/*.{ts,tsx}`.

| Rule | Bans | Use instead |
|---|---|---|
| `no-accent-as-fill` | the gold-**ink** background, with its opacity and hover variants | the gold-fill or subtle-wash backgrounds |
| `no-accent-hover-confusion` | the gold-**ink** hover | the gold-**fill** hover |
| `no-raw-font-size` | arbitrary px/rem font sizes | a `--text-*` scale step (`--text-body-sm`, `--text-caption`, …) |
| `no-raw-radius` | Tailwind's own radius steps, **including the side-specific forms** (`rounded-l-lg`, `rounded-t-xl`, `rounded-tl-2xl`, …) | `--radius-control` / `-card` / `-chip` / `-pill` |
| `no-raw-shadow` | elevation steps that no token backs, and arbitrary elevation values | the `--shadow-*` token family |
| `no-raw-duration` | a raw millisecond step, however it is spelled | the `--dur-*` scale |
| `no-focus-outline-none` | the outline-suppression utility on an interactive element | the house focus idiom |

## Why a plugin and not `eslint-plugin-*`

These guardrails encode *this repository's* design decisions. Publishing them
would make them wrong for everyone else. A local module keeps them versioned
with the code they protect and adds zero install surface.

## Why this directory names no utility token

Tailwind v4's automatic source detection scans **every un-ignored file in the
repository — `.md` and `.mjs` included** — for class-shaped candidates. A utility
name written in prose is therefore compiled into a rule, and a rule nothing calls
is dead weight in the shipped CSS. That is not theoretical: an earlier pass that
named an elevation utility in a comment shipped 668 bytes of dead rules.

Two independent guards prevent a recurrence, and both are load-bearing:

1. **No contiguous literal.** Utilities are named by role ("the gold-ink
   background") or by their custom property (`--radius-control`). Where a rule
   genuinely needs a real spelling, `lib/rules.mjs` assembles it from fragments
   (`spell("bg-", "acc", "ent")`) so the token never appears in the file.
2. **A `@source not` guard** on this directory, in `src/app/globals.css`. Even a
   careless edit that reintroduces a literal stays harmless.

`README.md` at the repo root, `scripts/`, and the root `*.mjs` configs were
audied the same way: they emit no dead rule, so they are not covered by the
guard. `.gitignore` excludes every other `*.md` in the repo from the scan.

## How the rules avoid matching comments

This is the other load-bearing design decision, so it is worth being explicit.

**A comment is not an AST node.** In ESTree, `// …` and `/* … */` live only in
the token stream *between* nodes. They are never the `value` of a `Literal`, a
`TemplateElement`, a `Property`, or any other node type. So:

1. `lib/class-strings.mjs` walks **only** node *values* — `Literal.value` and
   `TemplateElement.value.cooked`. It never calls `sourceCode.getText()` and
   never scans a line of source.
2. The walk uses `sourceCode.visitorKeys`, not `Object.keys(node)`, so it cannot
   wander into `node.parent` (which ESLint populates and which would loop) or
   across a token boundary into neighbouring trivia.
3. A string literal is only inspected when it is *positionally* a class string:
   the value of a `className` JSX attribute, an argument to `cn`/`clsx`/`cva`/
   `classNames`/`twMerge`, or the initialiser of a `*Class` constant. A string
   in any other position is never read.
4. Class strings are then **split on whitespace** (bracket- and paren-aware) and
   matched token by token, so a `calc()` width cannot half-match and prose can
   never appear in the token stream at all.

Each violation is reported at the **offending token's own range**, not at the
whole `className` node: a long class string lights up one word, and two
violations on one attribute land on different columns.

Two further exclusions are deliberate:

- **`globals.css` is never linted.** ESLint does not parse CSS, and the rules
  are scoped to `src/**/*.{ts,tsx}` anyway. The token declarations, the
  protected `.home-*` block and `@apply` are out of reach by construction.
- **The named elevation steps that `globals.css` tokenises are not banned.**
  `@theme inline` maps each of them onto its own token, so the compiled rule is a
  `var()` reference to that token rather than a hard-coded blur. The rule reads
  `globals.css` once and subtracts whatever the stylesheet already tokenises, so
  deleting a mapping would tighten it again automatically.

## Severity

The rules were introduced at `warn`, the tree was measured at **0 warnings**,
and they were then promoted to `error`. A non-zero count is therefore a real
regression, not a known exception.

## Known limits (by design)

- `no-focus-outline-none` only fires on **decidable** elements: natively
  focusable HTML tags, or anything with `tabIndex` or an interactive `role`. A
  capitalised component is exempt because resolving what it renders needs the
  type checker, not this rule — which is why the Radix dialog and popover
  content panels (legitimate users of the pattern on a non-focusable overlay)
  stay silent. A class string with *no* element at all — a `const inputClass`
  whose value opens with the utility — is treated as interactive, because in
  this codebase those hold control styling.
- Rules run on `.ts`/`.tsx` only. Class strings written in CSS or in a `.json`
  fixture are not covered.