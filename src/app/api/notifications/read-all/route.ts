import { requireAuth, ok, fail } from "@/lib/api";
import { markAllNotificationsAsRead } from "@/lib/notifications";

// PATCH /api/notifications/read-all
// Marks every unread notification of the authenticated user as read.
export async function PATCH() {
  const { user, error } = await requireAuth();
  if (error) return error;

  try {
    const updated = await markAllNotificationsAsRead(user!.id);
    return ok({ updated });
  } catch (err) {
    console.error("PATCH /api/notifications/read-all failed:", err);
    return fail("Unable to mark notifications as read.", 500);
  }
}