# Booking hardening deployment

## Database changes

`202610220000_existing_schema` is a generated baseline of the existing schema.
`202610220001_patient_contact_is_not_identity` drops only the unique index
`patients_email_key` and creates the non-unique `patients_email_idx`. No rows,
columns, appointments, or patient relationships are deleted or rewritten.
Public bookings now create separate patient records. Shared contact details do
not prove identity; staff must verify identity before reconciling records.

Review both SQL files and back up the target database before deploying. These
migrations have not been applied to the configured application database.

For an existing database, first verify that it matches the baseline exactly.
Then mark the baseline as already applied with
`npx prisma migrate resolve --applied 202610220000_existing_schema`, and run
`npx prisma migrate deploy`. Do not execute the baseline SQL on an existing
database. An empty database can run `npx prisma migrate deploy` directly.

Deploy the index change before the updated booking code. Until the index is
changed, repeat public bookings using an existing email will fail safely rather
than link an unverified patient record. Regenerate the Prisma client during
installation with `npx prisma generate`.

## Production configuration

Passwordless demo access requires explicit `DEMO_MODE=true`, including in
production. For the portfolio showcase, add it to Vercel's Production environment
variables and redeploy to display "Explore the demo dashboard". Demo sessions
remain read-only. Use only seeded showcase data: visitors can read dashboard
records. Set `DEMO_MODE=false` before storing real patient data; existing demo
sessions are then rejected.
Staff sessions refresh account activity and permissions on every session read.

Use a dedicated PostgreSQL runtime account, a strong `NEXTAUTH_SECRET`, TLS, and
configured SMTP with `EMAIL_PREVIEW_MODE=false`. Verify the deployed login page
matches the chosen demo setting. When disabled, the demo button must be absent
and direct demo-provider sign-in must not create a session.
Never point test commands at the application database.

Booking writes use serializable transactions with bounded retries across app
instances. Deploy all app instances together so old writers cannot bypass the
new scheduling checks. Reference strings now use `APT-YYYY-<UUID>`; existing
references remain intact. Consumers must treat references as opaque strings.

## Verification and remaining release gates

Executed locally on 2026-10-22: ESLint, TypeScript, production build, 14 unit/API
tests, the live PostgreSQL race/rollback suite, and seven Chromium browser tests.
The database suite uses separate real transactions and checks create-versus-create,
create-versus-reschedule, competing reschedules, identity isolation, direct patient
and appointment rollback, and idempotent status changes. Both migration files
were also applied successfully to a second empty disposable PostgreSQL database.
No application database migration was applied.

Next.js and its ESLint config were patched to 16.3.8. Compatible lockfile security
patches were applied. `npm audit` still reports 11 high advisories (zero critical):
the ESLint glob toolchain (`braces`), Prisma CLI/config (`deepmerge-ts`), and
Nodemailer plus inherited Auth.js dependency reports. There is no patched
same-major `braces` or `deepmerge-ts`; patched Nodemailer 10.0.6 falls outside
Auth.js beta.32's optional peer range (7/8). A forced peer override or major ORM
upgrade was not applied. Resolve and review these dependency upgrades before
declaring the deployment production-ready. The application uses fixed email
templates and bounds public recipient inputs, but this does not eliminate the
need to resolve the mail-library advisories.

The deployed environment, real SMTP delivery, and manual screen-reader behavior
were not verified. Demo blocking with `DEMO_MODE=false` was exercised in the
production build and browser tests; existing JWT demotion and deactivation were also verified
against the running production server. Verify the same behavior after deployment. Local Prisma
client regeneration encountered a Windows engine DLL lock; a clean CI/install
must regenerate the client before deployment.
