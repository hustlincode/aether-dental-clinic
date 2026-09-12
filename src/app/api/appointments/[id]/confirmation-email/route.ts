import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api";
import { sendConfirmationEmail } from "@/lib/confirmations";

// POST /api/appointments/[id]/confirmation-email
// Sends a "please confirm your appointment" email and records the attempt.
// ADMIN / RECEPTIONIST only.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireRole("ADMIN", "RECEPTIONIST");
  if (error) return error;

  try {
    const result = await sendConfirmationEmail(id, user?.id ?? null);

    if (!result.found) {
      return NextResponse.json({ success: false, message: "Appointment not found." }, { status: 404 });
    }
    if (!result.allowed) {
      return NextResponse.json({ success: false, message: result.reason }, { status: 422 });
    }
    if (result.status === "FAILED") {
      return NextResponse.json(
        { success: false, message: result.error, data: { status: result.status, sentAt: result.sentAt } },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { status: result.status, sentAt: result.sentAt },
    });
  } catch (err) {
    console.error("POST /api/appointments/[id]/confirmation-email failed:", err);
    return NextResponse.json(
      { success: false, message: "Unable to send the confirmation email." },
      { status: 500 },
    );
  }
}
