const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function assertTenantAuthEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env.AUTH_URL || env.NEXTAUTH_URL) {
    throw new Error("Remove AUTH_URL and NEXTAUTH_URL: clinic authentication derives its origin from the validated request host.");
  }
}

/** Only the configured platform suffix can select a clinic. */
export function tenantSlugFromHeaders(
  requestHeaders: Pick<Headers, "get">,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const base = (env.TENANT_BASE_DOMAIN || (env.NODE_ENV !== "production" ? "localhost" : "")).toLowerCase();
  if (!base || !base.split(".").every((label) => DNS_LABEL.test(label))) return null;
  const host = (env.TRUST_PROXY_HOST === "true"
    ? requestHeaders.get("x-forwarded-host") || requestHeaders.get("host")
    : requestHeaders.get("host"))?.toLowerCase();
  if (!host || !/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(host)) return null;
  const [hostname, port] = host.split(":");
  if (port && (Number(port) < 1 || Number(port) > 65535)) return null;
  if (env.NODE_ENV !== "production" && base === "localhost" && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return "aether";
  }
  if (!hostname.endsWith(`.${base}`)) return null;
  const slug = hostname.slice(0, -(base.length + 1));
  return DNS_LABEL.test(slug) ? slug : null;
}
