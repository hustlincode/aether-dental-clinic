/**
 * Compatibility shim. shadcn's `components.json` points `aliases.utils` here,
 * and the seven components written before the `cn` migration still import
 * from this path.
 *
 * It re-exports the project merge engine rather than `twMerge(clsx(...))`,
 * so both import surfaces resolve to one implementation. New code should
 * import from `@/lib/cn`.
 */
export { cn } from "./cn";