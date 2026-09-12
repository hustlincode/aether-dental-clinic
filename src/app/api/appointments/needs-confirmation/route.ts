import { requireRole, ok, fail } from "@/lib/api";
import { getNeedsConfirmation } from "@/lib/needs-confirmation";

// GET /api/appointments/needs-confirmation
// On-demand list of PENDING appointments inside the confirmation window.
// Read-only: no cron, no queue table, no side effects. Triggered manually by
// an Admin or Receptionist via the dashboard "Check Appointments" action.
export async function GET() {
  const { error } = await requireRole("ADMIN", "RECEPTIONIST");
  if (error) return error;

  try {
    const data = await getNeedsConfirmation();
    return ok(data);
  } catch (err) {
    console.error("GET /api/appointments/needs-confirmation failed:", err);
    return fail("Unable to check appointments.", 500);
  }
}
