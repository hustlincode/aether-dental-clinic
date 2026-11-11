import type { BrowserContext } from "@playwright/test";

// APIRequest uses OS DNS; preserve the browser's clinic host/session while connecting to loopback.
export async function clinicRequest(context: BrowserContext, path: string, options: { method?: string; data?: unknown } = {}) {
  const cookies = await context.cookies("http://aether.localhost:3100");
  return context.request.fetch(`http://127.0.0.1:3100${path}`, {
    ...options,
    headers: { Host: "aether.localhost:3100", Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ") },
  });
}
