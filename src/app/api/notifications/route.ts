import { requireAuth, ok, fail } from "@/lib/api";
import { getNotifications } from "@/lib/notifications";

function parsePositiveInt(raw: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

// GET /api/notifications
// Paginated notification list for the authenticated user (newest first).
// Supports `unread=1` filtering and `page` / `pageSize`.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 10, 50);
    const unreadOnly = searchParams.get("unread") === "1" || searchParams.get("unread") === "true";

    const data = await getNotifications(user!.id, { page, pageSize, unreadOnly });
    return ok(data);
  } catch (err) {
    console.error("GET /api/notifications failed:", err);
    return fail("Unable to load notifications.", 500);
  }
}