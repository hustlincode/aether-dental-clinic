import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

test("tenant migration preserves legacy rows and enforces clinic ownership in PostgreSQL", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async t => {
  const target = process.env.TEST_DATABASE_URL;
  assert(target && target === process.env.DATABASE_URL);
  const url = new URL(target);
  assert(["postgres:", "postgresql:"].includes(url.protocol));
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_test"));
  const client = new PrismaClient({ datasourceUrl: target });
  const schema = `tenant_migration_${randomUUID().replaceAll("-", "")}`;
  assert(/^tenant_migration_[a-f0-9]{32}$/.test(schema));
  await client.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  t.after(async () => {
    try { await client.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await client.$disconnect(); }
  });
  async function execute(sql: string) {
    const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "execute", "--stdin", "--url", target!], {
      input: `SET search_path TO "${schema}";\n${sql}`, encoding: "utf8", timeout: 60_000,
      env: { ...process.env, DATABASE_URL: target, DIRECT_URL: target },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  }
  for (const migration of ["202610220000_existing_schema", "202610220001_patient_contact_is_not_identity", "202610230000_clinic_closure_uniqueness", "202610270000_user_management"]) {
    await execute(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
  }
  await execute(`
    INSERT INTO users (id,name,email,password_hash,role,updated_at) VALUES ('owner-a','Owner','owner@example.test','preserved-hash','ADMIN',CURRENT_TIMESTAMP);
    INSERT INTO patients (id,first_name,last_name,phone,updated_at) VALUES ('patient-a','Legacy','Patient','test-phone',CURRENT_TIMESTAMP);
    INSERT INTO dentists (id,name,email,specialization,user_id,updated_at) VALUES ('dentist-a','Dentist','dentist@example.test','General','owner-a',CURRENT_TIMESTAMP);
    INSERT INTO services (id,name,duration_min,price,updated_at) VALUES ('service-a','Consultation',30,500,CURRENT_TIMESTAMP);
    INSERT INTO clinic_settings (name,opening_time,closing_time,updated_at) VALUES ('Legacy Clinic','09:00','17:00',CURRENT_TIMESTAMP);
    INSERT INTO appointments (id,reference_number,appointment_date,start_time,end_time,patient_id,dentist_id,service_id,created_by,data_privacy_consent,data_privacy_consent_signature,updated_at) VALUES ('appointment-a','LEGACY-REFERENCE','2030-01-07','09:00','09:30','patient-a','dentist-a','service-a','owner-a',true,'preserved consent',CURRENT_TIMESTAMP);
    INSERT INTO confirmation_emails (id,appointment_id,patient_id,"to",status,sent_by_id) VALUES ('confirmation-a','appointment-a','patient-a','recipient@example.test','SENT','owner-a');
    INSERT INTO availability (id,day_of_week,start_time,end_time,dentist_id,updated_at) VALUES ('availability-a','MONDAY','09:00','17:00','dentist-a',CURRENT_TIMESTAMP);
    INSERT INTO blocked_dates (id,date,reason) VALUES ('closure-a','2030-01-08','Legacy closure');
    INSERT INTO notifications (id,user_id,type,title,message,entity_type,entity_id) VALUES ('notification-a','owner-a','APPOINTMENT_CREATED','Legacy','Legacy message','appointment','appointment-a');
    INSERT INTO activities (id,action,entity,user_id,appointment_id) VALUES ('activity-a','Legacy action','Appointment','owner-a','appointment-a');
    INSERT INTO email_logs (id,"to",subject,template,status) VALUES ('email-a','recipient@example.test','Legacy subject','legacy','SENT');
  `);
  const tables = ["users", "patients", "dentists", "services", "clinic_settings", "appointments", "confirmation_emails", "availability", "blocked_dates", "notifications", "activities", "email_logs"];
  const before = new Map<string, Array<Record<string, unknown>>>();
  for (const table of tables) before.set(table, await client.$queryRawUnsafe(`SELECT * FROM "${schema}"."${table}" ORDER BY id`));
  await execute(await readFile("prisma/migrations/202611080000_multitenancy/migration.sql", "utf8"));
  for (const table of tables) {
    const after = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "${schema}"."${table}" ORDER BY id /* after tenant backfill */`);
    assert.deepEqual(after, before.get(table)!.map(row => ({ ...row, tenant_id: "aether" })), table);
  }
  await execute(`
    INSERT INTO tenants (id,slug,name,updated_at) VALUES ('second','second','Second Clinic',CURRENT_TIMESTAMP);
    INSERT INTO users (id,tenant_id,name,email,password_hash,role,updated_at) VALUES ('owner-b','second','Second Owner','owner@example.test','second-hash','ADMIN',CURRENT_TIMESTAMP);
    INSERT INTO services (id,tenant_id,name,duration_min,price,updated_at) VALUES ('service-b','second','Consultation',30,500,CURRENT_TIMESTAMP);
    INSERT INTO blocked_dates (id,tenant_id,date) VALUES ('closure-b','second','2030-01-08');
  `);
  await assert.rejects(client.$executeRawUnsafe(`INSERT INTO "${schema}".users (id,tenant_id,name,email,password_hash,updated_at) VALUES ('duplicate','second','Duplicate',' OWNER@example.test ','hash',CURRENT_TIMESTAMP)`));
  await assert.rejects(client.$executeRawUnsafe(`INSERT INTO "${schema}".blocked_dates (id,tenant_id,date) VALUES ('duplicate-closure','second','2030-01-08')`));
  await assert.rejects(client.$executeRawUnsafe(`INSERT INTO "${schema}".patients (id,first_name,last_name,phone,updated_at) VALUES ('missing-owner','No','Owner','none',CURRENT_TIMESTAMP)`));
  await assert.rejects(client.$executeRawUnsafe(`UPDATE "${schema}".appointments SET service_id='service-b' WHERE id='appointment-a'`));
  await assert.rejects(client.$executeRawUnsafe(`UPDATE "${schema}".dentists SET user_id='owner-b' WHERE id='dentist-a'`));
  await assert.rejects(client.$executeRawUnsafe(`UPDATE "${schema}".notifications SET user_id='owner-b' WHERE id='notification-a'`));
  await assert.rejects(client.$executeRawUnsafe(`UPDATE "${schema}".activities SET user_id='owner-b' WHERE id='activity-a'`));
  await assert.rejects(client.$executeRawUnsafe(`UPDATE "${schema}".confirmation_emails SET sent_by_id='owner-b' WHERE id='confirmation-a'`));
  await assert.rejects(client.$executeRawUnsafe(`UPDATE "${schema}".appointments SET confirmation_email_sent_by_id='owner-b' WHERE id='appointment-a'`));
});
