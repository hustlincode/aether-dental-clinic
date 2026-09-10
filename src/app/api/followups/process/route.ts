import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api";
import { processDueFollowUps } from "@/lib/followups";

// POST /api/followups/process
// Manually run the automation: send every due follow-up (ADMIN / RECEPTIONIST).
export async function POST() {
  const { error } = await requireRole("ADMIN", "RECEPTIONIST");
  if (error) return error;

  try {
    const summary = await processDueFollowUps();
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    console.error("POST /api/followups/process failed:", err);
    return NextResponse.json({ success: false, message: "Unable to process follow-ups." }, { status: 500 });
  }
}