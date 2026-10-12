/**
 * scripts/audit-classes.mts — regression guard for custom Tailwind tokens vs. cn.
 *
 * WHY A SCRIPT AND NOT AN ESLINT RULE
 * -----------------------------------
 * ESLint sees class strings; it cannot evaluate `cn()` and never will. The bug
 * this guards against only exists in the *merge result* — stock `cn` files
 * `text-body-sm` under `text-color` (theme.color is `isAny`, theme.text is
 * `isTshirtSize`), so `cn("bg-accent-fill text-primary-foreground",
 * "text-body-sm")` returned `"bg-accent-fill text-body-sm"` and a gold CTA
 * inherited `--text` at ~1.6:1 in dark mode. `tsc` cannot see it either. So the
 * check has to actually call `cn` and look at the string it returns.
 *
 * WHAT IT ASSERTS
 * ---------------
 *  1. Every `--text-*` token in `globals.css`'s `@theme inline` is registered
 *     in `cn.config.mjs`, and vice versa (no orphans either way).
 *  2. The config compiles to a `cn` under which each `text-<token>` lands in
 *     the font-size group — proven behaviourally: it survives next to a colour
 *     and it beats a sibling font-size token.
 *  3. The *generated* tables the app actually imports (`src/lib/cn-tables.ts`)
 *     behave identically, so a stale generation cannot hide a config change.
 *  4. Every `buttonVariants` variant x size combination keeps the variant's ink
 *     alongside the size's type-scale token — the regression in its real shape.
 *  5. A `className` colour override still beats the variant colour, and still
 *     leaves the size's font-size intact.
 *  6. The other custom token families (radius / elevation / easing / duration)
 *     do not collapse into each other or into a colour.
 *  7. No component imports stock `cn`, `clsx` or `tailwind-merge` directly —
 *     that is how the bug got in and the only way back.
 *
 * Run: `npm run audit:classes`. Exits 1 on the first failing category.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createCn, type ConfigExtension } from "cn/config";

import { buttonVariants } from "../src/components/ui/button";
import { cn as wiredCn } from "../src/lib/cn";
import cnConfig from "../cn.config.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GLOBALS_CSS = join(ROOT, "src", "app", "globals.css");

/* ── 1. The authoritative token list, read out of globals.css ─────────────── */

/** Body of every `@theme inline { … }` block. */
function themeInlineBlocks(css: string): string[] {
  return [...css.matchAll(/@theme\s+inline\s*\{([\s\S]*?)\n\}/g)].map(([, body]) => body);
}

/**
 * Bare `--<namespace>-<name>:` declarations inside `@theme inline`.
 *
 * Scoped to the block and anchored to line start so `--color-text-secondary`
 * (a colour that merely contains `text`) is not mistaken for a type-scale
 * token. Sub-token modifiers (`--text-body-sm--line-height`) are dropped:
 * the trailing `--…` is Tailwind's companion-property syntax, not a step name.
 */
function themeTokens(css: string, namespace: string): string[] {
  const re = new RegExp(`^\\s*--${namespace}-([\\w-]+)\\s*:`, "gm");
  const names = themeInlineBlocks(css)
    .flatMap((block) => [...block.matchAll(re)])
    .map(([, name]) => name)
    .filter((name) => !name.includes("--"));
  return [...new Set(names)].sort();
}

/**
 * Step names registered under a class group in `cn.config.mjs`.
 *
 * A class-group definition is either the implicit-key array shorthand
 * (`["hero", "tiny"]`, key taken from the group id) or the explicit object form
 * (`{ text: [...] }`). Both are accepted so the config can be written either way.
 */
function registeredTokens(config: ConfigExtension, groupId: string): string[] {
  const defs = config.extend?.classGroups?.[groupId] ?? [];
  const names: string[] = [];
  for (const def of defs) {
    if (Array.isArray(def)) for (const name of def) names.push(String(name));
    else for (const value of Object.values(def as Record<string, unknown>)) {
      if (Array.isArray(value)) for (const name of value) names.push(String(name));
    }
  }
  return names;
}

