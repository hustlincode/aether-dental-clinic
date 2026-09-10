import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api";
import { sendFollowUpNow } from "@/lib/followups";

// POST /api/followups/[id]/send
// Manually send a single follow-up email immediately (ADMIN / RECEPTIONIST).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole("ADMIN", "RECEPTIONIST");
  if (error) return error;

  try {
    const { id } = await params;
    const result = await sendFollowUpNow(id);
    if (!result.ok) {
      const status = result.status === "MISSING" ? 404 : 400;
      return NextResponse.json({ success: false, message: result.message || "Unable to send follow-up." }, { status });
    }
    return NextResponse.json({ success: true, data: { status: result.status, message: result.message } });
  } catch (err) {
    console.error("POST /api/followups/[id]/send failed:", err);
    return NextResponse.json({ success: false, message: "Unable to send the follow-up email." }, { status: 500 });
  }
}