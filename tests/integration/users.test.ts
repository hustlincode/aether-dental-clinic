import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/db";
import { rawPrisma } from "../../src/lib/raw-db";
import { integrationTenant } from "../helpers/integration-tenant";
import { withTenantContext } from "../../src/lib/tenant";
import { createUser, listUsers, resetUserPassword, updateUser, UserManagementError } from "../../src/lib/user-management";

test("Users management preserves records, revokes access, and commits account/link/audit atomically", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async t => {
  const tenant = await integrationTenant(t, "regression-users");
  await withTenantContext(tenant, async () => {
  assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
  const url = new URL(process.env.DATABASE_URL!);
  assert(url.pathname.endsWith("_test") && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const marker = randomUUID();
  const actor = await prisma.user.create({ data: { name: marker, email: `admin-${marker}@example.test`, passwordHash: "not-a-login", role: "ADMIN" } });
  const profiles = await Promise.all(["a", "b"].map(suffix => prisma.dentist.create({ data: { name: `${marker}-${suffix}`, email: `dentist-${suffix}-${marker}@example.test`, specialization: "General" } })));
  t.after(async () => withTenantContext(tenant, async () => {
    await prisma.activity.deleteMany({ where: { userId: actor.id } });
    await prisma.dentist.deleteMany({ where: { id: { in: profiles.map(profile => profile.id) } } });
    await prisma.user.deleteMany({ where: { OR: [{ id: actor.id }, { name: { startsWith: marker } }] } });
    await rawPrisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }));
  const input = (suffix: string) => ({ name: `${marker}-${suffix}`, email: `${suffix}-${marker}@example.test`, role: "DENTIST", dentistId: profiles[0].id, password: "long-staff-password" });
  const conflict = (error: unknown) => error instanceof UserManagementError && error.status === 409 || !!error && typeof error === "object" && "code" in error && error.code === "P2002";
  const staff = await createUser(input("first"), actor.id);
  assert.equal(staff.dentist?.id, profiles[0].id);
  assert.equal("passwordHash" in staff, false);
  const original = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
  assert(await bcrypt.compare("long-staff-password", original.passwordHash));
  assert.equal(original.sessionVersion, 0);
  await assert.rejects(createUser(input("claimed"), actor.id), conflict);
  assert.equal(await prisma.user.count({ where: { email: input("claimed").email } }), 0);
  await assert.rejects(createUser({ ...input("first"), email: input("first").email.toUpperCase() }, actor.id), conflict);

  const auditCount = await prisma.activity.count({ where: { userId: actor.id } });
  await assert.rejects(updateUser(staff.id, { dentistId: profiles[1].id }, "missing-audit-user"));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).sessionVersion, 0);
  assert.equal((await prisma.dentist.findUniqueOrThrow({ where: { id: profiles[0].id } })).userId, staff.id);
  assert.equal((await prisma.dentist.findUniqueOrThrow({ where: { id: profiles[1].id } })).userId, null);
  assert.equal(await prisma.activity.count({ where: { userId: actor.id } }), auditCount);

  const changed = await updateUser(staff.id, { email: `changed-${marker}@example.test` }, actor.id);
  assert.equal(changed.dentist?.id, profiles[0].id);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).sessionVersion, 0);
  await updateUser(staff.id, { active: false }, actor.id);
  await updateUser(staff.id, { active: true }, actor.id);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).sessionVersion, 1);
  await resetUserPassword(staff.id, { password: "replacement-password" }, actor.id);
  const reset = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
  assert.equal(reset.sessionVersion, 2);
  assert(await bcrypt.compare("replacement-password", reset.passwordHash));
  await updateUser(staff.id, { role: "ASSISTANT", dentistId: null }, actor.id);
  assert.equal((await prisma.dentist.findUniqueOrThrow({ where: { id: profiles[0].id } })).userId, null);
  assert.equal((await prisma.dentist.findUniqueOrThrow({ where: { id: profiles[0].id } })).status, "ACTIVE");
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).sessionVersion, 3);
  const list = await listUsers(new URLSearchParams({ search: marker, role: "ASSISTANT" }));
  assert.equal(list.users.length, 1);
  assert.equal(list.users[0].id, staff.id);
  assert.equal(JSON.stringify(await prisma.activity.findMany({ where: { userId: actor.id } })).includes("replacement-password"), false);
  await assert.rejects(updateUser(actor.id, { active: false }, actor.id), error => error instanceof UserManagementError && error.status === 403);

  const race = await Promise.allSettled(["race-a", "race-b"].map(suffix => createUser({ ...input(suffix), dentistId: profiles[1].id }, actor.id)));
  assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await prisma.user.count({ where: { name: { in: [`${marker}-race-a`, `${marker}-race-b`] } } }), 1);
  });
});