/* ── reporting ────────────────────────────────────────────────────────────── */

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail?: string) {
  checks++;
  if (ok) {
    console.log(`  PASS  ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${label}`);
  if (detail) for (const line of detail.split("\n")) console.log(`          ${line}`);
}

function section(title: string) {
  console.log(`\n${title}\n${"-".repeat(title.length)}`);
}

/** Tokens of a merged class string, minus variant-prefixed ones (`hover:x`…). */
function plainClasses(merged: string): string[] {
  return merged.split(/\s+/).filter(Boolean).filter((c) => !c.includes(":"));
}

function has(merged: string, cls: string): boolean {
  return plainClasses(merged).includes(cls);
}

/* ── main ─────────────────────────────────────────────────────────────────── */

const css = readFileSync(GLOBALS_CSS, "utf8");
const cssTokens = themeTokens(css, "text");
const configTokens = registeredTokens(cnConfig, "font-size");

section(`Type scale — globals.css @theme inline vs cn.config.mjs (${cssTokens.length} tokens)`);
console.log(`  css:    ${cssTokens.join(" ")}`);
console.log(`  config: ${configTokens.join(" ")}`);

const onlyInCss = cssTokens.filter((t) => !configTokens.includes(t));
const onlyInConfig = configTokens.filter((t) => !cssTokens.includes(t));
check(
  "every --text-* token in globals.css is registered in cn.config.mjs",
  onlyInCss.length === 0,
  onlyInCss.length ? `unregistered: ${onlyInCss.join(", ")}` : undefined,
);
check(
  "cn.config.mjs registers no token that globals.css does not declare",
  onlyInConfig.length === 0,
  onlyInConfig.length ? `stale: ${onlyInConfig.join(", ")}` : undefined,
);

/* Compile the config fresh, and compare it against the generated tables the
   app imports. A mismatch means `npm run cn:build` was not re-run. */
const configCn = createCn(cnConfig);

section("Classification — each token must be font-size, not text-color");
for (const token of cssTokens) {
  const util = `text-${token}`;
  const survivesColour = configCn("text-primary-foreground", util);
  const beatsSibling = configCn(util, `text-${token === "caption" ? "body" : "caption"}`);
  check(
    `${util} keeps text-primary-foreground`,
    has(survivesColour, "text-primary-foreground") && has(survivesColour, util),
    `merged: ${survivesColour}`,
  );
  check(
    `${util} beats a sibling type-scale token`,
    !beatsSibling.includes(util) && beatsSibling.split(/\s+/).length === 1,
    `merged: ${beatsSibling}`,
  );
}

section("Generated tables match the config (src/lib/cn-tables.ts is up to date)");
let stale = 0;
for (const token of cssTokens) {
  const util = `text-${token}`;
  const probe = `text-primary-foreground ${util} text-title`;
  if (configCn(probe) !== wiredCn(probe)) {
    stale++;
    if (stale <= 3) {
      console.log(
        `          ${util}: config -> "${configCn(probe)}"  |  wired -> "${wiredCn(probe)}"`,
      );
    }
  }
}
check(
  `all ${cssTokens.length} tokens merge identically through the wired cn`,
  stale === 0,
  stale ? `${stale} token(s) differ — run \`npm run cn:build\`` : undefined,
);

/* ── the regression in its real shape ─────────────────────────────────────── */

const variants = ["default", "destructive", "danger", "outline", "secondary", "ghost", "link"] as const;
const sizes = ["xs", "sm", "default", "lg", "icon-xs", "icon-sm", "icon", "icon-lg"] as const;

/**
 * Split cva's layers so every expectation is derived from the real component
 * rather than hard-coded: `variant: null` / `size: null` isolate one axis each,
 * exactly the way `cn` sees them at the call site (`Button` merges the whole
 * string, but the conflict happens between these two layers).
 */
const inkOf = (s: string) =>
  plainClasses(s).filter((c) => c.startsWith("text-") && !cssTokens.includes(c.slice(5)));
const typeOf = (s: string) => plainClasses(s).filter((c) => cssTokens.includes(c.slice(5)));
const variantLayer = (variant: (typeof variants)[number]) =>
  buttonVariants({ variant, size: null });
const sizeLayer = (size: (typeof sizes)[number]) =>
  buttonVariants({ variant: null, size });

section("buttonVariants — every variant x size keeps its ink");
for (const variant of variants) {
  const variantOnly = variantLayer(variant);
  const ink = inkOf(variantOnly);
  if (ink.length === 0) {
    console.log(`  n/a   ${variant}: no foreground by design (inherits --text)`);
    continue;
  }
  for (const size of sizes) {
    const sizeOnly = sizeLayer(size);
    const sizeType = typeOf(sizeOnly);
    // Exactly how the component merges it, with no className.
    const rendered = wiredCn(buttonVariants({ variant, size }));
    // And layer-by-layer, so a failure names the cause.
    const layered = wiredCn(variantOnly, sizeOnly);
    const ok =
      ink.every((c) => has(rendered, c)) &&
      sizeType.every((c) => has(rendered, c)) &&
      ink.every((c) => has(layered, c)) &&
      sizeType.every((c) => has(layered, c));
    check(
      `${variant.padEnd(11)} / ${size.padEnd(8)} ${[...ink, ...sizeType].join(" + ") || "(no ink)"}`,
      ok,
      `rendered: ${rendered}\n          layered:  ${layered}`,
    );
  }
}

section("className precedence — a colour override still beats the variant colour");
const override = wiredCn("text-primary-foreground", "text-body-sm", "text-red-500");
console.log(`  cn("text-primary-foreground", "text-body-sm", "text-red-500")`);
console.log(`    -> "${override}"`);
check("text-red-500 wins the colour slot", has(override, "text-red-500"), `merged: ${override}`);
check(
  "text-body-sm survives a colour override",
  has(override, "text-body-sm"),
  `merged: ${override}`,
);
check(
  "text-primary-foreground is evicted by the later colour",
  !has(override, "text-primary-foreground"),
  `merged: ${override}`,
);
check(
  "a later type-scale token still beats an earlier one",
  wiredCn("text-body-sm", "text-lg") === "text-lg",
  `merged: ${wiredCn("text-body-sm", "text-lg")}`,
);

/* ── other custom token families ──────────────────────────────────────────── */

section("Other custom token families");

const radius = themeTokens(css, "radius");
const elevation = themeTokens(css, "shadow");
const easing = themeTokens(css, "ease");

for (const step of radius) {
  const util = `rounded-${step}`;
  check(
    `${util} overrides a stock radius step`,
    wiredCn("rounded-lg", util) === util,
    `merged: ${wiredCn("rounded-lg", util)}`,
  );
  check(
    `${util} overrides another custom radius step`,
    wiredCn("rounded-control", util) === util,
    `merged: ${wiredCn("rounded-control", util)}`,
  );
  check(
    `${util} is not swallowed by a text colour`,
    wiredCn("text-accent", util) === `text-accent ${util}`,
    `merged: ${wiredCn("text-accent", util)}`,
  );
}
check("radius steps found in globals.css", radius.length > 0, `found: ${radius.join(", ")}`);

for (const step of elevation) {
  const util = `shadow-${step}`;
  check(
    `${util} overrides another elevation step`,
    wiredCn("shadow-md", util) === util,
    `merged: ${wiredCn("shadow-md", util)}`,
  );
  // Elevation and shadow colour are separate groups, so neither may evict the
  // other. This is the check that would have caught `shadow-focus`: it is not a
  // t-shirt size, and stock cn filed it under `shadow-color` because
  // `theme.color` is `isAny` — so it *did* evict `shadow-red-500`.
  const withColour = wiredCn("shadow-red-500", util);
  const colourLast = wiredCn(util, "shadow-red-500");
  check(
    `${util} is elevation, not a shadow COLOUR (theme.color is isAny)`,
    has(withColour, "shadow-red-500") && has(withColour, util) && has(colourLast, "shadow-red-500"),
    `shadow-red-500 + ${util}: ${withColour}\n          ${util} + shadow-red-500: ${colourLast}`,
  );
}
check("elevation steps found in globals.css", elevation.length > 0, `found: ${elevation.join(", ")}`);

for (const step of easing) {
  const util = `ease-${step}`;
  check(
    `${util} overrides another easing step`,
    wiredCn("ease-out", util) === util,
    `merged: ${wiredCn("ease-out", util)}`,
  );
}
check("easing steps found in globals.css", easing.length > 0, `found: ${easing.join(", ")}`);

/* Durations are consumed as `duration-(--dur-fast)`, not as `duration-fast`;
   the `--dur-*` scale is never mapped into @theme, so there is nothing to
   register. Assert the arbitrary-variable spelling resolves as a duration and
   that it is not mistaken for a raw numbered step. */
const durations = [...css.matchAll(/^\s*--dur-([\w-]+)\s*:/gm)].map(([, step]) => step);
for (const step of durations) {
  const util = `duration-(--dur-${step})`;
  check(
    `${util} overrides a raw numbered duration`,
    wiredCn("duration-300", util) === util,
    `merged: ${wiredCn("duration-300", util)}`,
  );
}
check("duration tokens found in globals.css", durations.length > 0, `found: ${durations.join(", ")}`);

/* ── import surface ───────────────────────────────────────────────────────── */

section("Import surface — one cn, no stock clsx/tailwind-merge");

const FORBIDDEN = [
  { spec: "cn", re: /from\s*["']cn["']/ },
  { spec: "clsx", re: /from\s*["']clsx["']/ },
  { spec: "tailwind-merge", re: /from\s*["']tailwind-merge["']/ },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|mts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const offenders: string[] = [];
for (const file of sourceFiles(join(ROOT, "src"))) {
  const text = readFileSync(file, "utf8");
  for (const { spec, re } of FORBIDDEN) {
    if (re.test(text)) offenders.push(`${relative(ROOT, file).split(sep).join("/")} imports "${spec}"`);
  }
}
check(
  "no src/** file imports stock cn / clsx / tailwind-merge",
  offenders.length === 0,
  offenders.join("\n"),
);

/* ── summary ──────────────────────────────────────────────────────────────── */

console.log(
  `\n${failures === 0 ? "audit:classes OK" : `audit:classes FAILED`} — ${checks - failures}/${checks} checks passed`,
);
if (failures > 0) process.exit(1);