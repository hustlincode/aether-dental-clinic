#!/usr/bin/env node
/**
 * scripts/audit-contrast.mjs
 *
 * WCAG 2.1 contrast audit for the Aether Dental token layer.
 *
 * Zero dependencies. Reads `src/app/globals.css` directly so the audit can
 * never drift from the stylesheet, resolves `var()` references, composites
 * alpha colours over their real backdrop, and checks a table of pairings.
 *
 *   node scripts/audit-contrast.mjs      (npm run audit:contrast)
 *
 * Exit code 1 if any contract pair, math fixture, token-mapping assertion, or
 * no-redundant-restatement assertion fails. There is deliberately no `--fix`:
 * silently rewriting brand values is how a palette rots.
 *
 * Math (WCAG 2.1 §"relative luminance"):
 *   c_lin = c/12.92                     for c <= 0.03928
 *         = ((c + 0.055) / 1.055) ** 2.4 otherwise
 *   L     = 0.2126 R + 0.7152 G + 0.0722 B          (linearised sRGB)
 *   ratio = (L_lighter + 0.05) / (L_darker + 0.05)
 * (The 2.2 errata moved the knee to 0.04045; no token channel in this file
 * falls in the 0.03928–0.04045 band, so the two are identical here.)
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS_PATH = path.join(ROOT, "src", "app", "globals.css");

const MAX_DEPTH = 10;
const FIXTURE_TOLERANCE = 0.03; // Appendix A rounds to 2dp; allow compositing rounding too.

/* ────────────────────────── CSS parsing ────────────────────────── */

const css = readFileSync(CSS_PATH, "utf8");
// No custom property in this stylesheet is defined inside a comment; blank them
// out so a brace or a sample colour in prose can never confuse the block matcher.
// Blanking (rather than deleting) also preserves byte offsets and line numbers,
// which the redundancy contract below reports against.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

function extractBlockSpans(source, selectorPattern) {
  const spans = [];
  const re = new RegExp(selectorPattern + "\\s*\\{", "g");
  let match;
  while ((match = re.exec(source)) !== null) {
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    spans.push({ body: source.slice(bodyStart, i - 1), bodyStart });
  }
  return spans;
}

function extractBlocks(source, selectorPattern) {
  return extractBlockSpans(source, selectorPattern).map((span) => span.body);
}

function extractVars(block) {
  const vars = {};
  const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = re.exec(block)) !== null) {
    vars[match[1]] = match[2].trim().replace(/\s+/g, " ");
  }
  return vars;
}

function readBlockVars(source, selectorPattern) {
  // Last declaration wins, matching the CSS cascade inside one selector.
  return Object.assign({}, ...extractBlocks(source, selectorPattern).map(extractVars));
}

const lightVars = readBlockVars(cssNoComments, ":root");
const darkVars = readBlockVars(cssNoComments, '\\[data-theme="dark"\\]');
const themeVars = readBlockVars(cssNoComments, "@theme\\s+inline");

const THEMES = [
  { label: "light", vars: { ...lightVars } },
  // `[data-theme="dark"]` only overrides what it declares; everything else
  // still inherits from `:root`, exactly as the browser resolves it.
  { label: "dark", vars: { ...lightVars, ...darkVars } },
];

/* ─────────────── Contract: [data-theme="dark"] adds information ─────────────── */

/** 1-based line number of a byte offset inside the (offset-preserving) source. */
function lineAt(source, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Every `--token` declaration written inside a `[data-theme="dark"]` block, with
 * the source line it sits on. Block order and in-block order are both preserved.
 */
function darkDeclarations() {
  const declarations = [];
  for (const span of extractBlockSpans(cssNoComments, '\\[data-theme="dark"\\]')) {
    const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = re.exec(span.body)) !== null) {
      declarations.push({
        token: match[1],
        value: match[2].trim().replace(/\s+/g, " "),
        line: lineAt(cssNoComments, span.bodyStart + match.index),
      });
    }
  }
  return declarations;
}

/**
 * Canonical form of a resolved declaration value, for equality only.
 * Colours are compared through the parser so `#FFF`, `#ffffff` and
 * `rgb(255 255 255)` are recognised as the same colour; anything else is
 * compared as normalised text.
 */
function canonicalValue(value) {
  const text = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  try {
    return `color(${formatColor(parseColor(text))})`;
  } catch {
    return text;
  }
}

/**
 * Is `darkDecl` a redundant restatement of what `:root` already provides?
 *
 * Both sides are resolved against the *dark* theme, because that is the only
 * question that matters: custom properties substitute `var()` lazily against the
 * computed values of the element they sit on, so if the dark block declares
 * `--x: var(--y)` and `:root` declares `--x: var(--y)` too, removing the dark
 * declaration changes nothing even though the two resolve to different colours.
 *
 * A token `:root` never declares is a NEW token, not a restatement, and is
 * always allowed. A value that cannot be resolved is never reported: this check
 * must not fail the gate for a reason the author cannot act on.
 */
