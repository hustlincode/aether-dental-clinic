import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { prisma } from "../../src/lib/db";
import { mockPrismaMethod } from "../helpers/mock-prisma";
import { mockModuleExports } from "../helpers/mock-module";

function section(tree: ReactElement<{ children?: ReactNode }>, index: number) {
  const boundary = Children.toArray(tree.props.children)[index] as ReactElement<{ children: ReactElement }>;
  const child = boundary.props.children;
  assert(isValidElement(child));
  return (child.type as (props: unknown) => Promise<ReactElement>)(child.props);
}

test("dashboard header and metrics do not await analytics or reminder work", async (t) => {
  const callbacks: (() => Promise<void>)[] = [];
  let reminderCalls = 0;
  let user = { id: "staff", role: "ADMIN", name: "Staff", email: "staff@example.test", isDemo: false };
  mockModuleExports(t, require.resolve("../../src/auth"), { auth: async () => ({ user }) });
  mockModuleExports(t, require.resolve("next/server"), { after: (callback: () => Promise<void>) => callbacks.push(callback) });
  mockModuleExports(t, require.resolve("../../src/lib/notifications"), { processUpcomingAppointmentReminders: async () => { reminderCalls++; } });
  mockModuleExports(t, require.resolve("../../src/components/admin/deferred-dashboard-charts"), { DeferredDashboardCharts: () => null });
  const count = mockPrismaMethod(t, prisma.appointment, "count", async () => 2);
  mockPrismaMethod(t, prisma.patient, "count", async () => 3);
  const releases: (() => void)[] = [];
  mockPrismaMethod(t, prisma.appointment, "groupBy", () => new Promise((resolve) => releases.push(() => resolve([]))));
  const { default: Dashboard } = await import("../../src/app/admin/page");

  const tree = await Dashboard();
  assert.equal(count.mock.callCount(), 0, "Header must be returned before section data is awaited");
  assert.equal(reminderCalls, 0);
  assert.equal(callbacks.length, 1);
  const metrics = section(tree, 1);
  let analyticsDone = false;
  const analytics = section(tree, 2).then((value) => { analyticsDone = true; return value; });
  const renderedMetrics = await metrics;
  assert(isValidElement(renderedMetrics));
  assert.equal(analyticsDone, false);
  assert.equal(releases.length, 2, "Both analytics queries start before either resolves");
  releases.forEach((release) => release());
  await analytics;
  await callbacks[0]();
  assert.equal(reminderCalls, 1);

  user = { ...user, isDemo: true };
  await Dashboard();
  assert.equal(callbacks.length, 1, "Demo navigation cannot schedule notification writes");

  user = { ...user, role: "DENTIST", isDemo: false };
  mockPrismaMethod(t, prisma.dentist, "findFirst", async () => null);
  const scopedTree = await Dashboard();
  await section(scopedTree, 1);
  const lastQueries = count.mock.calls.slice(-3).map((call) => call.arguments[0] as { where: { dentistId: unknown } });
  assert(lastQueries.every((query) => JSON.stringify(query.where.dentistId) === JSON.stringify({ in: [] })), "Unassigned dentists must not query clinic-wide appointments");
  assert.equal(callbacks.length, 1);
});
