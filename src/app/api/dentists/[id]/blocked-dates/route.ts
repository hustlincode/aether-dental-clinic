import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, ok, fail } from "@/lib/api";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createBlockedDateSchema = z.object({
  date: z.string().regex(DATE_RE, "Date must be in YYYY-MM-DD format."),
  reason: z.string().trim().max(200, "Reason must be 200 characters or fewer.").optional(),
});

function fmtISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// GET /api/dentists/[id]/blocked-dates - dentist-specific blocked dates (ADMIN only)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("ADMIN");
  if (error) return error;

  try {
    const dentist = await prisma.dentist.findUnique({ where: { id } });
    if (!dentist) return fail("Dentist not found.", 404);

    const rows = await prisma.blockedDate.findMany({
      where: { dentistId: id },
      orderBy: { date: "asc" },
    });
    return ok(rows);
  } catch (err) {
    console.error("GET /api/dentists/[id]/blocked-dates failed:", err);
    return fail("Unable to load blocked dates.", 500);
  }
}

// POST /api/dentists/[id]/blocked-dates - block a date for this dentist (ADMIN only)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireRole("ADMIN");
  if (error) return error;

  let body: z.infer<typeof createBlockedDateSchema>;
  try {
    body = createBlockedDateSchema.parse(await req.json());
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
    const dentist = await prisma.dentist.findUnique({ where: { id } });
    if (!dentist) return fail("Dentist not found.", 404);

    const date = new Date(`${body.date}T00:00:00.000Z`);
    if (isNaN(date.getTime())) return fail("Invalid date.", 400);

    // Note: Postgres treats NULLs as distinct in unique indexes, so clinic-wide
    // blocked dates (dentistId: null) never collide with dentist-specific rows.
    // This module manages dentist-specific blocked dates only (clinic holidays
    // belong to a future Settings module).
    const created = await prisma.blockedDate.create({
      data: { date, reason: body.reason?.trim() || null, dentistId: id },
    });

    await prisma.activity.create({
      data: {
        action: "Dentist blocked date added",
        entity: "Dentist",
        entityId: id,
        description: `${user.name} blocked ${fmtISODate(created.date)} for ${dentist.name}`,
        userId: user.id,
      },
    });

    return ok(created, 201);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return fail("This date is already blocked for this dentist.", 409);
    }
    console.error("POST /api/dentists/[id]/blocked-dates failed:", err);
    return fail("Unable to block this date.", 500);
  }
}