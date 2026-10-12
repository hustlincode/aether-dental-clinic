/**
 * eslint-local-rules/lib/rules.mjs
 *
 * The seven guardrail rules. Each is a small `check(utility, interactivity)`
 * predicate over class-string utilities; the surrounding factory handles
 * extraction, message ids and reporting so the rules stay declarative.
 *
 * Every check receives the utility name with its variant prefixes already
 * stripped (a hover variant reduces to its bare utility) plus the interactivity of the
 * element the class string was found on (`true` / `false` / `null`).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  collectClassStrings,
  contentOffset,
  isInteractiveContext,
  splitClasses,
  utilityOf,
} from "./class-strings.mjs";

const GLOBALS_CSS = fileURLToPath(new URL("../../src/app/globals.css", import.meta.url));

/* ── Utility spellings ───────────────────────────────────────────────────────
 * Assembled from fragments ON PURPOSE. Tailwind v4 scans every un-ignored file
 * in the repository — this one included — for class-shaped candidates, so a
 * contiguous utility literal anywhere in here would be compiled into a dead
 * rule in the shipped bundle: the exact bug this plugin exists to prevent.
 *
 * Two independent guards exist. This one keeps the literal out of the file.
 * The other is the `@source not` guard on this directory in `globals.css`, so
 * even a careless edit that reintroduces one stays harmless. Keep both.
 *
 * The regexes are built once at module scope; `re()` exists so a global pattern
 * is never reused after its `lastIndex` has been advanced by `matchAll`.
 */
const spell = (...parts) => parts.join("");
const re = (pattern, flags) => new RegExp(pattern, flags);

/** The gold-INK background family and its hover / opacity forms. */
const BG_ACCENT = spell("bg-", "acc", "ent");
/** The elevation utilities — the prefix plus its size suffix. */
const ELEVATION = spell("sha", "dow-");
/** The utility that sets the outline style to none. */
const OUTLINE_NONE = spell("outl", "ine-none");

const RE_ACCENT_AS_FILL = re(`^${BG_ACCENT}(?![-\\w])`);
const RE_ACCENT_HOVER = re(`^${BG_ACCENT}-hover(?![-\\w])`);
const RE_OUTLINE_NONE_VARIANT = re(`^(?:focus|focus-visible|focus-within):${OUTLINE_NONE}$`);
const RE_ELEVATION_ARBITRARY = re(`^${ELEVATION}\\[`);
const RE_ELEVATION_STEP = re(`^${ELEVATION}(.+)$`);
const elevationTokenDecl = () => re(`--${ELEVATION}([\\w-]+)\\s*:`, "g");

/**
 * A raw transition duration, however it is spelled: a numbered step, an
 * arbitrary value, or an arbitrary `transition-duration` property. The
 * parenthesised custom-property shorthand (`duration-(--dur-fast)`) is the
 * tokenised form and must stay silent, so neither `\d+` nor `[` may match `(`.
 */
const RE_RAW_DURATION = re(
  `^(?:${spell("dur", "ation-")}(?:\\d+|\\[)|\\[${spell("transition-dur", "ation")}:)`,
);

/**
 * Tailwind's named elevation scale. A step that `globals.css` maps in
 * `@theme inline` is NOT a raw value: the emitted rule is a `var()` reference
 * to that token, verified against the compiled bundle. So the rule only bans
 * steps that are still Tailwind's own hard-coded values, and it derives that set
 * from the stylesheet — deleting a mapping tightens the rule again automatically.
 *
 * Steps known to be raw today if the stylesheet is unreadable.
 */
const FALLBACK_RAW_ELEVATION_STEPS = ["2xs", "2xl", "inner"];
let cachedRawElevationSteps = null;

function rawElevationSteps() {
  if (cachedRawElevationSteps) return cachedRawElevationSteps;
  try {
    const css = readFileSync(GLOBALS_CSS, "utf8");
    const tokenised = new Set(
      [...css.matchAll(/@theme\s+inline\s*\{([\s\S]*?)\n\}/g)]
        .flatMap(([, block]) => [...block.matchAll(elevationTokenDecl())])
        .map(([, step]) => step),
    );
    cachedRawElevationSteps = new Set(
      ["2xs", "xs", "sm", "base", "md", "lg", "xl", "2xl", "inner"]
        .filter((step) => !tokenised.has(step)),
    );
  } catch {
    cachedRawElevationSteps = new Set(FALLBACK_RAW_ELEVATION_STEPS);
  }
  return cachedRawElevationSteps;
}

/**
 * Tailwind's named radius steps — on any of their SIDE-SPECIFIC forms.
 * `rounded-l-lg` / `rounded-t-xl` / `rounded-tl-2xl` are just as raw as
 * `rounded-lg`; anchoring the pattern to a bare step let every side-specific
 * spelling through while it was still an untokenised Tailwind step.
 *
 * The side prefix is optional, so the plain forms keep matching too.
 *
 * `sm` and `xs` are deliberately NOT in the step list, here or above: THEME.md
 * § Known exceptions records them as unbanned micro-element steps with no
 * `--radius-*` mapping behind them. Keeping the side forms consistent with the
 * plain ones matters more than widening the ban.
 */
const RE_RAW_RADIUS = re("^rounded-(?:[trblse]{1,2}-)?(?:md|lg|xl|2xl|3xl|4xl|full)$");

/**
 * Build a rule from a predicate over class-string utilities.
 *
 * @param {object}   options
 * @param {string}   options.description one line for `meta.docs.description`
 * @param {string}   options.url          THEME.md anchor the message points at
 * @param {Function} options.check        (utility, interactivity, bannedSteps) => messageId | null
 */
