import { revalidatePath } from "next/cache";

/**
 * The public homepage is an Incremental Static Regeneration route
 * (`export const revalidate = 300` in `src/app/page.tsx`).
 *
 * That means the rendered page is served from the Full Route Cache and is only
 * rebuilt in the background every 5 minutes. Without an explicit invalidation,
 * an admin edit (new service, renamed dentist, a fresh booking bumping the
 * "appointments served" counter) would stay invisible on the homepage until
 * the revalidation window elapsed.
 *
 * Every route handler whose mutation changes what the homepage renders calls
 * this immediately after the write succeeds.
 *
 * Note: this invalidates the *server* cache. A client that already holds the
 * page in the Next.js Router Cache keeps showing it until it navigates away
 * and back, which is the intended behaviour for a marketing page.
 */
export function revalidateHomepage(): void {
  revalidatePath("/");
}
