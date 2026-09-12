import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, ok, fail } from "@/lib/api";

// ─── Zod schema for the weekly availability editor ───────────────────────────
// Each entry mirrors the Availability model. Times are stored as zero-padded
// "HH:mm" strings (24h), consistent with the scheduling engine in scheduling.ts.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const availabilityEntrySchema = z
  .object({
    dayOfWeek: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
    isWorking: z.boolean(),
    startTime: z.string().regex(TIME_RE, "Start time must be a valid HH:mm time."),
    endTime: z.string().regex(TIME_RE, "End time must be a valid HH:mm time."),
    breakStart: z.string().regex(TIME_RE, "Break start must be a valid HH:mm time.").nullable().optional(),
    breakEnd: z.string().regex(TIME_RE, "Break end must be a valid HH:mm time.").nullable().optional(),
  })
  .superRefine((entry, ctx) => {
    if (!entry.isWorking) return;

    const start = toMinutes(entry.startTime);
    const end = toMinutes(entry.endTime);
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after start time." });
    }

    const bs = entry.breakStart != null ? toMinutes(entry.breakStart) : null;
    const be = entry.breakEnd != null ? toMinutes(entry.breakEnd) : null;

    if ((bs == null) !== (be == null)) {
      ctx.addIssue({ code: "custom", path: ["breakStart"], message: "Break start and end must be provided together." });
      return;
    }

    if (bs != null && be != null) {
      if (be <= bs) {
        ctx.addIssue({ code: "custom", path: ["breakEnd"], message: "Break end must be after break start." });
      }
      if (bs <= start || be >= end) {
        ctx.addIssue({ code: "custom", path: ["breakStart"], message: "Break must be within working hours." });
      }
    }
  });

const putAvailabilitySchema = z
  .object({
    availability: z.array(availabilityEntrySchema).min(1, "At least one day is required.").max(7, "At most seven days."),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.availability.forEach((entry, index) => {
      if (seen.has(entry.dayOfWeek)) {
        ctx.addIssue({
          code: "custom",
          path: ["availability", index, "dayOfWeek"],
          message: "Each day can only appear once.",
        });
      }
      seen.add(entry.dayOfWeek);
    });
  });

// GET /api/dentists/[id]/availability - the dentist's weekly schedule (ADMIN only)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("ADMIN");
  if (error) return error;

  try {
    const dentist = await prisma.dentist.findUnique({ where: { id } });
    if (!dentist) return fail("Dentist not found.", 404);

    const rows = await prisma.availability.findMany({
      where: { dentistId: id },
      orderBy: { dayOfWeek: "asc" },
    });
    return ok(rows);
  } catch (err) {
    console.error("GET /api/dentists/[id]/availability failed:", err);
    return fail("Unable to load the dentist schedule.", 500);
  }
}

// PUT /api/dentists/[id]/availability - replace the weekly schedule (ADMIN only)
// Upserts each provided day against the unique (dentistId, dayOfWeek) key and
// persists break windows exactly as the scheduling engine reads them.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireRole("ADMIN");
  if (error) return error;

  let body: z.infer<typeof putAvailabilitySchema>;
  try {
    body = putAvailabilitySchema.parse(await req.json());
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

    await prisma.$transaction(
      body.availability.map((entry) =>
        prisma.availability.upsert({
          where: { dentistId_dayOfWeek: { dentistId: id, dayOfWeek: entry.dayOfWeek } },
          create: {
            dentistId: id,
            dayOfWeek: entry.dayOfWeek,
            isWorking: entry.isWorking,
            startTime: entry.isWorking ? entry.startTime : "00:00",
            endTime: entry.isWorking ? entry.endTime : "00:00",
            breakStart: entry.isWorking && entry.breakStart ? entry.breakStart : null,
            breakEnd: entry.isWorking && entry.breakEnd ? entry.breakEnd : null,
          },
          update: {
            isWorking: entry.isWorking,
            startTime: entry.isWorking ? entry.startTime : "00:00",
            endTime: entry.isWorking ? entry.endTime : "00:00",
            breakStart: entry.isWorking && entry.breakStart ? entry.breakStart : null,
            breakEnd: entry.isWorking && entry.breakEnd ? entry.breakEnd : null,
          },
        })
      )
    );

    await prisma.activity.create({
      data: {
        action: "Dentist schedule updated",
        entity: "Dentist",
        entityId: id,
        description: `${user.name} updated the weekly schedule for ${dentist.name}`,
        userId: user.id,
      },
    });

    const saved = await prisma.availability.findMany({
      where: { dentistId: id },
      orderBy: { dayOfWeek: "asc" },
    });
    return ok(saved);
  } catch (err) {
    console.error("PUT /api/dentists/[id]/availability failed:", err);
    return fail("Unable to save the dentist schedule.", 500);
  }
}