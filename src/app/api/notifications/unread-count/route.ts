import { requireAuth, ok, fail } from "@/lib/api";
import { getUnreadCount } from "@/lib/notifications";

// GET /api/notifications/unread-count
// Lightweight unread badge count for the authenticated user.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  try {
    const count = await getUnreadCount(user!.id);
    return ok({ count });
  } catch (err) {
    console.error("GET /api/notifications/unread-count failed:", err);
    return fail("Unable to load unread count.", 500);
  }
}