import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAvailableDates } from "@/lib/scheduling";

// GET /api/availability/dates?dentistId=&serviceId=&daysAhead=30
// Returns a list of ISO dates (YYYY-MM-DD) that are selectable (have ≥1 slot).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dentistId = searchParams.get("dentistId");
    const serviceId = searchParams.get("serviceId");
    const daysAhead = Math.min(Number(searchParams.get("daysAhead") || 30), 60);

    if (!dentistId || !serviceId) {
      return NextResponse.json({ success: false, message: "dentistId and serviceId are required." }, { status: 400 });
    }

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service || service.status !== "ACTIVE") {
      return NextResponse.json({ success: false, message: "Service not found." }, { status: 404 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dates = await getAvailableDates(dentistId, service, today, daysAhead);

    return NextResponse.json({ success: true, data: dates });
  } catch (err) {
    console.error("GET /api/availability/dates failed:", err);
    return NextResponse.json({ success: false, message: "Unable to load available dates." }, { status: 500 });
  }
}
