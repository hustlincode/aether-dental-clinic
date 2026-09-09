import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, ok, fail } from "@/lib/api";

// ─── Zod schema for creating a service ───────────────────────────────────────
const createServiceSchema = z.object({
  name: z.string().min(1, "Service name is required."),
  description: z.string().optional().nullable(),
  durationMin: z.number().int().positive("Duration must be a positive number.").max(600, "Duration cannot exceed 600 minutes."),
  price: z.number().min(0, "Price cannot be negative."),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

// ─── GET /api/services ───────────────────────────────────────────────────────
// Public: returns only ACTIVE services by default (for booking).
// Admin/staff: supports ?all=true, ?status=ACTIVE|INACTIVE, ?search=term
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("all") === "true";
    const statusFilter = searchParams.get("status");
    const search = searchParams.get("search")?.trim();

    // Build the where clause
    const where: Record<string, unknown> = {};

    if (statusFilter === "ACTIVE" || statusFilter === "INACTIVE") {
      // Explicit status filter takes precedence
      where.status = statusFilter;
    } else if (!includeInactive) {
      // Default: only ACTIVE (public booking)
      where.status = "ACTIVE";
    }
    // If includeInactive === true and no statusFilter: no status filter (all services)

    // Name search (case-insensitive contains)
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const services = await prisma.service.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: services });
  } catch (err) {
    console.error("GET /api/services failed:", err);
    return NextResponse.json({ success: false, message: "Unable to load services." }, { status: 500 });
  }
}

// ─── POST /api/services ──────────────────────────────────────────────────────
// Admin only: create a new service
export async function POST(req: Request) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;

  let body: z.infer<typeof createServiceSchema>;
  try {
    body = createServiceSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues: Record<string, string[]> = {};
      for (const i of err.issues) {
        const key = i.path.join(".") || "form";
        if (!issues[key]) issues[key] = [];
        issues[key].push(i.message);
      }
      return fail("Validation failed.", 422, issues);
    }
    return fail("Invalid request body.", 400);
  }

  try {
    const service = await prisma.service.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        durationMin: body.durationMin,
        price: body.price,
        status: body.status ?? "ACTIVE",
      },
    });

    return ok(service, 201);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return fail("A service with this name already exists.", 409);
    }
    console.error("POST /api/services failed:", err);
    return fail("Unable to create service.", 500);
  }
}
