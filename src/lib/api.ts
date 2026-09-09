import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export type ApiRole = "ADMIN" | "RECEPTIONIST" | "DENTIST";

/**
 * Returns the current authenticated session's user, or null.
 */
export async function getSessionUser() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;
  return user as { id: string; name: string; email: string; role: string };
}

/**
 * Guards an API route: returns a 401 response if not authenticated.
 */
export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null as null,
      error: NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 }
      ),
    };
  }
  return { user, error: null as null };
}

/**
 * Guards an API route by role: returns 401 if unauthenticated, 403 if wrong role.
 */
export async function requireRole(...roles: ApiRole[]) {
  const { user, error } = await requireAuth();
  if (error) return { user: null, error };

  if (roles.length && !roles.includes(user!.role as ApiRole)) {
    return {
      user: null,
      error: NextResponse.json({ success: false, message: "You do not have permission to perform this action." }, { status: 403 }),
    };
  }
  return { user, error: null };
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ success: false, message, ...(details ? { details } : {}) }, { status });
}

/**
 * Wraps an async API handler with centralized error handling + Zod validation.
 */
interface ApiContext {
  params: Promise<Record<string, string>>;
}

export function apiHandler(
  fn: (req: Request, ctx: ApiContext) => Promise<NextResponse>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod schema is inherently dynamic and polymorphic
  opts?: { schema?: any }
) {
  return async (req: Request, ctx: ApiContext) => {
    try {
      if (opts?.schema) {
        // If a schema is provided for POST/PUT, parse the JSON body
        if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
          const body = await req.json();
          if (opts.schema) {
            const parsed = opts.schema.safeParse(body);
            if (!parsed.success) {
              return fail("Validation failed.", 422, formattedZodError(parsed.error));
            }
          }
        }
      }
      return await fn(req, ctx);
    } catch (err) {
      console.error("API error:", err);
      if (err instanceof ZodError) {
        if (opts?.schema) {
          return fail("Validation failed.", 422, formattedZodError(err));
        }
        return fail("Validation failed.", 422);
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          return fail("A record with this value already exists. Please check your input.", 409);
        }
        return fail("A database error occurred.", 500);
      }
      return fail("An unexpected error occurred.", 500);
    }
  };
}

export function formattedZodError(error: ZodError): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!issues[key]) issues[key] = [];
    issues[key].push(issue.message);
  }
  return issues;
}
