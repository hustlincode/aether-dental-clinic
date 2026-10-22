import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWriteRole, ok, fail } from "@/lib/api";

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

// PATCH /api/patients/[id]/status - activate/deactivate a patient (ADMIN / RECEPTIONIST)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireWriteRole("ADMIN", "RECEPTIONIST");
  if (error) return error;

  let body: z.infer<typeof statusSchema>;
  try {
    body = statusSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues: Record<string, string[]> = {};
      for (const i of err.issues) {
        const key = i.path.join(".") || "form";
        if (!issues[key]) issues[key] = [];
        issues[key].push(i.message);
      }
      return fail("Validation failed.", 422, issues);
    }
    return fail("Invalid request body.", 400);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const change = await tx.patient.updateMany({
        where: { id, status: { not: body.status } },
        data: { status: body.status },
      });
      const updated = await tx.patient.findUnique({ where: { id } });
      if (!updated || change.count === 0) return updated;
      await tx.activity.create({
        data: {
          action: body.status === "ACTIVE" ? "Patient activated" : "Patient deactivated",
          entity: "Patient",
          entityId: updated.id,
          description: `${user.name} ${body.status === "ACTIVE" ? "activated" : "deactivated"} patient ${updated.firstName} ${updated.lastName}`,
          userId: user.id,
        },
      });
      return updated;
    });

    return updated ? ok(updated) : fail("Patient not found.", 404);
  } catch (err) {
    console.error("PATCH /api/patients/[id]/status failed:", err);
    return fail("Unable to update patient status.", 500);
  }
}
