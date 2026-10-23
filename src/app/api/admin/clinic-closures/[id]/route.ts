import { requireWriteRole, ok, fail } from "@/lib/api";
import { AppointmentError } from "@/lib/appointment-transaction";
import { removeClinicClosure } from "@/lib/clinic-configuration";
import { revalidateHomepage } from "@/lib/home-cache";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireWriteRole("ADMIN");
  if (error) return error;
  try {
    const { id } = await params;
    const result = await removeClinicClosure(id, user!.id);
    revalidateHomepage();
    return ok(result);
  } catch (error) {
    if (error instanceof AppointmentError) return fail(error.message, error.status);
    console.error("DELETE /api/admin/clinic-closures/[id] failed:", error);
    return fail("Unable to remove clinic closure.", 500);
  }
}
