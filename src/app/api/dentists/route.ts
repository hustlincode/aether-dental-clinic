import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/dentists - list dentists (public: only active unless ?all=true)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("all") === "true";

    const dentists = await prisma.dentist.findMany({
      where: includeInactive ? undefined : { status: "ACTIVE" },
      include: {
        availability: { orderBy: { dayOfWeek: "asc" } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: dentists });
  } catch (err) {
    console.error("GET /api/dentists failed:", err);
    return NextResponse.json({ success: false, message: "Unable to load dentists." }, { status: 500 });
  }
}
