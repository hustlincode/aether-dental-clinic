-- Run only after validating the target migration history and taking a restorable backup.
-- Transactional backfill: no data, IDs, passwords, or consent evidence are deleted.
BEGIN;

-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "patients_last_name_first_name_idx";

-- DropIndex
DROP INDEX "patients_status_idx";

-- DropIndex
DROP INDEX "patients_email_idx";

-- DropIndex
DROP INDEX "dentists_email_key";

-- DropIndex
DROP INDEX "dentists_status_idx";

-- DropIndex
DROP INDEX "services_name_key";

-- DropIndex
DROP INDEX "appointments_appointment_date_idx";

-- DropIndex
DROP INDEX "appointments_dentist_id_appointment_date_idx";

-- DropIndex
DROP INDEX "appointments_patient_id_idx";

-- DropIndex
DROP INDEX "appointments_status_idx";

-- DropIndex
DROP INDEX "appointments_service_id_idx";

-- DropIndex
DROP INDEX "confirmation_emails_appointment_id_created_at_idx";

-- DropIndex
DROP INDEX "confirmation_emails_patient_id_idx";

-- DropIndex
DROP INDEX "availability_dentist_id_day_of_week_key";

-- DropIndex
DROP INDEX "blocked_dates_date_idx";

-- DropIndex
DROP INDEX "blocked_dates_date_dentist_id_key";

-- DropIndex
DROP INDEX "notifications_user_id_is_read_idx";

-- DropIndex
DROP INDEX "notifications_user_id_created_at_idx";

-- DropIndex
DROP INDEX "activities_created_at_idx";

-- DropIndex
DROP INDEX "activities_entity_entity_id_idx";

-- DropIndex
DROP INDEX "email_logs_created_at_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "dentists" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "confirmation_emails" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "availability" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "blocked_dates" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "clinic_settings" ADD COLUMN     "tenant_id" TEXT,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "tenant_id" TEXT;

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- All pre-SaaS data belongs to the original clinic, including legacy email logs.
INSERT INTO "tenants" ("id", "slug", "name", "updated_at")
VALUES ('aether', 'aether', 'Aether Dental', CURRENT_TIMESTAMP);
UPDATE "users" SET "tenant_id" = 'aether';
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;
UPDATE "patients" SET "tenant_id" = 'aether';
ALTER TABLE "patients" ALTER COLUMN "tenant_id" SET NOT NULL;
UPDATE "dentists" SET "tenant_id" = 'aether';
ALTER TABLE "dentists" ALTER COLUMN "tenant_id" SET NOT NULL;
UPDATE "services" SET "tenant_id" = 'aether';
ALTER TABLE "services" ALTER COLUMN "tenant_id" SET NOT NULL;
UPDATE "appointments" SET "tenant_id" = 'aether';
ALTER TABLE "appointments" ALTER COLUMN "tenant_id" SET NOT NULL;
UPDATE "confirmation_emails" SET "tenant_id" = 'aether';
ALTER TABLE "confirmation_emails" ALTER COLUMN "tenant_id" SET NOT NULL;
UPDATE "availability" SET "tenant_id" = 'aether';
ALTER TABLE "availability" ALTER COLUMN "tenant_id" SET NOT NULL;
UPDATE "blocked_dates" SET "tenant_id" = 'aether';
ALTER TABLE "blocked_dates" ALTER COLUMN "tenant_id" SET NOT NULL;
UPDATE "clinic_settings" SET "tenant_id" = 'aether';
ALTER TABLE "clinic_settings" ALTER COLUMN "tenant_id" SET NOT NULL;
UPDATE "notifications" SET "tenant_id" = 'aether';
ALTER TABLE "notifications" ALTER COLUMN "tenant_id" SET NOT NULL;
UPDATE "activities" SET "tenant_id" = 'aether';
ALTER TABLE "activities" ALTER COLUMN "tenant_id" SET NOT NULL;
UPDATE "email_logs" SET "tenant_id" = 'aether';
ALTER TABLE "email_logs" ALTER COLUMN "tenant_id" SET NOT NULL;


