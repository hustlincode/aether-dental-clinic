import { requireAuth, ok, fail } from "@/lib/api";
import { getNotificationPreview, getNotifications } from "@/lib/notifications";

function parsePositiveInt(raw: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

// GET /api/notifications
// Paginated notification list for the authenticated user (newest first).
// Supports `unread=1`, `page` / `pageSize`, and `view=preview` for the bell.
export async function GET(req: Request) {
  const started = performance.now();
  let authFinished: number | undefined;
  let dataStarted: number | undefined;
  let response: Response;
  try {
    const { user, error } = await requireAuth();
    authFinished = performance.now();
    if (error) {
      response = error;
    } else {
      dataStarted = performance.now();
      const { searchParams } = new URL(req.url);
      const preview = searchParams.get("view") === "preview";
      const page = parsePositiveInt(searchParams.get("page"), 1);
      const pageSize = parsePositiveInt(searchParams.get("pageSize"), 10, preview ? 10 : 50);
      const unreadOnly = searchParams.get("unread") === "1" || searchParams.get("unread") === "true";

      const data = preview
        ? await getNotificationPreview(user!.id, pageSize)
        : await getNotifications(user!.id, { page, pageSize, unreadOnly });
      response = ok(data);
    }
  } catch (err) {
    console.error("GET /api/notifications failed:", err instanceof Error ? err.name : "UnknownError");
    response = fail("Unable to load notifications.", 500);
  }
  const finished = performance.now();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Server-Timing", `auth;dur=${((authFinished ?? finished) - started).toFixed(1)}, data;dur=${(dataStarted === undefined ? 0 : finished - dataStarted).toFixed(1)}`);
  return response;
}
