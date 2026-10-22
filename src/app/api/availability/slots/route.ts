import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAvailableSlots } from "@/lib/scheduling";
import { isValidDateKey } from "@/lib/appointment-rules";

// GET /api/availability/slots?dentistId=&serviceId=&date=YYYY-MM-DD[&excludeAppointmentId=]
// Returns the available time slots for a dentist + service on a date.
// excludeAppointmentId omits one appointment from the busy check (used when
// rescheduling an existing appointment from the admin UI).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dentistId = searchParams.get("dentistId");
    const serviceId = searchParams.get("serviceId");
    const dateParam = searchParams.get("date");
    const excludeAppointmentId = searchParams.get("excludeAppointmentId") || undefined;

    if (!dentistId || !serviceId || !dateParam) {
      return NextResponse.json({ success: false, message: "dentistId, serviceId, and date are required." }, { status: 400 });
    }

    if (!isValidDateKey(dateParam)) {
      return NextResponse.json({ success: false, message: "Invalid date." }, { status: 400 });
    }
    const date = new Date(`${dateParam}T00:00:00.000Z`);

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service || service.status !== "ACTIVE") {
      return NextResponse.json({ success: false, message: "Service not found." }, { status: 404 });
    }

    const slots = await getAvailableSlots(dentistId, service, date, excludeAppointmentId);

    return NextResponse.json({
      success: true,
      data: slots ? slots : [],
      available: slots !== null && slots.length > 0,
    });
  } catch (err) {
    console.error("GET /api/availability/slots failed:", err);
    return NextResponse.json({ success: false, message: "Unable to load available slots." }, { status: 500 });
  }
}
