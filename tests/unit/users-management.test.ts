import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/db";
import { mockPrismaMethod } from "../helpers/mock-prisma";
import {
  createUser, createUserSchema, isReservedDemoEmail, listDentistOptions, listUsers,
  resetUserPassword, staffPasswordSchema, updateUser, updateUserSchema, UserManagementError,
} from "../../src/lib/user-management";

const password = "long-staff-password";
const row = () => ({
  id: "staff", name: "Test Staff", email: "staff@example.test", role: "RECEPTIONIST" as "ADMIN" | "RECEPTIONIST" | "ASSISTANT" | "DENTIST",
  active: true, createdAt: new Date(), updatedAt: new Date(), dentist: null as null | { id: string; name: string; status: "ACTIVE" },
});
const errorStatus = (status: number) => (error: unknown) => error instanceof UserManagementError && error.status === status;

test("staff validation rejects privilege escalation, unknown fields and bcrypt byte truncation", () => {
  const values = { name: " Test Staff ", email: " Staff@Example.Test ", role: "ASSISTANT", password };
  assert.equal(createUserSchema.parse(values).email, "staff@example.test");
  assert.equal(createUserSchema.parse(values).name, "Test Staff");
  assert.equal(createUserSchema.safeParse({ ...values, role: "ADMIN" }).success, false);
  assert.equal(updateUserSchema.safeParse({ password }).success, false);
  assert.equal(updateUserSchema.safeParse({ sessionVersion: 0 }).success, false);
  assert.equal(updateUserSchema.safeParse({}).success, false);
  assert.equal(createUserSchema.safeParse({ ...values, role: "DENTIST" }).success, false);
  assert.equal(createUserSchema.safeParse({ ...values, dentistId: "profile" }).success, false);
  assert.equal(staffPasswordSchema.safeParse("short").success, false);
  assert.equal(staffPasswordSchema.safeParse("😀".repeat(6)).success, false);
  assert.equal(staffPasswordSchema.safeParse("x".repeat(72)).success, true);
  assert.equal(staffPasswordSchema.safeParse("x".repeat(73)).success, false);
  assert.equal(staffPasswordSchema.safeParse("😀".repeat(19)).success, false);
});

test("list returns explicit safe fields, protected flags and bounded filters", async t => {
  const previousDemo = process.env.DEMO_EMAIL;
  process.env.DEMO_EMAIL = "custom-demo@example.test";
  t.after(() => { if (previousDemo === undefined) delete process.env.DEMO_EMAIL; else process.env.DEMO_EMAIL = previousDemo; });
  assert.equal(isReservedDemoEmail(" DEMO@AETHERDENTAL.PH "), true);
  assert.equal(isReservedDemoEmail("custom-demo@example.test"), true);
  const account = { ...row(), passwordHash: "must-not-leak", sessionVersion: 8 };
  const find = mockPrismaMethod(t, prisma.user, "findMany", async (query: { select: object; where: object; skip: number; take: number }) => {
    assert.equal("passwordHash" in query.select, false);
    assert.equal("sessionVersion" in query.select, false);
    assert.deepEqual(query.where, { role: "ASSISTANT", active: false, OR: [{ name: { contains: "staff", mode: "insensitive" } }, { email: { contains: "staff", mode: "insensitive" } }] });
    assert.equal(query.skip, 10);
    assert.equal(query.take, 10);
    return [account, { ...row(), id: "admin", role: "ADMIN" }, { ...row(), id: "demo", email: "demo@aetherdental.ph" }];
  });
  mockPrismaMethod(t, prisma.user, "count", async () => 13);
  const result = await listUsers(new URLSearchParams({ search: "staff", role: "ASSISTANT", active: "false", page: "2" }));
  assert.deepEqual(result.pagination, { page: 2, pageSize: 10, total: 13, totalPages: 2 });
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  assert.equal("sessionVersion" in result.users[0], false);
  assert.deepEqual(result.users.map(user => user.isProtected), [false, true, true]);
  await assert.rejects(listUsers(new URLSearchParams({ pageSize: "51" })), errorStatus(400));
  await assert.rejects(listUsers(new URLSearchParams({ role: "OWNER" })), errorStatus(400));
  assert.equal(find.mock.callCount(), 1);
  mockPrismaMethod(t, prisma.dentist, "findMany", async (query: { where: object; select: object }) => {
    assert.deepEqual(query.where, { OR: [{ userId: null }, { userId: "staff" }] });
    assert.equal("userId" in query.select, false);
    return [];
  });
  assert.deepEqual(await listDentistOptions("staff"), []);
});

