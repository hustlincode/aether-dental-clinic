import { requireAuth, ok, fail } from "@/lib/api";
import { getUnreadCount } from "@/lib/notifications";

// GET /api/notifications/unread-count
// Lightweight unread badge count for the authenticated user.
export async function GET() {
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
      const count = await getUnreadCount(user!.id);
      response = ok({ count });
    }
  } catch (err) {
    console.error("GET /api/notifications/unread-count failed:", err instanceof Error ? err.name : "UnknownError");
    response = fail("Unable to load unread count.", 500);
  }
  const finished = performance.now();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Server-Timing", `auth;dur=${((authFinished ?? finished) - started).toFixed(1)}, data;dur=${(dataStarted === undefined ? 0 : finished - dataStarted).toFixed(1)}`);
  return response;
}
