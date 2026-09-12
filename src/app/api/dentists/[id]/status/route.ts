import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, ok, fail } from "@/lib/api";

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

// PATCH /api/dentists/[id]/status - activate/deactivate a dentist (ADMIN only)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireRole("ADMIN");
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
    const existing = await prisma.dentist.findUnique({ where: { id } });
    if (!existing) {
      return fail("Dentist not found.", 404);
    }

    const updated = await prisma.dentist.update({
      where: { id },
      data: { status: body.status },
    });

    await prisma.activity.create({
      data: {
        action: body.status === "ACTIVE" ? "Dentist activated" : "Dentist deactivated",
        entity: "Dentist",
        entityId: updated.id,
        description: `${user.name} ${body.status === "ACTIVE" ? "activated" : "deactivated"} dentist ${updated.name}`,
        userId: user.id,
      },
    });

    return ok(updated);
  } catch (err) {
    console.error("PATCH /api/dentists/[id]/status failed:", err);
    return fail("Unable to update dentist status.", 500);
  }
}