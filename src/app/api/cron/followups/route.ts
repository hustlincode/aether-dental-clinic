import { NextResponse } from "next/server";
import { processDueFollowUps } from "@/lib/followups";
import { processUpcomingAppointmentReminders } from "@/lib/notifications";

// GET /api/cron/followups
// Cron entry point for automation (e.g. Vercel Cron, GitHub Actions, Windows
// Task Scheduler). Guarded by CRON_SECRET when configured; otherwise intended
// for local/demo use.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    if (!key || key !== secret) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
  }

  try {
    const summary = await processDueFollowUps();
    const reminders = await processUpcomingAppointmentReminders();
    return NextResponse.json({ success: true, data: { ...summary, reminders } });
  } catch (err) {
    console.error("GET /api/cron/followups failed:", err);
    return NextResponse.json({ success: false, message: "Unable to process follow-ups." }, { status: 500 });
  }
}