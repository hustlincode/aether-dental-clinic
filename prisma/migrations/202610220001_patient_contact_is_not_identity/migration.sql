-- DropIndex
DROP INDEX "patients_email_key";

-- CreateIndex
CREATE INDEX "patients_email_idx" ON "patients"("email");
