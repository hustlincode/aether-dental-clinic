import { NextResponse, type NextRequest } from "next/server";
import { tenantSlugFromHeaders } from "@/lib/tenant-host";
import { rawPrisma } from "@/lib/raw-db";
import { subscriptionAccess, SUBSCRIPTION_READ_ONLY_MESSAGE } from "@/lib/subscription";

export async function proxy(request: NextRequest) {
  const slug = tenantSlugFromHeaders(request.headers);
  if (!slug) {
    return new NextResponse("Clinic not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const tenant = await rawPrisma.tenant.findUnique({ where: { slug }, select: { active: true, subscriptionMode: true, subscriptionEndsAt: true } });
    if (!tenant?.active) return new NextResponse("Clinic not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
    const path = request.nextUrl.pathname;
    if (path.startsWith("/api/") && path !== "/api/auth" && !path.startsWith("/api/auth/") &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method) && !subscriptionAccess(tenant).canWrite) {
      return NextResponse.json(
        { success: false, code: "SUBSCRIPTION_READ_ONLY", message: SUBSCRIPTION_READ_ONLY_MESSAGE },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  } catch {
    return new NextResponse("Clinic temporarily unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const requestHeaders = new Headers(request.headers);
  const authority = process.env.TRUST_PROXY_HOST === "true"
    ? request.headers.get("x-forwarded-host") || request.headers.get("host")!
    : request.headers.get("host")!;
  // Auth.js reads forwarded headers independently; replace them with the validated authority.
  requestHeaders.set("host", authority);
  requestHeaders.set("x-forwarded-host", authority);
  requestHeaders.set("x-forwarded-proto", process.env.NODE_ENV === "production" && process.env.TENANT_BASE_DOMAIN !== "localhost" ? "https" : "http");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Clinic content is host-specific; disable shared caches until tenant-aware cache keys exist.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico$|icon.svg$|logo.svg$|theme-init.js$).*)"],
};
