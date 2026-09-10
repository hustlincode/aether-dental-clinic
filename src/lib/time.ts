/**
 * Shared date/time formatting helpers (safe to import from client components).
 */

/** Human-friendly relative time, e.g. "5 minutes ago", "2 hours ago". */
export function timeAgo(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Absolute local date-time, e.g. "Sep 10, 2026 · 3:45 PM". */
export function formatDateTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " +
    date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}