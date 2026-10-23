import { z } from "zod";
import { requireRole, requireWriteRole, ok, fail, formattedZodError } from "@/lib/api";
import { AppointmentError } from "@/lib/appointment-transaction";
import { ConfigurationError, listClinicClosures, createClinicClosure } from "@/lib/clinic-configuration";
import { revalidateHomepage } from "@/lib/home-cache";

export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  try { return ok(await listClinicClosures()); }
  catch (error) {
    console.error("GET /api/admin/clinic-closures failed:", error);
    return fail("Unable to load clinic closures.", 500);
  }
}

export async function POST(req: Request) {
  const { user, error } = await requireWriteRole("ADMIN");
  if (error) return error;
  try {
    const result = await createClinicClosure(await req.json(), user!.id);
    revalidateHomepage();
    return ok(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return fail("Validation failed.", 422, formattedZodError(error));
    if (error instanceof ConfigurationError) return fail(error.message, error.status, error.details);
    if (error instanceof AppointmentError) return fail(error.message, error.status);
    if (error instanceof SyntaxError) return fail("Invalid request body.", 400);
    console.error("POST /api/admin/clinic-closures failed:", error);
    return fail("Unable to add clinic closure.", 500);
  }
}
