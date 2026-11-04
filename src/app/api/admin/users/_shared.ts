import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fail, formattedZodError } from "@/lib/api";
import { UserManagementError } from "@/lib/user-management";

export function handleUserError(error: unknown) {
  if (error instanceof z.ZodError) return fail("Validation failed.", 422, formattedZodError(error));
  if (error instanceof UserManagementError) return fail(error.message, error.status, error.details);
  if (error instanceof SyntaxError) return fail("Invalid request body.", 400);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return fail("This email or Dentist profile is already in use. Refresh and try again.", 409);
  }
  console.error("User management request failed.");
  return fail("Unable to manage users.", 500);
}
