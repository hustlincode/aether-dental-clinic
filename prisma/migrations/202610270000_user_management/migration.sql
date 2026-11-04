BEGIN;

-- Refuse ambiguous canonical emails before changing existing identities.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users" GROUP BY lower(btrim("email")) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'User emails collide after normalization. Resolve duplicates before applying User Management.';
  END IF;
END $$;

ALTER TYPE "Role" ADD VALUE 'ASSISTANT';
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
UPDATE "users" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users" (lower(btrim("email")));

ALTER TABLE "dentists" ADD COLUMN "user_id" TEXT;
CREATE UNIQUE INDEX "dentists_user_id_key" ON "dentists"("user_id");
ALTER TABLE "dentists" ADD CONSTRAINT "dentists_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Only known seed identities qualify for the legacy generated-email fallback.
WITH seed_identities("name", "profile_email", "login_email") AS (
  VALUES
    ('Dr. Maria Santos', 'maria@aetherdental.ph', 'dentist.mariasantos@aetherdental.ph'),
    ('Dr. Juan Cruz', 'juan@aetherdental.ph', 'dentist.juancruz@aetherdental.ph'),
    ('Dr. Elena Reyes', 'elena@aetherdental.ph', 'dentist.elenareyes@aetherdental.ph'),
    ('Dr. Paolo Dimagiba', 'paolo@aetherdental.ph', 'dentist.paolodimagiba@aetherdental.ph')
), candidates AS (
  SELECT d."id" AS dentist_id, u."id" AS user_id
  FROM "dentists" d JOIN "users" u ON u."email" = lower(btrim(d."email"))
  WHERE u."role" = 'DENTIST'
  UNION
  SELECT d."id", u."id"
  FROM seed_identities s
  JOIN "dentists" d ON d."name" = s."name" AND lower(btrim(d."email")) = s."profile_email"
  JOIN "users" u ON u."name" = s."name" AND u."email" = s."login_email" AND u."role" = 'DENTIST'
), counted AS (
  SELECT *, count(*) OVER (PARTITION BY dentist_id) AS dentist_matches,
    count(*) OVER (PARTITION BY user_id) AS user_matches
  FROM candidates
)
UPDATE "dentists" d SET "user_id" = c.user_id FROM counted c
WHERE d."id" = c.dentist_id AND c.dentist_matches = 1 AND c.user_matches = 1;

DO $$
DECLARE unresolved INTEGER;
BEGIN
  SELECT count(*) INTO unresolved FROM "users" u
  WHERE u."role" = 'DENTIST' AND NOT EXISTS (
    SELECT 1 FROM "dentists" d WHERE d."user_id" = u."id"
  );
  RAISE NOTICE 'User Management: % Dentist account(s) remain unlinked; repair them in Users.', unresolved;
END $$;

COMMIT;
