import { prisma } from "@/lib/db";
import { requireRole, ok, fail } from "@/lib/api";

// DELETE /api/dentists/[id]/blocked-dates/[blockedId] - remove a blocked date (ADMIN only)
// Scoped to the owning dentist so one dentist can never remove another's block.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; blockedId: string }> }
) {
  const { id, blockedId } = await params;
  const { user, error } = await requireRole("ADMIN");
  if (error) return error;

  try {
    const existing = await prisma.blockedDate.findFirst({
      where: { id: blockedId, dentistId: id },
      include: { dentist: { select: { name: true } } },
    });
    if (!existing) return fail("Blocked date not found.", 404);

    await prisma.blockedDate.delete({ where: { id: blockedId } });

    await prisma.activity.create({
      data: {
        action: "Dentist blocked date removed",
        entity: "Dentist",
        entityId: id,
        description: `${user.name} unblocked ${existing.date.toISOString().slice(0, 10)} for ${existing.dentist?.name ?? "dentist"}`,
        userId: user.id,
      },
    });

    return ok({ deleted: true, blockedId });
  } catch (err) {
    console.error("DELETE /api/dentists/[id]/blocked-dates/[blockedId] failed:", err);
    return fail("Unable to remove this blocked date.", 500);
  }
}