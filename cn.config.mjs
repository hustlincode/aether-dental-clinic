/**
 * cn.config.mjs — project merge tables for the `cn` class-merging engine.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `cn` ships lookup tables compiled from tailwind-merge's *stock* Tailwind
 * config. Two of those stock validators are open-ended:
 *
 *   theme.text  -> [isTshirtSize]   so only `text-sm`, `text-lg`, … are font-size
 *   theme.color -> [isAny]          so EVERY `text-<anything>` is a text colour
 *
 * Aether Dental's type scale is declared with custom `@theme inline` tokens
 * (`--text-body-sm`, `--text-caption`, `--text-micro`, …). Those are not
 * t-shirt sizes, so stock `cn` classifies every one of them as `text-color`.
 * Because `text-color` conflicts with `text-color`, `cva`'s emission order
 * (base -> variant -> size -> className) let a `size` variant's font-size token
 * evict the `variant`'s text colour:
 *
 *   cn("bg-accent-fill text-primary-foreground", "text-body-sm")
 *     => "bg-accent-fill text-body-sm"        // text-primary-foreground GONE
 *
 * On a gold (`#D4AF37`) CTA in dark mode the label then inherited `--text`
 * (#F8F9FA) at ~1.6:1 instead of `--primary-foreground` (#0E0F10).
 *
 * Registering each token in the `font-size` class group moves it out of
 * `text-color` and into its real group, so variant ink and size type scale
 * stop fighting. `scripts/audit-classes.mts` fails the build if any token in
 * `globals.css` is missing here, and if any component bypasses this config.
 *
 * The same open-ended `isAny` colour rule mis-filed `shadow-focus` as a shadow
 * *colour*, and left the semantic radius steps unclassified. Both are registered
 * below for the same reason.
 *
 * REGENERATING THE TABLES
 * -----------------------
 *   npm run cn:build
 *
 * which runs `cn build --config cn.config.mjs --full`, writing
 * `src/lib/cn-tables.ts`. `--full` keeps every stock class group: subsetting
 * drops groups that no scanned file happens to mention, which would let a
 * dynamically built class name silently stop merging.
 */

/**
 * The `@theme inline` type scale (`globals.css` §5 "Typography").
 *
 * Keep this list in sync with globals.css — `npm run audit:classes` diffs the
 * two and exits non-zero on any gap in either direction. Order mirrors the CSS
 * so a diff reads cleanly; the engine does not care.
 */
const TYPE_SCALE = [
  // Display (Fraunces; homepage-scoped)
  "display-xl",
  "display-lg",
  "display-md",
  "display-sm",
  "stat",
  // Titles (Geist Sans)
  "title-lg",
  "title",
  "title-sm",
  // Body
  "body-lg",
  "body",
  "body-sm",
  "caption",
  // Micro-labels (Geist Mono, uppercase, tracked)
  "eyebrow",
  "micro",
  // Control labels (Geist Sans)
  "label",
];

/** `@theme inline` semantic radius steps (`globals.css` §5 "Radius"). */
const RADIUS = ["control", "card", "chip", "pill"];

/**
 * `@theme inline` elevation steps that stock Tailwind does not already know.
 * `xs`/`sm`/`md`/`lg`/`xl` are t-shirt sizes and already resolve to the
 * `shadow` group; `focus` does not, and stock `cn` filed it under
 * `shadow-color` because `theme.color` is `isAny`.
 */
const ELEVATION = ["focus"];

/** `@theme inline` easing steps stock Tailwind does not already know (`out`,
 *  `in` and `in-out` are in the stock `ease` theme). */
const EASE = ["std"];

const config = {
  extend: {
    classGroups: {
      "font-size": [{ text: TYPE_SCALE }],
      rounded: [{ rounded: RADIUS }],
      shadow: [{ shadow: ELEVATION }],
      ease: [{ ease: EASE }],
    },
  },
};

export default config;