function createRule({ description, url, check }) {
  return {
    meta: {
      type: "problem",
      docs: {
        description: `${description} See THEME.md § ${url}.`,
        recommended: true,
      },
      schema: [],
      messages: {
        accentAsFill:
          `\`${BG_ACCENT}\` is gold INK (--accent-ink), not gold fill. Use a gold-surface or subtle-wash background instead. (THEME.md § Accent roles)`,
        accentHover:
          `\`${BG_ACCENT}-hover\` is a gold-INK hover, not a gold-fill hover. Use the gold-fill hover background. (THEME.md § Accent roles)`,
        rawFontSize:
          "Raw font size. Use a type-scale token: text-display-xl/lg/md/sm, text-stat, text-title-lg/title/title-sm, text-body-lg/body/body-sm, text-caption, text-eyebrow, text-micro, text-label. (THEME.md § Typography scale)",
        rawRadius:
          "Raw radius step. Use the semantic radius tokens --radius-control (0.5rem), --radius-card (0.75rem), --radius-chip (0.375rem), --radius-pill (9999px). (THEME.md § Radius)",
        rawElevation:
          `Raw Tailwind elevation. Use the --${ELEVATION}* token family instead. (THEME.md § Elevation)`,
        rawDuration:
          "Raw transition duration. Use the --dur-* scale: --dur-micro, --dur-fast, --dur-card, --dur-slow, --dur-reveal, --dur-overlay-in, --dur-overlay-out. (THEME.md § Motion)",
        focusOutlineNone:
          `\`${OUTLINE_NONE}\` suppresses the intended focus outline — keep the house focus idiom so the indicator stays consistent. `
          + "The global `:focus-visible` rule is unlayered, so under the cascade it wins over this utility anyway; the utility buys nothing visually and hides the intent from the next reader. (THEME.md § Focus)",
      },
    },

    create(context) {
      return {
        Program(program) {
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const bannedSteps = rawElevationSteps();
          const classStrings = collectClassStrings(program, sourceCode.visitorKeys);

          for (const classString of classStrings) {
            for (const { token, start, end } of splitClasses(classString.text)) {
              const utility = utilityOf(token);
              if (!utility) continue;
              const messageId = check(utility, classString.interactivity, bannedSteps);
              if (!messageId) continue;

              // Point at the offending token, not at the whole className node:
              // a 400-character class string would otherwise light up entirely,
              // and two violations on one attribute would share a position.
              const origin = classString.node.range[0] + contentOffset(classString.node);
              context.report({
                loc: {
                  start: sourceCode.getLocFromIndex(origin + start),
                  end: sourceCode.getLocFromIndex(origin + end),
                },
                messageId,
              });
            }
          }
        },
      };
    },
  };
}

/* ── the checks ────────────────────────────────────────────────────────── */

const CHECKS = {
  "no-accent-as-fill": (utility) =>
    // The gold-INK background, but NOT its -fill / -surface / -soft / -ink /
    // -line / -hover companions.
    RE_ACCENT_AS_FILL.test(utility) ? "accentAsFill" : null,

  "no-accent-hover-confusion": (utility) =>
    RE_ACCENT_HOVER.test(utility) ? "accentHover" : null,

  "no-raw-font-size": (utility) =>
    /^text-\[\d+(?:\.\d+)?(?:px|rem)\]$/.test(utility) ? "rawFontSize" : null,

  "no-raw-radius": (utility) =>
    RE_RAW_RADIUS.test(utility) ? "rawRadius" : null,

  "no-raw-shadow": (utility, _interactivity, bannedSteps) => {
    if (RE_ELEVATION_ARBITRARY.test(utility)) return "rawElevation"; // arbitrary value, no token behind it
    const step = RE_ELEVATION_STEP.exec(utility)?.[1];
    return step && bannedSteps.has(step) ? "rawElevation" : null;
  },

  "no-raw-duration": (utility) =>
    RE_RAW_DURATION.test(utility) ? "rawDuration" : null,

  "no-focus-outline-none": (utility, interactivity) => {
    if (!isInteractiveContext(interactivity)) return null;
    if (utility === OUTLINE_NONE || RE_OUTLINE_NONE_VARIANT.test(utility)) return "focusOutlineNone";
    return null;
  },
};

const META = {
  "no-accent-as-fill": {
    description: "Forbid the gold-INK background as a fill.",
    url: "Accent roles",
  },
  "no-accent-hover-confusion": {
    description: "Forbid the gold-INK hover; the gold-fill hover is the documented one.",
    url: "Accent roles",
  },
  "no-raw-font-size": {
    description: "Forbid arbitrary px/rem font sizes in favour of the type-scale tokens.",
    url: "Typography scale",
  },
  "no-raw-radius": {
    description: "Forbid Tailwind radius steps in favour of the semantic radius tokens.",
    url: "Radius",
  },
  "no-raw-shadow": {
    description: "Forbid Tailwind elevation values that are not backed by an elevation token.",
    url: "Elevation",
  },
  "no-raw-duration": {
    description: "Forbid raw millisecond durations in favour of the duration scale.",
    url: "Motion",
  },
  "no-focus-outline-none": {
    description: "Forbid the outline-suppression utility on interactive elements; it hides the focus affordance.",
    url: "Focus",
  },
};

export function buildRules() {
  const rules = {};
  for (const [id, check] of Object.entries(CHECKS)) {
    rules[id] = createRule({ check, ...META[id] });
  }
  return rules;
}