import { createCn } from "cn/engine";

import tables from "./cn-tables";

/**
 * The project's single `cn`.
 *
 * It is *not* the bare `cn` export: the shipped lookup tables only know stock
 * Tailwind, where `theme.color` is `isAny` and `theme.text` is `isTshirtSize`.
 * Every custom type-scale token (`text-body-sm`, `text-caption`, `text-micro`,
 * …) therefore classified as `text-color`, so a `cva` `size` variant's
 * font-size evicted its `variant`'s ink. See `cn.config.mjs` for the full
 * account; `scripts/audit-classes.mts` is the guard.
 *
 * `src/lib/cn-tables.ts` is generated — run `npm run cn:build` after editing
 * `cn.config.mjs`. Import from `@/lib/cn` (or this module) everywhere; do not
 * import `cn`, `clsx` or `tailwind-merge` directly.
 */
export const cn = createCn(tables);