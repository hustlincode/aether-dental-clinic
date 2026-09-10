import { requireAuth, ok, fail } from "@/lib/api";
import { markNotificationAsRead } from "@/lib/notifications";

// PATCH /api/notifications/[id]/read
// Marks a single notification as read. Ownership is verified server-side.
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireAuth();
  if (error) return error;

  try {
    const changed = await markNotificationAsRead(user!.id, id);
    if (!changed) {
      return fail("Notification not found.", 404);
    }
    return ok({ id, isRead: true });
  } catch (err) {
    console.error("PATCH /api/notifications/[id]/read failed:", err);
    return fail("Unable to mark notification as read.", 500);
  }
}