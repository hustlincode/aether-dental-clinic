import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";

const baseURL = process.env.PERF_BASE_URL || "http://127.0.0.1:3102";
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname), "Benchmark a local server only.");
const samples = Number(process.env.PERF_SAMPLES || 30);
assert(Number.isInteger(samples) && samples >= 1 && samples <= 100, "PERF_SAMPLES must be between 1 and 100.");
const output = process.env.PERF_OUTPUT || "node_modules/.cache/loading-performance.json";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
const records = { api: {}, pages: {} };

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2),
    p95: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
  };
}

async function get(path, label, record = true) {
  const start = performance.now();
  const response = await context.request.get(path);
  const body = await response.body();
  assert(response.ok(), `${label}: HTTP ${response.status()}`);
  const json = JSON.parse(body.toString());
  assert(json.success === true, `${label}: unsuccessful response`);
  if (record) (records.api[label] ||= []).push({ ms: performance.now() - start, bytes: body.length });
  return json.data;
}

try {
  const services = await get("/api/services", "services");
  const dentists = await get("/api/dentists?view=booking", "dentists");
  assert(services.length && dentists.length, "Benchmark needs an active service and dentist; it never creates fixtures.");
  const query = new URLSearchParams({ serviceId: services[0].id, dentistId: dentists[0].id });
  const datesPath = `/api/availability/dates?${query}&daysAhead=45`;
  const dates = await get(datesPath, "dates");
  assert(dates.length, "Selected dentist/service has no available dates; choose representative data before benchmarking.");
  const slotsPath = `/api/availability/slots?${query}&date=${dates[0]}`;
  const endpoints = [["services", "/api/services"], ["dentists", "/api/dentists?view=booking"], ["clinic", "/api/clinic"], ["dates", datesPath], ["slots", slotsPath]];
  // Public GET requests only: never submit a booking, sign in, or visit a dashboard that can trigger reminders.
  await get("/api/clinic", "clinic");
  await get(slotsPath, "slots");
  const firstApi = Object.fromEntries(Object.entries(records.api).map(([key, value]) => [key, value[0]]));
  records.api = {};
  for (let i = 0; i < samples; i++) {
    for (const [label, path] of endpoints) await get(path, label);
    if ((i + 1) % 10 === 0) console.log(`API samples ${i + 1}/${samples}`);
  }

  const page = await context.newPage();
  for (const path of ["/", "/book"]) {
    const measurements = [];
    for (let i = 0; i <= samples; i++) {
      const start = performance.now();
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      assert(response?.ok(), `${path}: document failed`);
      if (path === "/book") await page.getByRole("button").filter({ hasText: services[0].name }).first().waitFor({ state: "visible" });
      else await page.getByRole("heading", { level: 1 }).waitFor({ state: "visible" });
      const usableMs = performance.now() - start;
      const navigation = await page.evaluate(() => {
        const entry = performance.getEntriesByType("navigation")[0];
        return {
          ttfbMs: entry.responseStart - entry.requestStart,
          jsTransferBytes: performance.getEntriesByType("resource").filter((resource) => resource.initiatorType === "script").reduce((sum, resource) => sum + resource.transferSize, 0),
        };
      });
      measurements.push({ usableMs, ...navigation });
    }
    records.pages[path] = { first: measurements[0], warm: measurements.slice(1) };
    console.log(`Page samples ${path}: ${samples} repeat visits`);
  }

  const summary = {
    api: Object.fromEntries(Object.entries(records.api).map(([key, rows]) => [key, { ms: summarize(rows.map((row) => row.ms)), bytes: rows[0].bytes }])),
    pages: Object.fromEntries(Object.entries(records.pages).map(([key, value]) => [key, { first: value.first, usableMs: summarize(value.warm.map((row) => row.usableMs)), ttfbMs: summarize(value.warm.map((row) => row.ttfbMs)) }])),
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), samples, firstApi, summary, records }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Saved timing data to ${output}`);
} finally {
  await context.close();
  await browser.close();
}