-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_id_key" ON "users"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "patients_tenant_id_last_name_first_name_idx" ON "patients"("tenant_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "patients_tenant_id_status_idx" ON "patients"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "patients_tenant_id_email_idx" ON "patients"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "patients_tenant_id_id_key" ON "patients"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "dentists_tenant_id_status_idx" ON "dentists"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dentists_tenant_id_id_key" ON "dentists"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "dentists_tenant_id_email_key" ON "dentists"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "services_tenant_id_id_key" ON "services"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "services_tenant_id_name_key" ON "services"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_appointment_date_idx" ON "appointments"("tenant_id", "appointment_date");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_dentist_id_appointment_date_idx" ON "appointments"("tenant_id", "dentist_id", "appointment_date");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_patient_id_idx" ON "appointments"("tenant_id", "patient_id");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_status_idx" ON "appointments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_service_id_idx" ON "appointments"("tenant_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_tenant_id_id_key" ON "appointments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "confirmation_emails_tenant_id_appointment_id_created_at_idx" ON "confirmation_emails"("tenant_id", "appointment_id", "created_at");

-- CreateIndex
CREATE INDEX "confirmation_emails_tenant_id_patient_id_idx" ON "confirmation_emails"("tenant_id", "patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "confirmation_emails_tenant_id_id_key" ON "confirmation_emails"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "availability_tenant_id_dentist_id_day_of_week_key" ON "availability"("tenant_id", "dentist_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "availability_tenant_id_id_key" ON "availability"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "blocked_dates_tenant_id_date_idx" ON "blocked_dates"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_dates_tenant_id_date_dentist_id_key" ON "blocked_dates"("tenant_id", "date", "dentist_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_dates_tenant_id_id_key" ON "blocked_dates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_settings_tenant_id_id_key" ON "clinic_settings"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_settings_tenant_id_key" ON "clinic_settings"("tenant_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_is_read_idx" ON "notifications"("tenant_id", "user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_created_at_idx" ON "notifications"("tenant_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_id_key" ON "notifications"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "activities_tenant_id_created_at_idx" ON "activities"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "activities_tenant_id_entity_entity_id_idx" ON "activities"("tenant_id", "entity", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "activities_tenant_id_id_key" ON "activities"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "email_logs_tenant_id_created_at_idx" ON "email_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_tenant_id_id_key" ON "email_logs"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "dentists" ADD CONSTRAINT "dentists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "confirmation_emails" ADD CONSTRAINT "confirmation_emails_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "availability" ADD CONSTRAINT "availability_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "clinic_settings" ADD CONSTRAINT "clinic_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- These indexes are SQL-only; Prisma db push does not preserve them.
DROP INDEX IF EXISTS "users_email_normalized_key";
CREATE UNIQUE INDEX "users_tenant_email_normalized_key" ON "users" ("tenant_id", lower(btrim("email")));
CREATE UNIQUE INDEX "dentists_tenant_email_normalized_key" ON "dentists" ("tenant_id", lower(btrim("email")));
DROP INDEX IF EXISTS "blocked_dates_clinic_date_key";
CREATE UNIQUE INDEX "blocked_dates_tenant_clinic_date_key" ON "blocked_dates" ("tenant_id", "date") WHERE "dentist_id" IS NULL;

-- Application filtering protects reads; these SQL-only composite FKs independently
-- prevent cross-clinic relation writes, including nested Prisma connect operations.
-- Keep the existing single-column FKs and their nullable-reference behavior.
ALTER TABLE "dentists" ADD CONSTRAINT "dentists_tenant_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_dentist_id_fkey" FOREIGN KEY ("tenant_id", "dentist_id") REFERENCES "dentists" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_created_by_fkey" FOREIGN KEY ("tenant_id", "created_by") REFERENCES "users" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_confirmation_email_sent_by_id_fkey" FOREIGN KEY ("tenant_id", "confirmation_email_sent_by_id") REFERENCES "users" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "confirmation_emails" ADD CONSTRAINT "confirmation_emails_tenant_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "confirmation_emails" ADD CONSTRAINT "confirmation_emails_tenant_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "confirmation_emails" ADD CONSTRAINT "confirmation_emails_tenant_sent_by_id_fkey" FOREIGN KEY ("tenant_id", "sent_by_id") REFERENCES "users" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "availability" ADD CONSTRAINT "availability_tenant_dentist_id_fkey" FOREIGN KEY ("tenant_id", "dentist_id") REFERENCES "dentists" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_tenant_dentist_id_fkey" FOREIGN KEY ("tenant_id", "dentist_id") REFERENCES "dentists" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments" ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
