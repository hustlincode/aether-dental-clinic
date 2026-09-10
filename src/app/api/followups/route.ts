import { Prisma, FollowUpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, ok, fail } from "@/lib/api";

function parsePositiveInt(raw: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

// GET /api/followups - list follow-ups with filters + pagination (any staff)
export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 10, 100);
    const status = searchParams.get("status"); // FollowUpStatus | empty = all
    const search = searchParams.get("search")?.trim() || "";

    const where: Prisma.FollowUpWhereInput = {};
    if (status && (Object.values(FollowUpStatus) as string[]).includes(status)) {
      where.status = status as FollowUpStatus;
    }
    if (search) {
      where.patient = {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      prisma.followUp.findMany({
        where,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, email: true } },
          appointment: {
            select: {
              id: true,
              referenceNumber: true,
              appointmentDate: true,
              startTime: true,
              service: { select: { name: true } },
            },
          },
        },
        orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.followUp.count({ where }),
    ]);

    return ok({
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    console.error("GET /api/followups failed:", err);
    return fail("Unable to load follow-ups.", 500);
  }
}