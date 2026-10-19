import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export type ApiRole = "ADMIN" | "RECEPTIONIST" | "DENTIST";

export interface ApiSessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Public read-only demo session — never allowed to mutate clinic data. */
  isDemo?: boolean;
}

/**
 * Returns the current authenticated session's user, or null.
 */
export async function getSessionUser() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;
  return user as ApiSessionUser;
}

const DEMO_READ_ONLY_MESSAGE =
  "This is a read-only demo. Sign in with a staff account to make changes.";

function demoReadOnlyError() {
  return NextResponse.json({ success: false, message: DEMO_READ_ONLY_MESSAGE }, { status: 403 });
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

/**
 * Guards a *mutating* API route: like `requireAuth`, but demo sessions are
 * rejected with 403. The public showcase demo can read every page while the
 * seeded clinic data stays intact.
 *
 * Every POST/PATCH/PUT/DELETE handler must use this (or `requireWriteRole`)
 * instead of the read-only guards.
 */
export async function requireWriteAuth() {
  const { user, error } = await requireAuth();
  if (error) return { user: null, error };
  if (user!.isDemo) return { user: null, error: demoReadOnlyError() };
  return { user, error: null };
}

/**
 * Role-guarded variant of `requireWriteAuth` for admin/reception mutations.
 */
export async function requireWriteRole(...roles: ApiRole[]) {
  const { user, error } = await requireRole(...roles);
  if (error) return { user: null, error };
  if (user!.isDemo) return { user: null, error: demoReadOnlyError() };
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
