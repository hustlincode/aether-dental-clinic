import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { rawPrisma as prisma } from "../../src/lib/raw-db";

test("shipped User Management migration preserves legacy data and refuses ambiguous emails", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async t => {
  const target = process.env.TEST_DATABASE_URL;
  assert(target && process.env.DATABASE_URL === target);
  const url = new URL(target);
  assert(["postgres:", "postgresql:"].includes(url.protocol));
  assert(url.pathname.endsWith("_test") && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const migration = await readFile("prisma/migrations/202610270000_user_management/migration.sql", "utf8");
  const schemas: string[] = [];
  const files: string[] = [];
  t.after(async () => {
    try {
      for (const schema of schemas) await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await Promise.all(files.map(file => unlink(file)));
      await prisma.$disconnect();
    }
  });
  async function legacySchema() {
    const schema = `um_migration_${randomUUID().replaceAll("-", "")}`;
    assert(/^um_migration_[a-f0-9]{32}$/.test(schema));
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    schemas.push(schema);
    for (const statement of [
      `CREATE TYPE "${schema}"."Role" AS ENUM ('ADMIN', 'RECEPTIONIST', 'DENTIST')`,
      `CREATE TABLE "${schema}"."users" (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, role "${schema}"."Role" NOT NULL, password_hash TEXT NOT NULL DEFAULT 'preserved-hash', active BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMP NOT NULL DEFAULT '2020-01-01')`,
      `CREATE TABLE "${schema}"."dentists" (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'INACTIVE')`,
      `CREATE TABLE "${schema}"."history" (id TEXT PRIMARY KEY, user_id TEXT REFERENCES "${schema}"."users"(id), dentist_id TEXT REFERENCES "${schema}"."dentists"(id), notes TEXT NOT NULL)`,
    ]) await prisma.$executeRawUnsafe(statement);
    return schema;
  }
  async function executeMigration(schema: string) {
    const file = join(tmpdir(), `aether-user-migration-${randomUUID()}.sql`);
    await writeFile(file, `SET search_path TO "${schema}";\n${migration}`, { flag: "wx" });
    files.push(file);
    const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "execute", "--file", file, "--url", target!], {
      encoding: "utf8", timeout: 30_000, env: { ...process.env, DATABASE_URL: target, DIRECT_URL: target },
    });
    if (result.error) throw result.error;
    return result;
  }
  const schema = await legacySchema();
  const users = [
    ["match", "Matched Dentist", " Match@Example.Test ", "DENTIST"],
    ["seed", "Dr. Maria Santos", "dentist.mariasantos@aetherdental.ph", "DENTIST"],
    ["ambiguous", "Ambiguous Dentist", "ambiguous@example.test", "DENTIST"],
    ["unmatched", "Unmatched Dentist", "unmatched@example.test", "DENTIST"],
    ["false-seed", "Different Name", "dentist.juancruz@aetherdental.ph", "DENTIST"],
    ["wrong-role", "Front Desk", "frontdesk@example.test", "RECEPTIONIST"],
  ];
  for (const row of users) await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."users" (id,name,email,role) VALUES ($1,$2,$3,$4::"${schema}"."Role")`, ...row);
  for (const row of [
    ["match-profile", "Matched Dentist", "MATCH@example.test"], ["seed-profile", "Dr. Maria Santos", "maria@aetherdental.ph"],
    ["ambiguous-a", "First", "AMBIGUOUS@example.test"], ["ambiguous-b", "Second", " ambiguous@example.test "],
    ["false-seed-profile", "Dr. Juan Cruz", "juan@aetherdental.ph"], ["wrong-role-profile", "Front Desk", "frontdesk@example.test"],
  ]) await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."dentists" (id,name,email) VALUES ($1,$2,$3)`, ...row);
  await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."history" VALUES ('historical', 'match', 'match-profile', 'preserved history')`);
  const before = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "${schema}"."users" ORDER BY id`);
  assert.equal((await executeMigration(schema)).status, 0, "Actual migration script must succeed in the owned legacy schema.");
  const after = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT id,name,email,role,password_hash,active,created_at,session_version FROM "${schema}"."users" ORDER BY id`);
  assert.deepEqual(after, before.map(row => ({ ...row, email: String(row.email).trim().toLowerCase(), session_version: 0 })));
  const profiles = await prisma.$queryRawUnsafe<Array<{ id: string; user_id: string | null; status: string }>>(`SELECT id,user_id,status FROM "${schema}"."dentists" ORDER BY id`);
  assert.deepEqual(profiles.map(row => [row.id, row.user_id]), [
    ["ambiguous-a", null], ["ambiguous-b", null], ["false-seed-profile", null], ["match-profile", "match"], ["seed-profile", "seed"], ["wrong-role-profile", null],
  ]);
  assert(profiles.every(row => row.status === "INACTIVE"));
  assert.deepEqual(await prisma.$queryRawUnsafe(`SELECT * FROM "${schema}"."history"`), [{ id: "historical", user_id: "match", dentist_id: "match-profile", notes: "preserved history" }]);
  await assert.rejects(prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."users" (id,name,email,role) VALUES ('collision','Collision',' MATCH@example.test ','DENTIST')`));
  await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."users" (id,name,email,role) VALUES ('assistant','Assistant','assistant@example.test','ASSISTANT')`);

  const duplicates = await legacySchema();
  await prisma.$executeRawUnsafe(`INSERT INTO "${duplicates}"."users" (id,name,email,role) VALUES ('a','First','Same@example.test','DENTIST'),('b','Second',' same@example.test ','DENTIST')`);
  const original = await prisma.$queryRawUnsafe(`SELECT * FROM "${duplicates}"."users" ORDER BY id`);
  const failed = await executeMigration(duplicates);
  assert.notEqual(failed.status, 0);
  assert.match(`${failed.stdout}${failed.stderr}`, /User emails collide after normalization/);
  assert.deepEqual(await prisma.$queryRawUnsafe(`SELECT * FROM "${duplicates}"."users" ORDER BY id`), original);
  const added = await prisma.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_schema = ${duplicates} AND column_name IN ('session_version', 'user_id') AND table_name IN ('users', 'dentists')`;
  assert.deepEqual(added, []);
});
