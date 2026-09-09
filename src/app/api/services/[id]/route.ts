import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, ok, fail } from "@/lib/api";

// ─── Zod schema for updating a service (partial, at least one field required) ─
const updateServiceSchema = z
  .object({
    name: z.string().min(1, "Service name is required.").optional(),
    description: z.string().optional().nullable(),
    durationMin: z.number().int().positive("Duration must be a positive number.").max(600, "Duration cannot exceed 600 minutes.").optional(),
    price: z.number().min(0, "Price cannot be negative.").optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

// ─── PATCH /api/services/[id] ────────────────────────────────────────────────
// Admin only: update an existing service
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("ADMIN");
  if (error) return error;

  let body: z.infer<typeof updateServiceSchema>;
  try {
    body = updateServiceSchema.parse(await req.json());
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
    // Check if service exists
    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) {
      return fail("Service not found.", 404);
    }

    // Build update data — only include provided fields
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.durationMin !== undefined) data.durationMin = body.durationMin;
    if (body.price !== undefined) data.price = body.price;
    if (body.status !== undefined) data.status = body.status;

    const updated = await prisma.service.update({
      where: { id },
      data,
    });

    return ok(updated);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return fail("A service with this name already exists.", 409);
    }
    console.error("PATCH /api/services/[id] failed:", err);
    return fail("Unable to update service.", 500);
  }
}

// ─── DELETE /api/services/[id] ───────────────────────────────────────────────
// Admin only: delete a service (only if no appointments reference it)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("ADMIN");
  if (error) return error;

  try {
    const existing = await prisma.service.findUnique({
      where: { id },
      include: { _count: { select: { appointments: true } } },
    });

    if (!existing) {
      return fail("Service not found.", 404);
    }

    if (existing._count.appointments > 0) {
      return fail("Cannot delete a service that has existing appointments. Deactivate it instead.", 409);
    }

    await prisma.service.delete({ where: { id } });

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/services/[id] failed:", err);
    return fail("Unable to delete service.", 500);
  }
}