function isRedundantRestatement(token, darkDecl) {
  const lightDecl = lightVars[token];
  if (lightDecl === undefined) return false;

  const theme = THEMES[1];
  try {
    return canonicalValue(substituteVars(darkDecl, theme, `${token} @globals.css:${darkDecl.line}`))
      === canonicalValue(substituteVars(lightDecl, theme, `${token} @globals.css`, 0, []));
  } catch {
    return false;
  }
}

/* ────────────────────────── Colour maths ────────────────────────── */

function parseColor(input) {
  const value = String(input).trim().toLowerCase();
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) throw new Error(`unparseable hex colour: ${input}`);
    const expand = (c) => parseInt(c + c, 16);
    const byte = (i) => parseInt(hex.slice(i, i + 2), 16); // parseInt is base-16, so `#0E0F10` === `#0e0f10`
    if (hex.length === 3) return { r: expand(hex[0]), g: expand(hex[1]), b: expand(hex[2]), a: 1 };
    if (hex.length === 4) return { r: expand(hex[0]), g: expand(hex[1]), b: expand(hex[2]), a: expand(hex[3]) / 255 };
    if (hex.length === 6) return { r: byte(0), g: byte(2), b: byte(4), a: 1 };
    if (hex.length === 8) return { r: byte(0), g: byte(2), b: byte(4), a: byte(6) / 255 };
    throw new Error(`unparseable hex colour: ${input}`);
  }

  const fn = value.match(/^rgba?\(([^)]*)\)$/);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) throw new Error(`unparseable colour: ${input}`);
    const channel = (p) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p));
    const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    const [r, g, b] = parts.slice(0, 3).map(channel);
    if ([r, g, b].some(Number.isNaN) || Number.isNaN(alpha)) throw new Error(`unparseable colour: ${input}`);
    return { r, g, b, a: alpha };
  }

  throw new Error(`unparseable colour: ${input}`);
}

function resolveToken(name, theme, depth = 0, seen = []) {
  if (depth > MAX_DEPTH) {
    throw new Error(`--${name}: var() nesting exceeded ${MAX_DEPTH} (cycle?)`);
  }
  if (seen.includes(name)) {
    throw new Error(`--${name}: cyclic var() reference (${[...seen, name].join(" -> ")})`);
  }
  const raw = theme.vars[name];
  if (raw === undefined) throw new Error(`--${name} is not defined in the ${theme.label} theme`);

  return substituteVars(raw, theme, `${name} in ${theme.label}`, depth + 1, [...seen, name]);
}

/**
 * Substitute every `var(--x)` in a raw declaration with the value that token has
 * in `theme`. Kept separate from `resolveToken` so a *raw string* can be
 * resolved too — that is what the redundancy contract needs, because it must ask
 * "what would this declaration compute to?" rather than "what is this token?".
 */
function substituteVars(raw, theme, label, depth = 0, seen = []) {
  if (depth > MAX_DEPTH) {
    throw new Error(`${label}: var() nesting exceeded ${MAX_DEPTH} (cycle?)`);
  }
  return raw.replace(/var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^()]*))?\)/g, (_match, ref, fallback) => {
    try {
      return resolveToken(ref, theme, depth + 1, seen);
    } catch (error) {
      if (fallback !== undefined) return fallback.trim();
      throw new Error(`${label}: ${error.message}`);
    }
  });
}

function tokenColor(name, theme) {
  return parseColor(resolveToken(name, theme));
}

/**
 * Composite `color` over `backdrop` until it is fully opaque.
 * The result is rounded to 8 bits per channel because that is what a browser
 * actually paints: an alpha layer is blended into an 8-bit sRGB buffer.
 */
function flatten(color, backdrop, label) {
  if (color.a >= 1) return color;
  if (!backdrop) throw new Error(`${label}: ${formatColor(color)} has alpha ${color.a} but no backdrop was given`);
  const base = backdrop.a >= 1 ? backdrop : flatten(backdrop, null, `${label} backdrop`);
  return {
    r: Math.round(color.r * color.a + base.r * (1 - color.a)),
    g: Math.round(color.g * color.a + base.g * (1 - color.a)),
    b: Math.round(color.b * color.a + base.b * (1 - color.a)),
    a: 1,
  };
}

