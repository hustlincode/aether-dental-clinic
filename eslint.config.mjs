import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import * as aetherTheme from "./eslint-local-rules/index.mjs";

/**
 * Local design-system guardrails (a repo module, not an npm dependency).
 *
 * They ban the exact patterns P0–P4 removed, so a regression cannot land
 * silently. See THEME.md § Guardrails and eslint-local-rules/README.md.
 *
 * Scoped to `src/**\/*.{ts,tsx}`: scripts and config files are not component
 * code, and `globals.css` is never linted by ESLint at all — the token layer
 * is protected by `npm run audit:contrast` and by review instead.
 */
const themeGuardrails = [
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "aether-theme": aetherTheme },
    rules: {
      // Promoted warn -> error in P5: the tree measured 0 warnings across all
      // seven rules, so a non-zero count now means a real regression.
      "aether-theme/no-accent-as-fill": "error",
      "aether-theme/no-accent-hover-confusion": "error",
      "aether-theme/no-raw-font-size": "error",
      "aether-theme/no-raw-radius": "error",
      "aether-theme/no-raw-shadow": "error",
      "aether-theme/no-raw-duration": "error",
      "aether-theme/no-focus-outline-none": "error",
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...themeGuardrails,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // `cn build` output: flat typed arrays, no hand-written logic to review.
    // It is covered by `npx tsc --noEmit` and by `npm run audit:classes`,
    // which asserts the generated tables match `cn.config.mjs`.
    "src/lib/cn-tables.ts",
  ]),
]);

export default eslintConfig;