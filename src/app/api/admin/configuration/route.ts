import { z } from "zod";
import { requireRole, requireWriteRole, ok, fail, formattedZodError } from "@/lib/api";
import { AppointmentError } from "@/lib/appointment-transaction";
import { ConfigurationError, getClinicConfiguration, updateClinicConfiguration } from "@/lib/clinic-configuration";
import { revalidateClinicPages } from "@/lib/home-cache";

function handleError(error: unknown) {
  if (error instanceof z.ZodError) return fail("Validation failed.", 422, formattedZodError(error));
  if (error instanceof ConfigurationError) return fail(error.message, error.status, error.details);
  if (error instanceof AppointmentError) return fail(error.message, error.status);
  if (error instanceof SyntaxError) return fail("Invalid request body.", 400);
  console.error("Clinic configuration request failed:", error);
  return fail("Unable to access clinic configuration.", 500);
}

export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  try { return ok(await getClinicConfiguration()); }
  catch (error) { return handleError(error); }
}

export async function PATCH(req: Request) {
  const { user, error } = await requireWriteRole("ADMIN");
  if (error) return error;
  try {
    const result = await updateClinicConfiguration(await req.json(), user!.id);
    revalidateClinicPages();
    return ok(result);
  } catch (error) { return handleError(error); }
}
