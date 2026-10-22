import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAvailableDates } from "@/lib/scheduling";
import { clinicDateKey, dateKeyToUtc } from "@/lib/clinic-time";

// GET /api/availability/dates?dentistId=&serviceId=&daysAhead=30
// Returns a list of ISO dates (YYYY-MM-DD) that are selectable (have ≥1 slot).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dentistId = searchParams.get("dentistId");
    const serviceId = searchParams.get("serviceId");
    const daysAhead = Number(searchParams.get("daysAhead") || 30);
    if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 60) {
      return NextResponse.json({ success: false, message: "daysAhead must be an integer from 1 to 60." }, { status: 400 });
    }

    if (!dentistId || !serviceId) {
      return NextResponse.json({ success: false, message: "dentistId and serviceId are required." }, { status: 400 });
    }

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service || service.status !== "ACTIVE") {
      return NextResponse.json({ success: false, message: "Service not found." }, { status: 404 });
    }

    const today = dateKeyToUtc(clinicDateKey());

    const dates = await getAvailableDates(dentistId, service, today, daysAhead);

    return NextResponse.json({ success: true, data: dates });
  } catch (err) {
    console.error("GET /api/availability/dates failed:", err);
    return NextResponse.json({ success: false, message: "Unable to load available dates." }, { status: 500 });
  }
}