test("account writes guard missing, Admin, demo, duplicate and reserved identities", async t => {
  let account: ReturnType<typeof row> | null = row();
  mockPrismaMethod(t, prisma, "$transaction", async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
  mockPrismaMethod(t, prisma.user, "findUnique", async () => account);
  const update = mockPrismaMethod(t, prisma.user, "update", async () => { throw new Error("Unexpected write"); });
  mockPrismaMethod(t, prisma.user, "findFirst", async () => ({ id: "duplicate" }));
  account = null;
  await assert.rejects(updateUser("missing", { name: "Changed" }, "admin"), errorStatus(404));
  account = { ...row(), role: "ADMIN" };
  await assert.rejects(updateUser("staff", { active: false }, "admin"), errorStatus(403));
  await assert.rejects(resetUserPassword("staff", { password }, "admin"), errorStatus(403));
  account = { ...row(), email: "demo@aetherdental.ph" };
  await assert.rejects(updateUser("staff", { name: "Changed" }, "admin"), errorStatus(403));
  account = row();
  await assert.rejects(updateUser("staff", { email: "demo@aetherdental.ph" }, "admin"), errorStatus(422));
  await assert.rejects(updateUser("staff", { email: "duplicate@example.test" }, "admin"), errorStatus(409));
  assert.equal(update.mock.callCount(), 0);
});

test("Dentist creation links profile, hashes credentials and audits in one serializable transaction", async t => {
  const account = { ...row(), role: "DENTIST" as const, dentist: { id: "profile", name: "Dr Test", status: "ACTIVE" as const } };
  mockPrismaMethod(t, prisma, "$transaction", async (work: (tx: typeof prisma) => Promise<unknown>, options: { isolationLevel: string }) => {
    assert.equal(options.isolationLevel, "Serializable");
    return work(prisma);
  });
  mockPrismaMethod(t, prisma.user, "findFirst", async () => null);
  mockPrismaMethod(t, prisma.dentist, "findUnique", async () => ({ id: "profile", userId: null }));
  mockPrismaMethod(t, prisma.user, "create", async (query: { data: { passwordHash: string; password?: string; dentistId?: string; email: string } }) => {
    assert.equal(await bcrypt.compare(password, query.data.passwordHash), true);
    assert.equal(query.data.password, undefined);
    assert.equal(query.data.dentistId, undefined);
    assert.equal(query.data.email, "staff@example.test");
    return { id: "staff" };
  });
  const link = mockPrismaMethod(t, prisma.dentist, "update", async (query: { data: object }) => {
    assert.deepEqual(query.data, { userId: "staff" });
    return {};
  });
  const audit = mockPrismaMethod(t, prisma.activity, "create", async (query: unknown) => {
    assert.equal(JSON.stringify(query).includes(password), false);
    assert.equal(JSON.stringify(query).includes("passwordHash"), false);
    return {};
  });
  mockPrismaMethod(t, prisma.user, "findUniqueOrThrow", async () => account);
  const result = await createUser({ name: "Test Staff", email: "Staff@Example.Test", role: "DENTIST", dentistId: "profile", password }, "admin");
  assert.equal(result.dentist?.id, "profile");
  assert.equal("passwordHash" in result, false);
  assert.equal(link.mock.callCount(), 1);
  assert.equal(audit.mock.callCount(), 1);
});

test("role/link changes and deactivation revoke sessions without changing clinical booking status", async t => {
  let account = row();
  const updates: Array<Record<string, unknown>> = [];
  const links: Array<{ where: { id: string }; data: object }> = [];
  mockPrismaMethod(t, prisma, "$transaction", async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
  mockPrismaMethod(t, prisma.user, "findUnique", async () => account);
  mockPrismaMethod(t, prisma.user, "findFirst", async () => null);
  mockPrismaMethod(t, prisma.user, "update", async (query: { data: Record<string, unknown> }) => { updates.push(query.data); return { ...account, ...query.data }; });
  mockPrismaMethod(t, prisma.dentist, "findUnique", async () => ({ id: "new-profile", userId: null }));
  mockPrismaMethod(t, prisma.dentist, "update", async (query: { where: { id: string }; data: object }) => { links.push(query); return {}; });
  mockPrismaMethod(t, prisma.activity, "create", async () => ({}));
  await updateUser("staff", { name: "Changed Staff" }, "admin");
  assert.equal(updates.at(-1)?.sessionVersion, undefined);
  await updateUser("staff", { active: false }, "admin");
  assert.deepEqual(updates.at(-1)?.sessionVersion, { increment: 1 });
  account = { ...row(), active: false };
  await updateUser("staff", { active: true }, "admin");
  assert.equal(updates.at(-1)?.sessionVersion, undefined);
  account = { ...row(), role: "DENTIST", dentist: { id: "old-profile", name: "Dr Test", status: "ACTIVE" } };
  await updateUser("staff", { dentistId: "new-profile" }, "admin");
  assert.deepEqual(links, [{ where: { id: "old-profile" }, data: { userId: null } }, { where: { id: "new-profile" }, data: { userId: "staff" } }]);
  assert.deepEqual(updates.at(-1)?.sessionVersion, { increment: 1 });
  await updateUser("staff", { role: "ASSISTANT", dentistId: null }, "admin");
  assert.deepEqual(links.at(-1), { where: { id: "old-profile" }, data: { userId: null } });
  assert.deepEqual(updates.at(-1)?.sessionVersion, { increment: 1 });
  await resetUserPassword("staff", { password }, "admin");
  const reset = updates.at(-1)!;
  assert.equal(await bcrypt.compare(password, reset.passwordHash as string), true);
  assert.deepEqual(reset.sessionVersion, { increment: 1 });
});

test("unlinked legacy Dentist accounts require repair and claimed profiles cannot be stolen", async t => {
  mockPrismaMethod(t, prisma, "$transaction", async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
  mockPrismaMethod(t, prisma.user, "findUnique", async () => ({ ...row(), role: "DENTIST" }));
  mockPrismaMethod(t, prisma.dentist, "findUnique", async () => ({ id: "profile", userId: "someone-else" }));
  const update = mockPrismaMethod(t, prisma.user, "update", async () => { throw new Error("Unexpected write"); });
  await assert.rejects(updateUser("staff", { name: "Changed" }, "admin"), errorStatus(422));
  await assert.rejects(updateUser("staff", { dentistId: "profile" }, "admin"), errorStatus(409));
  assert.equal(update.mock.callCount(), 0);
});

test("an unlinked legacy Dentist can always have login access revoked without claiming a clinical profile", async t => {
  const account = { ...row(), role: "DENTIST" as const };
  mockPrismaMethod(t, prisma, "$transaction", async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
  mockPrismaMethod(t, prisma.user, "findUnique", async () => account);
  const profile = mockPrismaMethod(t, prisma.dentist, "findUnique", async () => { throw new Error("Do not require a profile to revoke access"); });
  const update = mockPrismaMethod(t, prisma.user, "update", async (args: { data: { active: boolean; sessionVersion: object } }) => {
    assert.deepEqual(args.data, { active: false, sessionVersion: { increment: 1 } });
    return { ...account, active: false };
  });
  mockPrismaMethod(t, prisma.activity, "create", async () => ({}));
  assert.equal((await updateUser("staff", { active: false }, "admin")).active, false);
  assert.equal(profile.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 1);
  await assert.rejects(updateUser("staff", { active: true }, "admin"), errorStatus(422));
});
