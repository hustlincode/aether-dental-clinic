import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/clinic - public clinic info for booking display
export async function GET() {
  try {
    const clinic = await prisma.clinicSetting.findUnique({ where: { id: "singleton" } });
    if (!clinic) {
      return NextResponse.json({ success: false, message: "Clinic settings not configured." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: clinic });
  } catch (err) {
    console.error("GET /api/clinic failed:", err);
    return NextResponse.json({ success: false, message: "Unable to load clinic settings." }, { status: 500 });
  }
}
