import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, requireWriteRole, ok, fail } from "@/lib/api";
import { notifyPatientCreated } from "@/lib/notifications";
import { revalidateHomepage } from "@/lib/home-cache";

// ─── Zod schema for creating a patient ───────────────────────────────────────
const createPatientSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z.string().trim().email("Please provide a valid email address.").optional().or(z.literal("")),
  phone: z.string().trim().min(7, "Please provide a valid phone number."),
  notes: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

function parsePositiveInt(raw: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

// GET /api/patients - list patients with search/filter/pagination (any staff)
export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, 1_000_000);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 10, 50);
    const search = searchParams.get("search")?.trim() || searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status"); // ACTIVE | INACTIVE | empty = all
    const hasAppointmentsRaw = searchParams.get("hasAppointments");
    const sort = searchParams.get("sort") || "patient";
    const order = searchParams.get("order") || "asc";
    if (search.length > 200 || (status && !["ACTIVE", "INACTIVE"].includes(status)) ||
        (hasAppointmentsRaw && !["1", "0", "true", "false"].includes(hasAppointmentsRaw)) ||
        !["patient", "phone", "appointments", "status", "createdAt"].includes(sort) ||
        !["asc", "desc"].includes(order)) {
      return fail("Invalid patient list filters or sorting.", 400);
    }
    const direction = order as Prisma.SortOrder;
    const orderBy: Prisma.PatientOrderByWithRelationInput[] = sort === "patient"
      ? [{ firstName: direction }, { lastName: direction }]
      : sort === "appointments"
        ? [{ appointments: { _count: direction } }]
        : [{ [sort]: direction }];
    orderBy.push({ id: "asc" });

    const where: Prisma.PatientWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    if (status === "ACTIVE" || status === "INACTIVE") {
      where.status = status;
    }

    // hasAppointments: 1 / true -> at least one appointment; 0 / false -> none
    if (hasAppointmentsRaw === "1" || hasAppointmentsRaw === "true") {
      where.appointments = { some: {} };
    } else if (hasAppointmentsRaw === "0" || hasAppointmentsRaw === "false") {
      where.appointments = { none: {} };
    }

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
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
          _count: { select: { appointments: true } },
          appointments: {
            orderBy: { appointmentDate: "desc" },
            take: 1,
            select: { appointmentDate: true, status: true, startTime: true },
          },
        },
      }),
      prisma.patient.count({ where }),
    ]);

    return ok({ patients, total, page, pageSize, all: false,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (err) {
    console.error("GET /api/patients failed:", err);
    return fail("Unable to load patients.", 500);
  }
}

// POST /api/patients - create a patient (ADMIN / RECEPTIONIST)
export async function POST(req: Request) {
  const { user, error } = await requireWriteRole("ADMIN", "RECEPTIONIST");
  if (error) return error;

  let body: z.infer<typeof createPatientSchema>;
  try {
    body = createPatientSchema.parse(await req.json());
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
    const patient = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          email: body.email ? body.email.toLowerCase().trim() : null,
          phone: body.phone.trim(),
          notes: body.notes?.trim() || null,
          status: body.status ?? "ACTIVE",
        },
      });

      await tx.activity.create({
        data: {
          action: "Patient created",
          entity: "Patient",
          entityId: patient.id,
          description: `${user.name} created patient ${body.firstName.trim()} ${body.lastName.trim()}`,
          userId: user.id,
        },
      });
      return patient;
    });

    // In-app notification (never allowed to fail the patient creation).
    try {
      await notifyPatientCreated(patient);
    } catch (e) {
      console.error("Failed to create patient notification:", e);
    }

    revalidateHomepage();

    return ok(patient, 201);
  } catch (err: unknown) {
    console.error("POST /api/patients failed:", err);
    return fail("Unable to create patient.", 500);
  }
}
