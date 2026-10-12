/**
 * eslint-local-rules/index.mjs
 *
 * A local ESLint plugin — a plain module inside the repo, NOT an npm
 * dependency. Nothing is added to `package.json`; `eslint.config.mjs` imports
 * this file directly.
 *
 * Purpose: make the P0–P4 design-system regressions impossible to reintroduce
 * silently. Every rule inspects **class-attribute / class-string values only**
 * and never reads source text, so an English word in a code comment can never be
 * mistaken for a Tailwind utility (see `lib/class-strings.mjs` for why that
 * matters — it once produced a dead elevation rule in the production bundle).
 *
 * This directory is itself inside Tailwind's scan surface, so no file in it
 * names a utility token. `src/app/globals.css` carries the matching
 * `@source not` guard; `lib/rules.mjs` assembles the spellings the rules match
 * on from fragments. Keep both layers.
 *
 * `src/app/globals.css` is out of reach by construction: ESLint does not lint
 * CSS files, and the config scopes these rules to `src/**\/*.{ts,tsx}`.
 */

import { buildRules } from "./lib/rules.mjs";

export const rules = buildRules();

export const meta = {
  name: "aether-theme",
  version: "1.0.0",
};