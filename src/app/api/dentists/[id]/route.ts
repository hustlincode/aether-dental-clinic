import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, ok, fail } from "@/lib/api";

// ─── Zod schema for updating a dentist (partial, at least one field required) ─
const updateDentistSchema = z
  .object({
    name: z.string().trim().min(2, "Dentist name must be at least 2 characters.").optional(),
    email: z.string().trim().email("Please provide a valid email address.").optional(),
    phone: z.string().trim().min(7, "Please provide a valid phone number.").optional().or(z.literal("")),
    specialization: z.string().trim().min(1, "Specialization is required.").optional(),
    profileImage: z.string().trim().url("Please provide a valid image URL.").optional().or(z.literal("")),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

const upcomingAppointmentSelect = {
  id: true,
  appointmentDate: true,
  startTime: true,
  endTime: true,
  status: true,
  patient: { select: { firstName: true, lastName: true } },
  service: { select: { name: true } },
} as const;

// GET /api/dentists/[id] - dentist details + schedule + upcoming appointments (any staff)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const dentist = await prisma.dentist.findUnique({
      where: { id },
      include: { availability: { orderBy: { dayOfWeek: "asc" } } },
    });

    if (!dentist) {
      return fail("Dentist not found.", 404);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalAppointments, upcoming] = await Promise.all([
      prisma.appointment.count({ where: { dentistId: id } }),
      prisma.appointment.findMany({
        where: {
          dentistId: id,
          appointmentDate: { gte: today },
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
        },
        orderBy: [{ appointmentDate: "asc" }, { startTime: "asc" }],
        take: 10,
        select: upcomingAppointmentSelect,
      }),
    ]);

    return ok({
      dentist,
      stats: {
        totalAppointments,
        upcomingCount: upcoming.length,
      },
      upcoming,
    });
  } catch (err) {
    console.error("GET /api/dentists/[id] failed:", err);
    return fail("Unable to load dentist.", 500);
  }
}

// PATCH /api/dentists/[id] - update a dentist (ADMIN only)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireRole("ADMIN");
  if (error) return error;

  let body: z.infer<typeof updateDentistSchema>;
  try {
    body = updateDentistSchema.parse(await req.json());
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

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.email !== undefined) data.email = body.email.toLowerCase().trim();
    if (body.phone !== undefined) data.phone = body.phone.trim() || null;
    if (body.specialization !== undefined) data.specialization = body.specialization.trim();
    if (body.profileImage !== undefined) data.profileImage = body.profileImage.trim() || null;
    if (body.status !== undefined) data.status = body.status;

    const updated = await prisma.dentist.update({
      where: { id },
      data,
    });

    await prisma.activity.create({
      data: {
        action: "Dentist updated",
        entity: "Dentist",
        entityId: updated.id,
        description: `${user.name} updated dentist ${updated.name}`,
        userId: user.id,
      },
    });

    return ok(updated);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return fail("A dentist with this email already exists.", 409);
    }
    console.error("PATCH /api/dentists/[id] failed:", err);
    return fail("Unable to update dentist.", 500);
  }
}