import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, getSessionUser } from "@/lib/api";
import { generateAppointmentReference } from "@/lib/reference";
import { isSlotAvailable } from "@/lib/scheduling";
import { sendAppointmentEmail } from "@/lib/email";
import { notifyAppointmentCreated } from "@/lib/notifications";

// --- Public booking payload ---
const bookingSchema = z.object({
  serviceId: z.string().min(1),
  dentistId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:mm format."),
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  email: z.string().email("Please provide a valid email address."),
  phone: z.string().min(7, "Please provide a valid phone number."),
  notes: z.string().optional(),
});

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function parsePositiveInt(raw: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

// POST /api/appointments
// Handles public self-booking. Server-side double-booking prevention is enforced here.
export async function POST(req: Request) {
  // Auth is optional: public users may book without logging in.
  const sessionUser = await getSessionUser();

  let body: z.infer<typeof bookingSchema>;
  try {
    body = bookingSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues: Record<string, string[]> = {};
      for (const i of err.issues) {
        const key = i.path.join(".") || "form";
        if (!issues[key]) issues[key] = [];
        issues[key].push(i.message);
      }
      return NextResponse.json({ success: false, message: "Please check the highlighted fields.", details: issues }, { status: 422 });
    }
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }

  const { serviceId, dentistId, date, startTime, firstName, lastName, email, phone, notes } = body;

  try {
    const appointmentDate = new Date(`${date}T00:00:00.000Z`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (appointmentDate < today) {
      return NextResponse.json({ success: false, message: "Appointments cannot be booked in the past." }, { status: 400 });
    }

    const [service, dentist] = await Promise.all([
      prisma.service.findUnique({ where: { id: serviceId } }),
      prisma.dentist.findUnique({ where: { id: dentistId } }),
    ]);

    if (!service || service.status !== "ACTIVE") {
      return NextResponse.json({ success: false, message: "This service is not available for booking." }, { status: 400 });
    }
    if (!dentist || dentist.status !== "ACTIVE") {
      return NextResponse.json({ success: false, message: "This dentist is not available for booking." }, { status: 400 });
    }

    // Compute end time from service duration
    const [sh, sm] = startTime.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = startMin + service.durationMin;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    // Server-side double-booking prevention
    const available = await isSlotAvailable(dentistId, startTime, endTime, appointmentDate);
    if (!available) {
      return NextResponse.json(
        { success: false, message: "This appointment slot is no longer available. Please select another time." },
        { status: 409 }
      );
    }

    // Find or create the patient
    let patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { phone },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          firstName,
          lastName,
          email: email.toLowerCase(),
          phone,
          notes: notes || null,
        },
      });
    }

    const referenceNumber = await generateAppointmentReference(appointmentDate);

    // Transactionally create the appointment + activity log
    const appointment = await prisma.$transaction(async (tx) => {
      // Re-check within the transaction to reduce race conditions
      const conflict = await tx.appointment.findFirst({
        where: {
          dentistId,
          appointmentDate,
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
          OR: [
            { startTime: { lte: startTime }, endTime: { gt: startTime } },
            { startTime: { lt: endTime }, endTime: { gte: endTime } },
            { startTime: { gte: startTime }, endTime: { lte: endTime } },
          ],
        },
      });
      if (conflict) {
        throw new BookingConflictError();
      }

      const created = await tx.appointment.create({
        data: {
          referenceNumber,
          appointmentDate,
          startTime,
          endTime,
          status: "PENDING",
          price: service.price,
          notes: notes || null,
          patientId: patient!.id,
          dentistId,
          serviceId,
          createdById: sessionUser?.id || null,
        },
        include: { patient: true, dentist: true, service: true },
      });

      await tx.activity.create({
        data: {
          action: "Appointment created",
          entity: "Appointment",
          entityId: created.id,
          description: `${sessionUser?.name || firstName} booked an appointment for ${firstName} ${lastName}`,
          userId: sessionUser?.id || null,
        },
      });

      return created;
    });

    // Email delivery is decoupled from appointment creation.
    // Failures are logged and never roll back the appointment.
    // New bookings are PENDING, so we send a "request received" email here.
    // The actual confirmation email is sent only when staff confirms the status.
    const emailResult = await sendAppointmentEmail("appointment_pending", patient!.email || email, {
      patientName: `${firstName} ${lastName}`,
      referenceNumber,
      serviceName: service.name,
      dentistName: dentist.name,
      date: fmtDate(date),
      time: fmtTime(startTime),
    });

    // In-app notifications are created only after the DB transaction succeeded
    // and are never allowed to fail the booking.
    try {
      await notifyAppointmentCreated(appointment);
    } catch (e) {
      console.error("Failed to create appointment notification:", e);
    }

    return NextResponse.json(
      {
        success: true,
        message: emailResult.ok
          ? "Your appointment request has been received! We will confirm it shortly."
          : "Your appointment was created successfully, but we could not send a confirmation email.",
        data: {
          referenceNumber,
          appointmentId: appointment.id,
          subject: {
            referenceNumber,
            patientName: `${firstName} ${lastName}`,
            patientEmail: patient!.email || email,
            serviceName: service.name,
            dentistName: dentist.name,
            date: fmtDate(date),
            time: fmtTime(startTime),
            status: appointment.status,
          },
          email: emailResult,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json({ success: false, message: "This appointment slot is no longer available. Please select another time." }, { status: 409 });
    }
    console.error("POST /api/appointments failed:", err);
    return NextResponse.json({ success: false, message: "Unable to create the appointment. Please try again." }, { status: 500 });
  }
}

class BookingConflictError extends Error {}

// GET /api/appointments - authenticated; list appointments with filters (staff)
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const dentistId = searchParams.get("dentistId");
    const search = searchParams.get("search")?.trim() || undefined;
    const sort = searchParams.get("sort"); // "date:asc" (default) | "date:desc"

    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 100);

    const where: Prisma.AppointmentWhereInput = {};
    if (date) where.appointmentDate = new Date(`${date}T00:00:00.000Z`);
    if (status) where.status = status as AppointmentStatus;
    if (dentistId) where.dentistId = dentistId;
    if (from || to) {
      where.appointmentDate = {
        ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
      };
    }
    // Search matches patient name, email, or phone
    if (search) {
      where.OR = [
        { patient: { firstName: { contains: search, mode: "insensitive" } } },
        { patient: { lastName: { contains: search, mode: "insensitive" } } },
        { patient: { email: { contains: search, mode: "insensitive" } } },
        { patient: { phone: { contains: search, mode: "insensitive" } } },
      ];
    }

    // Role-scoping: dentists only see their own appointments
    if (user.role === "DENTIST") {
      const assigned = await prisma.dentist.findFirst({ where: { email: user.email } });
      if (!assigned) {
        return NextResponse.json({
          success: true,
          data: { items: [], pagination: { page, pageSize, total: 0, totalPages: 0 } },
        });
      }
      where.dentistId = assigned.id;
    }

    const orderBy: Prisma.AppointmentOrderByWithRelationInput[] =
      sort === "date:desc"
        ? [{ appointmentDate: "desc" }, { startTime: "desc" }]
        : [{ appointmentDate: "asc" }, { startTime: "asc" }];

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: { patient: true, dentist: true, service: true },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.appointment.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: appointments,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      },
    });
  } catch (err) {
    console.error("GET /api/appointments failed:", err);
    return NextResponse.json({ success: false, message: "Unable to load appointments." }, { status: 500 });
  }
}