function relativeLuminance(color) {
  const channel = (raw) => {
    const c = raw / 255;
    const linear = c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return linear;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrastRatio(fg, bg, backdrop) {
  const opaqueBg = flatten(bg, backdrop, "background");
  const opaqueFg = flatten(fg, opaqueBg, "foreground");
  const a = relativeLuminance(opaqueFg);
  const b = relativeLuminance(opaqueBg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function formatColor(color) {
  const hex = (n) => Math.round(n).toString(16).padStart(2, "0");
  const base = `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
  return color.a >= 1 ? base.toUpperCase() : `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${+color.a.toFixed(2)})`;
}

/* ────────────────────────── Assertions ────────────────────────── */

/**
 * Contract pairs. `[fg, bg, min, label, over?, pending?]`
 *   fg/bg  token names
 *   over   token the `bg` is composited over when it carries alpha
 *   pending  ships in a later phase (P4 chart tokens) — reported, not enforced
 */
const PAIRS = [
  // ── Ink on surfaces (WCAG 1.4.3, 4.5:1) ──────────────────────────────
  ["--text", "--background", 4.5, "body text on page background"],
  ["--text", "--surface", 4.5, "body text on card"],
  ["--text", "--background-alt", 4.5, "body text on sunken surface"],
  ["--text", "--surface-alt", 4.5, "body text on alt surface"],
  ["--text-secondary", "--background", 4.5, "secondary text on page background"],
  ["--text-secondary", "--surface", 4.5, "secondary text on card"],
  ["--text-secondary", "--background-alt", 4.5, "secondary text on sunken surface"],
  ["--text-secondary", "--surface-alt", 4.5, "secondary text on alt surface"],
  ["--text-muted", "--background", 4.5, "muted text on page background"],
  ["--text-muted", "--surface", 4.5, "muted text on card"],
  ["--text-muted", "--background-alt", 4.5, "muted text on sunken surface"],
  ["--text-muted", "--surface-alt", 4.5, "muted text on alt surface"],
  ["--accent-ink", "--background", 4.5, "gold text on page background"],
  ["--accent-ink", "--surface", 4.5, "gold text on card"],
  ["--accent-ink", "--background-alt", 4.5, "gold text on sunken surface"],
  ["--accent-ink", "--surface-alt", 4.5, "gold text on alt surface"],
  ["--accent-ink-hover", "--background", 4.5, "gold hover text on page background"],
  ["--accent-ink-hover", "--surface", 4.5, "gold hover text on card"],
  ["--accent-ink-hover", "--surface-alt", 4.5, "gold hover text on alt surface"],
  ["--primary-foreground", "--accent", 4.5, "label on primary button"],
  ["--primary-foreground", "--accent-hover", 4.5, "label on primary button (hover)"],
  ["--destructive-foreground", "--destructive", 4.5, "label on destructive button"],
  ["--sidebar-text", "--sidebar-bg", 4.5, "sidebar nav text on sidebar bg"],
  ["--sidebar-text", "--sidebar-surface", 4.5, "sidebar nav text on sidebar surface"],
  ["--sidebar-text-muted", "--sidebar-bg", 4.5, "sidebar nav label on sidebar bg"],
  ["--sidebar-text-muted", "--sidebar-surface", 4.5, "sidebar nav label on sidebar surface"],

  // ── Ink on the gold chip wash (alpha background — must be composited) ──
  ["--accent-ink", "--accent-soft", 4.5, "gold text on gold chip wash", "--surface"],
  ["--text-muted", "--accent-soft", 4.5, "muted text on gold chip wash", "--surface"],

  // ── Status chips: ink on its own chip background ───────────────────────
  ["--success", "--success-bg", 4.5, "success chip", "--surface"],
  ["--warning", "--warning-bg", 4.5, "warning chip", "--surface"],
  ["--error", "--error-bg", 4.5, "error chip", "--surface"],
  ["--info", "--info-bg", 4.5, "info chip", "--surface"],
  ["--neutral", "--neutral-bg", 4.5, "neutral chip", "--surface"],

  // ── Non-text: functional accent borders & focus (WCAG 1.4.11, 3:1) ────
  ["--accent-line", "--surface", 3, "functional accent border on card", "--surface"],
  ["--accent-line", "--background", 3, "functional accent border on page", "--background"],
  ["--accent-line", "--surface-alt", 3, "functional accent border on alt surface", "--surface-alt"],
  ["--focus-ring", "--surface", 3, "focus indicator on card"],
  ["--focus-ring", "--background", 3, "focus indicator on page"],
  ["--focus-ring", "--surface-alt", 3, "focus indicator on alt surface"],

  // ── Chart palette (P4, §3.4) ────────────────────────────────────────────
  // Series geometry (stroke, dot, pie slice) is a non-text graphic: WCAG 1.4.11
  // asks for 3:1 against the surface the chart is painted on. Axis ticks are
  // text and therefore owe the full 4.5:1. `--chart-grid` is deliberately NOT
  // listed: gridlines are purely decorative and exempt from 1.4.11.
  ["--chart-1", "--chart-surface", 3, "chart series 1 stroke"],
  ["--chart-2", "--chart-surface", 3, "chart series 2 stroke"],
  ["--chart-3", "--chart-surface", 3, "chart series 3 stroke"],
  ["--chart-4", "--chart-surface", 3, "chart series 4 stroke"],
  ["--chart-5", "--chart-surface", 3, "chart series 5 stroke"],
  ["--chart-status-pending", "--chart-surface", 3, "pending status chart slice"],
  ["--info", "--chart-surface", 3, "confirmed/checked-in status chart slice"],
  ["--success", "--chart-surface", 3, "completed status chart slice"],
  ["--error", "--chart-surface", 3, "cancelled status chart slice"],
  ["--chart-status-neutral", "--chart-surface", 3, "no-show status chart slice"],
  ["--chart-axis", "--chart-surface", 4.5, "chart axis ticks (text)"],
];

/**
 * Math fixtures — literal colours with the ratio Appendix A measured.
 * These do not read globals.css; they exist so a bug in this file's own
 * colour maths (the alpha-compositing trap) cannot hide behind "the tokens
 * moved". `[fg, bg, expected, label, over?]`
 */
const FIXTURES = [
  // A.2 — ink on surfaces
  ["#5E666E", "#ffffff", 5.83, "proposed light --text-muted on #ffffff"],
  ["#5E666E", "#f5f5f4", 5.34, "proposed light --text-muted on #f5f5f4"],
  ["#5E666E", "#e7e5e4", 4.64, "proposed light --text-muted on #e7e5e4"],
  ["#5E666E", "#fafaf9", 5.58, "proposed light --text-muted on #fafaf9"],
  ["#9CA3AF", "#1F2326", 6.23, "proposed dark --text-muted on #1F2326"],
  ["#9CA3AF", "#0E0F10", 7.56, "proposed dark --text-muted on #0E0F10"],
  ["#9CA3AF", "#141516", 7.20, "proposed dark --text-muted on #141516"],
  ["#9CA3AF", "#262a2e", 5.69, "proposed dark --text-muted on #262a2e"],
  ["#44403c", "#f5f5f4", 9.42, "light --text-secondary on #f5f5f4"],
  ["#44403c", "#ffffff", 10.27, "light --text-secondary on #ffffff"],
  ["#44403c", "#e7e5e4", 8.18, "light --text-secondary on #e7e5e4"],
  ["#44403c", "#fafaf9", 9.84, "light --text-secondary on #fafaf9"],
  ["#D1D5DB", "#1F2326", 10.74, "dark --text-secondary on #1F2326"],
  ["#D1D5DB", "#0E0F10", 13.02, "dark --text-secondary on #0E0F10"],
  ["#D1D5DB", "#141516", 12.41, "dark --text-secondary on #141516"],
  ["#D1D5DB", "#262a2e", 9.81, "dark --text-secondary on #262a2e"],
  ["#7A5C12", "#ffffff", 6.24, "light --accent-ink on #ffffff"],
  ["#7A5C12", "#f5f5f4", 5.72, "light --accent-ink on #f5f5f4"],
  ["#7A5C12", "#e7e5e4", 4.97, "light --accent-ink on #e7e5e4"],
  ["#7A5C12", "#fafaf9", 5.97, "light --accent-ink on #fafaf9"],
  ["#E6C76B", "#1F2326", 9.61, "dark --accent-ink on #1F2326"],
  ["#E6C76B", "#0E0F10", 11.65, "dark --accent-ink on #0E0F10"],
  ["#E6C76B", "#141516", 11.10, "dark --accent-ink on #141516"],
  ["#E6C76B", "#262a2e", 8.77, "dark --accent-ink on #262a2e"],
  ["#5A430C", "#ffffff", 9.36, "light --accent-ink-hover on #ffffff"],
  ["#5A430C", "#f5f5f4", 8.58, "light --accent-ink-hover on #f5f5f4"],
  ["#5A430C", "#e7e5e4", 7.46, "light --accent-ink-hover on #e7e5e4"],
  ["#5A430C", "#fafaf9", 8.96, "light --accent-ink-hover on #fafaf9"],
  ["#F0DCA0", "#1F2326", 11.65, "dark --accent-ink-hover on #1F2326"],
  ["#F0DCA0", "#0E0F10", 14.12, "dark --accent-ink-hover on #0E0F10"],
  ["#F0DCA0", "#262a2e", 10.63, "dark --accent-ink-hover on #262a2e"],
  ["#7a5c12", "#ffffff", 6.24, "--home-accent-ink (unchanged) on #ffffff"],
  ["#7a5c12", "#f5f5f4", 5.72, "--home-accent-ink (unchanged) on #f5f5f4"],

  // A.2 — ink on accent fill / accent wash
  ["#0E0F10", "#D4AF37", 9.12, "label on brand gold fill"],
  ["#0E0F10", "#E6C76B", 11.65, "label on gold hover fill"],
  ["#7A5C12", "rgba(212,175,55,0.10)", 5.82, "light --accent-ink on gold wash", "#ffffff"],
  ["#E6C76B", "rgba(212,175,55,0.12)", 7.62, "dark --accent-ink on gold wash", "#1F2326"],
  // Appendix A prints 5.14 for this row. Recomputed against the composite it
  // names in the row above (#FBF7EB) the value is 5.44; 5.14 matches no
  // backdrop for this ink. Corrected here — either way it clears 4.5.
  ["#5E666E", "rgba(212,175,55,0.10)", 5.44, "light --text-muted on gold wash", "#ffffff"],
  ["#9CA3AF", "rgba(212,175,55,0.12)", 4.94, "dark --text-muted on gold wash", "#1F2326"],

  // A.2 — status chips
  ["#15803d", "#dcfce7", 4.57, "proposed light --success on its chip"],
  ["#92400e", "#fef3c7", 6.37, "proposed light --warning on its chip"],
  ["#b91c1c", "#fee2e2", 5.30, "proposed light --error on its chip"],
  ["#1d4ed8", "#dbeafe", 5.49, "proposed light --info on its chip"],
  ["#4b5563", "#f3f4f6", 6.87, "proposed light --neutral on its chip"],
  ["#16a34a", "#dcfce7", 3.00, "baseline light --success on its chip"],
  ["#d97706", "#fef3c7", 2.86, "baseline light --warning on its chip"],
  ["#dc2626", "#fee2e2", 3.95, "baseline light --error on its chip"],
  ["#2563eb", "#dbeafe", 4.24, "baseline light --info on its chip"],
  ["#6b7280", "#f3f4f6", 4.39, "baseline light --neutral on its chip"],
  ["#4ade80", "rgba(74,222,128,0.12)", 7.07, "dark --success on its chip", "#1F2326"],
  ["#fbbf24", "rgba(251,191,36,0.12)", 7.27, "dark --warning on its chip", "#1F2326"],
  ["#f87171", "rgba(248,113,113,0.12)", 4.82, "dark --error on its chip", "#1F2326"],
  ["#60a5fa", "rgba(96,165,250,0.12)", 5.06, "dark --info on its chip", "#1F2326"],
  ["#9ca3af", "rgba(156,163,175,0.12)", 5.09, "dark --neutral on its chip", "#1F2326"],

  // A.2 — non-text accent borders & focus
  ["rgba(122,92,18,0.75)", "#ffffff", 3.59, "light --accent-line on #ffffff", "#ffffff"],
  ["rgba(122,92,18,0.75)", "#f5f5f4", 3.41, "light --accent-line on #f5f5f4", "#f5f5f4"],
  ["rgba(212,175,55,0.75)", "#1F2326", 4.86, "dark --accent-line on #1F2326", "#1F2326"],
  ["rgba(212,175,55,0.75)", "#0E0F10", 5.52, "dark --accent-line on #0E0F10", "#0E0F10"],
  ["#8A6A12", "#ffffff", 5.06, "light --focus-ring on #ffffff"],
  ["#8A6A12", "#f5f5f4", 4.64, "light --focus-ring on #f5f5f4"],
  ["#E6C76B", "#1F2326", 9.61, "dark --focus-ring on #1F2326"],
  ["#E6C76B", "#0E0F10", 11.65, "dark --focus-ring on #0E0F10"],

  // A.2 — chart palette
  ["#A16207", "#ffffff", 4.92, "light --chart-1"],
  ["#1d4ed8", "#ffffff", 6.70, "light --chart-2"],
  ["#15803d", "#ffffff", 5.02, "light --chart-3"],
  ["#b91c1c", "#ffffff", 6.47, "light --chart-4"],
  ["#5E666E", "#ffffff", 5.83, "light --chart-5 (Appendix A chart table says 5.50; its own ink table says 5.83 for this same pair — 5.83 is correct)"],
  ["#D4AF37", "#1F2326", 7.53, "dark --chart-1"],
  ["#60a5fa", "#1F2326", 6.23, "dark --chart-2"],
  ["#4ade80", "#1F2326", 9.08, "dark --chart-3"],
  ["#f87171", "#1F2326", 5.72, "dark --chart-4"],
  ["#9CA3AF", "#1F2326", 6.24, "dark --chart-5"],

  // A.1 — baseline failures (these values are what the audit must reproduce
  // *before* the token change; they are kept so the maths stays honest).
  ["#9ca3af", "#f5f5f4", 2.33, "A1 baseline light --text-muted on #f5f5f4"],
  ["#9ca3af", "#ffffff", 2.54, "A1 baseline light --text-muted on #ffffff"],
  ["#4B5563", "#1F2326", 2.09, "A2 baseline dark --text-muted on #1F2326"],
  ["#4B5563", "#0E0F10", 2.54, "A2 baseline dark --text-muted on #0E0F10"],
  ["#4B5563", "#0E0F10", 2.54, "A4 baseline dark --sidebar-text-muted on #0E0F10"],
  // Appendix A prints 2.50. Its own stated effective colour for this case
  // (#969BA4, i.e. #6b7280 @70% over #fafaf9) measures 2.68; 2.50 is what
  // ~65% alpha would give. Corrected here. Baseline-only row: P0 drops the /70.
  ["rgba(107,114,128,0.70)", "#fafaf9", 2.68, "A3 baseline sidebar label @70% on #fafaf9", "#fafaf9"],
  ["#D4AF37", "#f5f5f4", 1.93, "A5 baseline gold as text on #f5f5f4"],
  ["#D4AF37", "#ffffff", 2.10, "A5 baseline gold as text on #ffffff"],
  ["#E6C76B", "#ffffff", 1.65, "A6 baseline gold-hover as text on #ffffff"],
  ["#E6C76B", "#f5f5f4", 1.51, "A6 baseline gold-hover as text on #f5f5f4"],
  ["rgba(212,175,55,0.30)", "#ffffff", 1.24, "A7 baseline light --ring on #ffffff", "#ffffff"],
  ["rgba(212,175,55,0.25)", "#0E0F10", 1.63, "A7 baseline dark --ring on #0E0F10", "#0E0F10"],
  ["#FFF8E7", "#ffffff", 1.06, "A12 baseline --cream on #ffffff"],
  ["#FFF8E7", "#f5f5f4", 1.03, "A12 baseline --cream on #f5f5f4"],

  // A.1 — baseline values that already pass (regression anchors)
  ["#D4AF37", "#1F2326", 7.53, "A1 baseline dark gold as text on #1F2326"],
  ["#D4AF37", "#0E0F10", 9.12, "A1 baseline dark gold as text on #0E0F10"],

  // A.2 — documented residual (data-table sort icon, `opacity-60` on
  // --text-muted). Decorative glyph beside a labelled header; fixed in P3.
  ["#6A7078", "#1F2326", 3.17, "residual: --text-muted @60% on #1F2326"],
];

/**
 * Token-shape assertions — the accent split and the `--cream` deletion are
 * structural, not chromatic, so a pure contrast ratio cannot catch them.
 * `[token, null (must exist) | "ABSENT" | exact expected value]`
 */
const REQUIRED_TOKENS = [
  ["--accent-ink", null],
  ["--accent-ink-hover", null],
  ["--accent-surface", "var(--accent-soft)"],
  ["--accent-line", null],
  ["--focus-ring", null],
  ["--cream", "ABSENT"],
  ["--muted-foreground", "var(--text-muted)"],
  ["--chart-axis", "var(--text-muted)"],
  ["--chart-surface", "var(--surface)"],
];

/** `@theme inline` mappings that make the Tailwind utilities mean what they claim. */
const REQUIRED_THEME_MAPPINGS = [
  ["--color-accent", "var(--accent-ink)"],
  ["--color-accent-hover", "var(--accent-ink-hover)"],
  ["--color-accent-fill", "var(--accent)"],
  ["--color-accent-fill-hover", "var(--accent-hover)"],
  ["--color-accent-soft", "var(--accent-soft)"],
  ["--color-accent-surface", "var(--accent-surface)"],
  ["--color-accent-line", "var(--accent-line)"],
  ["--color-focus", "var(--focus-ring)"],
  ["--color-ring", "var(--ring)"],
  ["--color-muted-foreground", "var(--muted-foreground)"],
  ["--color-chart-1", "var(--chart-1)"],
  ["--color-chart-2", "var(--chart-2)"],
  ["--color-chart-3", "var(--chart-3)"],
  ["--color-chart-4", "var(--chart-4)"],
  ["--color-chart-5", "var(--chart-5)"],
  ["--color-chart-grid", "var(--chart-grid)"],
  ["--color-chart-axis", "var(--chart-axis)"],
  ["--color-chart-surface", "var(--chart-surface)"],
  ["--color-cream", "ABSENT"],
];

/* ────────────────────────── Reporting ────────────────────────── */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const green = (t) => paint("32", t);
const red = (t) => paint("31", t);
const yellow = (t) => paint("33", t);
const dim = (t) => paint("90", t);
const bold = (t) => paint("1", t);

let passCount = 0;
let failCount = 0;
let skipCount = 0;
const failures = [];

function pad(text, width) {
  return String(text).padEnd(width, " ");
}
function ratio(value) {
  return `${value.toFixed(2)}:1`;
}

function heading(title) {
  console.log("");
  console.log(bold(`── ${title} ${"─".repeat(Math.max(0, 74 - title.length))}`));
  console.log(dim(`${pad("THEME", 7)}${pad("PAIR", 54)}${pad("MEASURED", 11)}${pad("MIN", 7)}RESULT`));
}

function runPair([fg, bg, min, label, over, pending]) {
  if (pending) {
    skipCount++;
    console.log(`${yellow("SKIP")}  ${pad(`(pending ${pending}) ${label}`, 70)}`);
    return;
  }
  for (const theme of THEMES) {
    const where = `${fg} on ${over ? `${bg} over ${over} ` : bg}`.trim();
    let measured;
    try {
      const fgColor = tokenColor(fg, theme);
      const bgColor = tokenColor(bg, theme);
      const backdrop = over ? tokenColor(over, theme) : undefined;
      measured = contrastRatio(fgColor, bgColor, backdrop);
    } catch (error) {
      failCount++;
      failures.push(`[${theme.label}] ${label} — ${error.message}`);
      console.log(
        `${red("FAIL")}  ${pad(theme.label, 7)}${pad(`${where} — ${label}`, 54)}${pad("error", 11)}${pad(min.toFixed(2), 7)}${red("UNRESOLVED")}`,
      );
      console.log(dim(`      ${error.message}`));
      continue;
    }

    const ok = measured >= min;
    if (ok) {
      passCount++;
      console.log(`${green("PASS")}  ${pad(theme.label, 7)}${pad(`${where} — ${label}`, 54)}${pad(ratio(measured), 11)}${pad(min.toFixed(2), 7)}${green("ok")}`);
    } else {
      failCount++;
      failures.push(`[${theme.label}] ${label}: ${ratio(measured)} < ${min.toFixed(2)}:1`);
      console.log(
        `${red("FAIL")}  ${pad(theme.label, 7)}${pad(`${where} — ${label}`, 54)}${pad(ratio(measured), 11)}${pad(min.toFixed(2), 7)}${red("below minimum")}`,
      );
    }
  }
}

/* ────────────────────────── Main ────────────────────────── */

console.log(bold("Aether Dental — WCAG 2.1 contrast audit"));
console.log(dim(`source  ${path.relative(ROOT, CSS_PATH)}`));
console.log(dim(`tokens  ${Object.keys(lightVars).length} in :root, ${Object.keys(darkVars).length} overrides in [data-theme="dark"], ${Object.keys(themeVars).length} in @theme inline`));

const isChart = (p) => String(p[3]).startsWith("chart ");

heading("Contract — ink on surfaces, 4.5:1 (WCAG 1.4.3)");
for (const pair of PAIRS.filter((p) => p[2] === 4.5 && !String(p[3]).includes("chip") && !isChart(p))) runPair(pair);

heading("Contract — status chips, 4.5:1 (WCAG 1.4.3)");
for (const pair of PAIRS.filter((p) => String(p[3]).includes("chip"))) runPair(pair);

heading("Contract — chart palette (axis is text 4.5:1, series geometry 3:1)");
for (const pair of PAIRS.filter(isChart)) runPair(pair);

heading("Contract — non-text borders & focus, 3:1 (WCAG 1.4.11)");
for (const pair of PAIRS.filter((p) => p[2] === 3 && !isChart(p))) runPair(pair);

heading(`Math fixtures — ${FIXTURES.length} literal values from Appendix A`);
for (const [fg, bg, expected, label, over] of FIXTURES) {
  let measured;
  try {
    measured = contrastRatio(parseColor(fg), parseColor(bg), over ? parseColor(over) : undefined);
  } catch (error) {
    failCount++;
    failures.push(`fixture "${label}": ${error.message}`);
    console.log(`${red("FAIL")}  ${pad(label, 54)}${red("UNPARSEABLE")}`);
    continue;
  }
  const delta = Math.abs(measured - expected);
  const ok = delta <= FIXTURE_TOLERANCE;
  if (ok) {
    passCount++;
    console.log(`${green("PASS")}  ${pad(label, 54)}${pad(ratio(measured), 11)}${pad(`≈${expected.toFixed(2)}`, 11)}${green(`ok (Δ${delta.toFixed(3)})`)}`);
  } else {
    failCount++;
    failures.push(`fixture "${label}": measured ${ratio(measured)}, Appendix A says ${expected.toFixed(2)} (Δ${delta.toFixed(3)})`);
    console.log(`${red("FAIL")}  ${pad(label, 54)}${pad(ratio(measured), 11)}${pad(`≈${expected.toFixed(2)}`, 11)}${red(`MISMATCH (Δ${delta.toFixed(3)})`)}`);
  }
}

heading("Contract — [data-theme=\"dark\"] declares only what actually differs from :root");
{
  const darkDeclarationsInFile = darkDeclarations();
  console.log(dim(`  one assertion per dark declaration (${darkDeclarationsInFile.length}); a token :root never declares is a NEW token, not a restatement`));
  for (const declaration of darkDeclarationsInFile) {
    const where = `${declaration.token} @ globals.css:${declaration.line}`;
    if (isRedundantRestatement(declaration.token, declaration.value)) {
      failCount++;
      failures.push(
        `[data-theme="dark"] ${declaration.token} (globals.css:${declaration.line}) restates the :root value `
        + `"${declaration.value}" — it changes nothing in dark mode. Delete the line, or change the value.`,
      );
      console.log(
        `${red("FAIL")}  ${pad("dark", 7)}${pad(`${where} = ${declaration.value}`, 54)}`
        + `${pad("", 11)}${pad("", 7)}${red("redundant restatement of :root")}`,
      );
    } else {
      passCount++;
      console.log(
        `${green("PASS")}  ${pad("dark", 7)}${pad(`${where} = ${declaration.value}`, 54)}`
        + `${pad("", 11)}${pad("", 7)}${green("differs from :root")}`,
      );
    }
  }
}

heading("Contract — token presence & @theme inline mapping");
for (const [token, mustBe] of REQUIRED_TOKENS) {
  for (const theme of THEMES) {
    const defined = token in theme.vars;
    if (mustBe === "ABSENT") {
      if (defined) {
        failCount++;
        failures.push(`[${theme.label}] ${token} must be deleted but is still defined (${theme.vars[token]})`);
        console.log(`${red("FAIL")}  ${pad(theme.label, 7)}${pad(`${token} should be deleted`, 42)}${pad(theme.vars[token], 11)}${pad("", 7)}${red("still defined")}`);
      } else {
        passCount++;
        console.log(`${green("PASS")}  ${pad(theme.label, 7)}${pad(`${token} deleted`, 42)}`);
      }
    } else if (!defined) {
      failCount++;
      failures.push(`[${theme.label}] ${token} is missing`);
      console.log(`${red("FAIL")}  ${pad(theme.label, 7)}${pad(`${token} should be defined`, 54)}${red("missing")}`);
    } else if (typeof mustBe === "string" && theme.vars[token].replace(/\s+/g, " ") !== mustBe) {
      failCount++;
      failures.push(`[${theme.label}] ${token} is "${theme.vars[token]}", expected "${mustBe}"`);
      console.log(`${red("FAIL")}  ${pad(theme.label, 7)}${pad(`${token} = ${theme.vars[token]}`, 54)}${red(`expected ${mustBe}`)}`);
    } else {
      passCount++;
      console.log(`${green("PASS")}  ${pad(theme.label, 7)}${pad(`${token}`, 54)}${pad(theme.vars[token], 11)}`);
    }
  }
}
for (const [token, expected] of REQUIRED_THEME_MAPPINGS) {
  const actual = themeVars[token];
  if (expected === "ABSENT") {
    if (actual !== undefined) {
      failCount++;
      failures.push(`@theme inline: ${token} should be removed but is still mapped to ${actual}`);
      console.log(`${red("FAIL")}  ${pad("@theme", 7)}${pad(`${token} removed`, 42)}${pad(actual, 11)}${red("still mapped")}`);
    } else {
      passCount++;
      console.log(`${green("PASS")}  ${pad("@theme", 7)}${pad(`${token} removed`, 42)}`);
    }
  } else if (actual === undefined) {
    failCount++;
    failures.push(`@theme inline: ${token} is missing (expected ${expected})`);
    console.log(`${red("FAIL")}  ${pad("@theme", 7)}${pad(token, 42)}${red("missing")}`);
  } else if (actual.replace(/\s+/g, " ") !== expected) {
    failCount++;
    failures.push(`@theme inline: ${token} is "${actual}", expected "${expected}"`);
    console.log(`${red("FAIL")}  ${pad("@theme", 7)}${pad(token, 42)}${pad(actual, 11)}${red(`expected ${expected}`)}`);
  } else {
    passCount++;
    console.log(`${green("PASS")}  ${pad("@theme", 7)}${pad(token, 42)}${pad(actual, 11)}`);
  }
}

console.log("");
console.log(bold(`Result: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`));
if (failCount > 0) {
  console.log("");
  console.log(red(bold("Failures:")));
  for (const failure of failures) console.log(red(`  - ${failure}`));
  console.log("");
  console.log(red("No --fix flag on purpose: brand values are changed deliberately, never by a script."));
  process.exit(1);
}
process.exit(0);
