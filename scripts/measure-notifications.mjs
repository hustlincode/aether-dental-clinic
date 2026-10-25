import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";

const baseURL = process.env.PERF_BASE_URL || "http://127.0.0.1:3110";
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname), "Benchmark a local test server only.");
const samples = Number(process.env.PERF_SAMPLES || 30);
assert(Number.isInteger(samples) && samples >= 1 && samples <= 100, "PERF_SAMPLES must be between 1 and 100.");
const output = process.env.PERF_OUTPUT || "node_modules/.cache/notification-performance.json";
const endpoints = {
  count: "/api/notifications/unread-count",
  preview: "/api/notifications?view=preview&pageSize=10",
  history: "/api/notifications?page=1&pageSize=20",
};
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL });
const page = await context.newPage();
const requests = [];
page.on("request", request => requests.push(request));

const requestPath = raw => { const url = new URL(raw); return url.pathname + url.search; };
const matches = path => response => requestPath(response.url()) === path;
const round = value => Math.round(value * 10) / 10;

async function measure(response) {
  await response.finished();
  assert(response.ok(), `Notification request failed: HTTP ${response.status()}`);
  const body = await response.body();
  assert(JSON.parse(body.toString()).success === true, "Notification request was unsuccessful.");
  const headers = response.headers();
  assert(headers["cache-control"]?.includes("private") && headers["cache-control"].includes("no-store"), "Notification reads must stay private and uncached.");
  const timing = response.request().timing();
  assert(timing.responseEnd >= timing.responseStart && timing.responseStart >= timing.requestStart, "Browser timing is incomplete.");
  const server = Object.fromEntries([...headers["server-timing"].matchAll(/(auth|data);dur=([\d.]+)/g)].map(match => [match[1], Number(match[2])]));
  assert(Number.isFinite(server.auth) && Number.isFinite(server.data), "Missing authentication or data Server-Timing.");
  return {
    ttfbMs: round(timing.responseStart - timing.requestStart),
    downloadMs: round(timing.responseEnd - timing.responseStart),
    totalMs: round(timing.responseEnd - timing.requestStart),
    authMs: server.auth,
    dataMs: server.data,
    decodedBytes: body.length,
    transferredBodyBytes: (await response.request().sizes()).responseBodySize,
    vercelId: headers["x-vercel-id"] || null,
  };
}

function summarize(rows) {
  return Object.fromEntries(["ttfbMs", "downloadMs", "totalMs", "authMs", "dataMs", "decodedBytes", "transferredBodyBytes"].map(key => {
    const sorted = rows.map(row => row[key]).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return [key, {
      median: round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2),
      p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    }];
  }));
}

try {
  // Use only the public demo sign-in and GETs; prepare synthetic data in an isolated test database separately.
  await page.goto("/login");
  const initialCount = page.waitForResponse(matches(endpoints.count));
  await page.getByRole("button", { name: /Explore the demo dashboard/i }).click();
  await page.waitForURL("**/admin");
  const firstObserved = { count: await measure(await initialCount) };
  const preview = page.waitForResponse(matches(endpoints.preview));
  await page.getByRole("button", { name: /^Notifications(?:,.*)?$/, exact: true }).click();
  firstObserved.preview = await measure(await preview);
  const history = page.waitForResponse(matches(endpoints.history));
  await page.getByRole("button", { name: "View all notifications", exact: true }).click();
  firstObserved.history = await measure(await history);

  const uiRequests = {
    dashboard: requests.filter(request => {
      const headers = request.headers();
      return new URL(request.url()).pathname === "/admin" && headers["next-router-prefetch"] !== "1" && headers.purpose !== "prefetch";
    }).length,
    ...Object.fromEntries(Object.entries(endpoints).map(([label, path]) => [label, requests.filter(request => requestPath(request.url()) === path).length])),
  };
  assert.deepEqual(uiRequests, { dashboard: 1, count: 1, preview: 1, history: 1 }, "Unexpected notification or dashboard request duplication.");

  const records = { count: [], preview: [], history: [] };
  for (let i = 0; i < samples; i++) {
    for (const [label, path] of Object.entries(endpoints)) {
      const pending = page.waitForResponse(matches(path));
      await page.evaluate(async path => {
        const response = await fetch(path, { cache: "no-store" });
        await response.arrayBuffer();
      }, path);
      records[label].push(await measure(await pending));
    }
    if ((i + 1) % 10 === 0) console.log(`Authenticated samples ${i + 1}/${samples}`);
  }
  const summary = Object.fromEntries(Object.entries(records).map(([label, rows]) => [label, summarize(rows)]));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), samples, environment: "local production build; synthetic demo account", coldStart: "Not established: first observed requests are reported separately, not classified as platform cold starts.", uiRequests, firstObserved, summary, records }, null, 2));
  console.log(JSON.stringify({ uiRequests, firstObserved, summary }, null, 2));
  console.log(`Saved timing data to ${output}`);
} finally {
  await context.close();
  await browser.close();
}
