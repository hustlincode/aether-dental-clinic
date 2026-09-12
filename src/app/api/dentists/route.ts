import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser, requireRole, ok, fail } from "@/lib/api";

// ─── Zod schema for creating a dentist ───────────────────────────────────────
const createDentistSchema = z.object({
  name: z.string().trim().min(2, "Dentist name must be at least 2 characters."),
  email: z.string().trim().email("Please provide a valid email address."),
  phone: z.string().trim().min(7, "Please provide a valid phone number.").optional().or(z.literal("")),
  specialization: z.string().trim().min(1, "Specialization is required."),
  profileImage: z.string().trim().url("Please provide a valid image URL.").optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const STAFF_ROLES = new Set(["ADMIN", "RECEPTIONIST", "DENTIST"]);

// GET /api/dentists - list dentists.
//
// Backward compatible with the public booking flow:
//   - unauthenticated callers always receive ACTIVE dentists only;
//   - `?all=true` additionally returns INACTIVE dentists, but ONLY for
//     authenticated staff (the admin edit-appointment dialog needs them).
// An unauthenticated `?all=true` degrades silently to ACTIVE-only (200).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wantsAll = searchParams.get("all") === "true";

    const user = await getSessionUser();
    const isStaff = !!user && STAFF_ROLES.has(user.role);
    const includeInactive = wantsAll && isStaff;

    const dentists = await prisma.dentist.findMany({
      where: includeInactive ? undefined : { status: "ACTIVE" },
      include: {
        availability: { orderBy: { dayOfWeek: "asc" } },
        _count: { select: { appointments: true } },
      },
      orderBy: { name: "asc" },
    });

    return ok(dentists);
  } catch (err) {
    console.error("GET /api/dentists failed:", err);
    return fail("Unable to load dentists.", 500);
  }
}

// POST /api/dentists - create a dentist (ADMIN only)
export async function POST(req: Request) {
  const { user, error } = await requireRole("ADMIN");
  if (error) return error;

  let body: z.infer<typeof createDentistSchema>;
  try {
    body = createDentistSchema.parse(await req.json());
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
    const dentist = await prisma.dentist.create({
      data: {
        name: body.name.trim(),
        email: body.email.toLowerCase().trim(),
        phone: body.phone?.trim() || null,
        specialization: body.specialization.trim(),
        profileImage: body.profileImage?.trim() || null,
        status: body.status ?? "ACTIVE",
      },
    });

    await prisma.activity.create({
      data: {
        action: "Dentist created",
        entity: "Dentist",
        entityId: dentist.id,
        description: `${user.name} created dentist ${dentist.name}`,
        userId: user.id,
      },
    });

    return ok(dentist, 201);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return fail("A dentist with this email already exists.", 409);
    }
    console.error("POST /api/dentists failed:", err);
    return fail("Unable to create dentist.", 500);
  }
}