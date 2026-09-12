import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, ok, fail } from "@/lib/api";
import { notifyPatientUpdated } from "@/lib/notifications";

// ─── Zod schema for updating a patient (partial, at least one field required) ─
const updatePatientSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required.").optional(),
    lastName: z.string().trim().min(1, "Last name is required.").optional(),
    email: z.string().trim().email("Please provide a valid email address.").optional().or(z.literal("")),
    phone: z.string().trim().min(7, "Please provide a valid phone number.").optional(),
    notes: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

const appointmentSelect = {
  appointmentDate: true,
  startTime: true,
  endTime: true,
  status: true,
  service: { select: { name: true } },
  dentist: { select: { name: true } },
} as const;

// GET /api/patients/[id] - patient details + stats + appointment history (any staff)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const patient = await prisma.patient.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        notes: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!patient) {
      return fail("Patient not found.", 404);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [history, grouped, nextAppointment] = await Promise.all([
      prisma.appointment.findMany({
        where: { patientId: id },
        orderBy: { appointmentDate: "desc" },
        take: 30,
        select: appointmentSelect,
      }),
      prisma.appointment.groupBy({
        by: ["status"],
        where: { patientId: id },
        _count: { _all: true },
      }),
      prisma.appointment.findFirst({
        where: {
          patientId: id,
          appointmentDate: { gte: today },
          status: { notIn: ["COMPLETED", "CANCELLED", "NO_SHOW"] },
        },
        orderBy: { appointmentDate: "asc" },
        select: appointmentSelect,
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of grouped) {
      statusCounts[row.status] = row._count._all;
    }

    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
    const completed = statusCounts["COMPLETED"] || 0;
    const cancelled = statusCounts["CANCELLED"] || 0;

    // Most recent past appointment; fall back to the newest appointment overall
    // when the patient has no appointment strictly before today.
    const pastLast = await prisma.appointment.findFirst({
      where: { patientId: id, appointmentDate: { lt: today } },
      orderBy: { appointmentDate: "desc" },
      select: appointmentSelect,
    });
    const lastAppointment = pastLast ?? (history.length > 0 ? history[0] : null);

    return ok({
      patient,
      stats: {
        total,
        completed,
        cancelled,
        nextAppointment,
        lastAppointment,
      },
      history,
    });
  } catch (err) {
    console.error("GET /api/patients/[id] failed:", err);
    return fail("Unable to load patient.", 500);
  }
}

// PATCH /api/patients/[id] - update a patient (ADMIN / RECEPTIONIST)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireRole("ADMIN", "RECEPTIONIST");
  if (error) return error;

  let body: z.infer<typeof updatePatientSchema>;
  try {
    body = updatePatientSchema.parse(await req.json());
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
    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      return fail("Patient not found.", 404);
    }

    const data: Record<string, unknown> = {};
    if (body.firstName !== undefined) data.firstName = body.firstName.trim();
    if (body.lastName !== undefined) data.lastName = body.lastName.trim();
    if (body.email !== undefined) data.email = body.email ? body.email.toLowerCase().trim() : null;
    if (body.phone !== undefined) data.phone = body.phone.trim();
    if (body.notes !== undefined) data.notes = body.notes.trim() || null;
    if (body.status !== undefined) data.status = body.status;

    const updated = await prisma.patient.update({
      where: { id },
      data,
    });

    await prisma.activity.create({
      data: {
        action: "Patient updated",
        entity: "Patient",
        entityId: updated.id,
        description: `${user.name} updated patient ${updated.firstName} ${updated.lastName}`,
        userId: user.id,
      },
    });

    // Only notify staff when a *meaningful* field changes (contact info or
    // status). Minor fields such as notes are excluded to reduce noise.
    const meaningfulChanges: string[] = [];
    if (body.email !== undefined) meaningfulChanges.push("email changed");
    if (body.phone !== undefined) meaningfulChanges.push("phone number changed");
    if (body.status !== undefined) meaningfulChanges.push(`status changed to ${body.status.replace("_", " ").toLowerCase()}`);
    if (meaningfulChanges.length > 0) {
      try {
        await notifyPatientUpdated(updated, meaningfulChanges.join(", "));
      } catch (e) {
        console.error("Failed to create patient update notification:", e);
      }
    }

    return ok(updated);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return fail("A patient with this email already exists.", 409);
    }
    console.error("PATCH /api/patients/[id] failed:", err);
    return fail("Unable to update patient.", 500);
  }
}