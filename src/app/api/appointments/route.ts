import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, getSessionUser } from "@/lib/api";
import { generateAppointmentReference } from "@/lib/reference";
import { isSlotAvailable } from "@/lib/scheduling";
import { sendAppointmentEmail } from "@/lib/email";
import { notifyAppointmentCreated } from "@/lib/notifications";
import { appointmentEnd, isValidDateKey, isValidTime } from "@/lib/appointment-rules";
import { AppointmentError, appointmentTransaction } from "@/lib/appointment-transaction";
import { revalidateHomepage } from "@/lib/home-cache";

// --- Public booking payload ---
const bookingSchema = z.object({
  serviceId: z.string().min(1).max(100),
  dentistId: z.string().min(1).max(100),
  date: z.string().refine(isValidDateKey, "Date must be a real date in YYYY-MM-DD format."),
  startTime: z.string().refine(isValidTime, "Time must be a valid HH:mm time."),
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  email: z.string().trim().email("Please provide a valid email address.").max(254),
  phone: z.string().trim().min(7, "Please provide a valid phone number.").max(30),
  notes: z.string().max(4000).optional(),
  // Data Privacy Act (RA 10173): explicit, informed consent is required before
  // collecting/processing personal information (health-related data is sensitive).
  dataPrivacyConsent: z.boolean().optional(),
  dataPrivacySignature: z.string().max(250).optional(),
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

  // Data Privacy Act (RA 10173) consent gate: no appointment without explicit
  // consent. The signature must match the patient's full name (electronic signature).
  if (body.dataPrivacyConsent !== true) {
    return NextResponse.json(
      { success: false, message: "Please accept the Data Privacy Policy before booking." },
      { status: 400 }
    );
  }
  const expectedSignature = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim().toLowerCase();
  const providedSignature = (body.dataPrivacySignature || "").replace(/\s+/g, " ").trim();
  if (!providedSignature || providedSignature.toLowerCase() !== expectedSignature) {
    return NextResponse.json(
      { success: false, message: "Your electronic signature must match your full name." },
      { status: 400 }
    );
  }

  try {
    const appointmentDate = new Date(`${date}T00:00:00.000Z`);
    const referenceNumber = await generateAppointmentReference(appointmentDate);
    const appointment = await appointmentTransaction(async (tx) => {
      const [service, dentist] = await Promise.all([
        tx.service.findUnique({ where: { id: serviceId } }),
        tx.dentist.findUnique({ where: { id: dentistId } }),
      ]);
      if (!service || service.status !== "ACTIVE" || !dentist || dentist.status !== "ACTIVE") {
        throw new AppointmentError("This service or dentist is not available for booking.", 400);
      }
      const endTime = appointmentEnd(startTime, service.durationMin);
      if (!endTime || !await isSlotAvailable(dentistId, startTime, endTime, appointmentDate, undefined, tx)) {
        throw new AppointmentError("This appointment slot is no longer available. Please select another time.");
      }
      // Contact details do not prove ownership of an existing patient record.
      const patient = await tx.patient.create({
        data: { firstName, lastName, email: email.toLowerCase(), phone, notes: notes || null },
      });
      const created = await tx.appointment.create({
        data: {
          referenceNumber,
          appointmentDate,
          startTime,
          endTime,
          status: "PENDING",
          price: service.price,
          notes: notes || null,
          dataPrivacyConsent: true,
          dataPrivacyConsentAt: new Date(),
          dataPrivacyConsentSignature: providedSignature,
          patientId: patient.id,
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
    const { service, dentist } = appointment;
    const [emailResult] = await Promise.all([
      sendAppointmentEmail("appointment_pending", email, {
        patientName: `${firstName} ${lastName}`,
        referenceNumber,
        serviceName: service.name,
        dentistName: dentist.name,
        date: fmtDate(date),
        time: fmtTime(startTime),
      }).catch((error) => {
        console.error("Appointment request email failed:", error);
        return { ok: false, status: "FAILED" };
      }),
      notifyAppointmentCreated(appointment).catch((error) => {
        console.error("Failed to create appointment notification:", error);
      }),
    ]);

    // The homepage shows the "appointments served" / "patients" counters, so a
    // new booking has to invalidate the cached homepage.
    try { revalidateHomepage(); } catch (error) { console.error("Homepage revalidation failed:", error); }

    return NextResponse.json(
      {
        success: true,
        message: emailResult.ok
          ? "Your appointment request has been received! We will confirm it shortly."
          : "Your appointment request was received, but we could not send the request receipt email.",
        data: {
          referenceNumber,
          appointmentId: appointment.id,
          subject: {
            referenceNumber,
            patientName: `${firstName} ${lastName}`,
            patientEmail: email,
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
    if (err instanceof AppointmentError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    console.error("POST /api/appointments failed:", err);
    return NextResponse.json({ success: false, message: "Unable to create the appointment. Please try again." }, { status: 500 });
  }
}


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
    const calendarView = searchParams.get("view") === "calendar";

    if (date && !isValidDateKey(date)) {
      return NextResponse.json({ success: false, message: "Invalid appointment date." }, { status: 400 });
    }
    if (status && !Object.values(AppointmentStatus).includes(status as AppointmentStatus)) {
      return NextResponse.json({ success: false, message: "Invalid appointment status." }, { status: 400 });
    }
    if (from && !isValidDateKey(from)) {
      return NextResponse.json({ success: false, message: "Invalid 'from' date. Use YYYY-MM-DD format." }, { status: 400 });
    }
    if (to && !isValidDateKey(to)) {
      return NextResponse.json({ success: false, message: "Invalid 'to' date. Use YYYY-MM-DD format." }, { status: 400 });
    }
    if (calendarView && (!from || !to || from > to ||
      new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime() > 30 * 86400000)) {
      return NextResponse.json({ success: false, message: "Calendar requires an ordered from/to range of at most 31 days." }, { status: 400 });
    }

    const hasDateRange = Boolean(from || to);

    // Legacy date-range callers keep their response; calendar view uses bounded pages.
    const page = hasDateRange && !calendarView ? 1 : parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = calendarView
      ? parsePositiveInt(searchParams.get("pageSize"), 200, 200)
      : hasDateRange
        ? parsePositiveInt(searchParams.get("pageSize"), 500, 500)
        : parsePositiveInt(searchParams.get("pageSize"), 20, 100);

    const where: Prisma.AppointmentWhereInput = {};
    if (date && !hasDateRange) where.appointmentDate = new Date(`${date}T00:00:00.000Z`);
    if (status) where.status = status as AppointmentStatus;
    if (dentistId) where.dentistId = dentistId;
    if (hasDateRange) {
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
    if (calendarView) orderBy.push({ id: "asc" });

    const query: Prisma.AppointmentFindManyArgs = {
      where,
      ...(calendarView ? { select: {
        id: true, referenceNumber: true, appointmentDate: true, startTime: true, endTime: true, status: true, notes: true,
        patient: { select: { firstName: true, lastName: true, phone: true } },
        dentist: { select: { name: true } },
        service: { select: { name: true } },
      } } : { include: { patient: true, dentist: true, service: true } }),
      orderBy,
      ...(hasDateRange && !calendarView ? {} : { skip: (page - 1) * pageSize }),
      take: pageSize,
    };
    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany(query),
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
