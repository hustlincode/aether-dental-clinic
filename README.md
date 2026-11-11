# Aether Dental — Clinic Booking & Management System

A modern, full-stack **dental clinic booking & management system** built as a portfolio project. Patients can request appointments online, while clinic staff confirm bookings and manage patients and operations through a role-based admin dashboard.

## Tech Stack

- **Next.js 16** (App Router, React 19, TypeScript, Tailwind CSS v4)
- **Prisma ORM**
- **Supabase** (managed PostgreSQL — used as the database provider)
- **NextAuth (Auth.js v5)** — JWT sessions, custom RBAC
- **Zod** — request validation
- **Nodemailer** — email notifications
- **bcryptjs** — password hashing

## Live Demo Access

The `/login` page has an **"Explore the demo dashboard"** button for visitors.
It opens a **passwordless, read-only** session: every page and report is
browsable, but every mutating API route — including notification read state —
rejects demo sessions, so the seeded clinic data stays intact.

- Disabled by default. Enable `DEMO_MODE="true"` only with an explicit
  `DEMO_TENANT_SLUG` identifying a synthetic showcase clinic.
- A dedicated demo account must exist in that clinic (`DEMO_EMAIL`, default
  `demo@aetherdental.ph`). Missing demo accounts never fall back to administrators.
- Never enable passwordless demo access on a clinic containing real patient data.
  Disabling it rejects existing demo sessions.

Staff sign in with the credentials printed by the seed (see below). No staff
password is shipped in this repository.

## Features (implemented)

### Public Booking (mobile-first) — `/book`
- Multi-step flow: **Service → Dentist → Date → Time → Details → Review → Confirm**
- Calendar only shows dates with available slots
- Dynamic slot generation honoring clinic hours, dentist schedule, lunch breaks, blocked dates, and existing appointments
- **Server-side double-booking prevention** (full scheduling checks in retryable serializable transactions)
- Request-received email followed by staff confirmation (delivery failures never roll back a booking)
- Success screen with appointment reference number

### Staff / Admin
- Secure authentication (NextAuth credentials + bcrypt)
- **Role-based access control** (Admin / Receptionist / Dentist)
- Dashboard with today's schedule, appointment analytics, and popular services (real data)
- Appointment management with status transitions (pending → confirmed → checked in → completed / cancelled / no-show)
- Activity logging (created, confirmed, cancelled, completed)

### REST API
- `GET/POST /api/services`
- `GET /api/dentists`
- `GET /api/clinic`
- `GET /api/availability/dates`, `GET /api/availability/slots` (public)
- `POST /api/appointments` (public booking), `GET /api/appointments` (authed)
- `PATCH /api/appointments/[id]/status`,
- `GET/POST /api/patients`
- Consistent `{ success, data | message }` envelope, centralized error handling, Zod validation, auth/role middleware

## Getting Started

### 1. Prerequisites
- Node.js 22+ (CI uses Node.js 22)
- PostgreSQL: a disposable loopback database ending in `_test` for seeding/tests; a separately managed database for real clinics.

### 2. Set up environment variables
Create a `.env` file based on the values below (or use the existing `.env`):

```bash
# Prisma/runtime (Supabase Transaction pooler, port 6543)
DATABASE_URL="postgresql://<user>.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Prisma CLI/migrations (Supabase Session pooler, port 5432)
DIRECT_URL="postgresql://<user>.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"

NEXTAUTH_SECRET="<generate a strong random secret>"

# Required in production; clinic URLs are <slug>.<platform-domain>.
TENANT_BASE_DOMAIN="localhost"
TRUST_PROXY_HOST="false"

# Email (optional). Leave SMTP_* blank to use preview mode (logs emails to database).
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="Aether Dental <no-reply@aetherdental.local>"
EMAIL_PREVIEW_MODE="true"

# Read-only showcase demo; enable only on deployments containing demo data.
DEMO_MODE="false"
# DEMO_TENANT_SLUG="synthetic-showcase"

# Optional: dedicated demo account (created by the seed).
# DEMO_EMAIL="demo@aetherdental.ph"

# Optional: choose staff passwords instead of the seed's generated ones.
# SEED_ADMIN_PASSWORD=""
# SEED_RECEPTIONIST_PASSWORD=""
# SEED_DENTIST_PASSWORD=""

NEXT_PUBLIC_APP_NAME="Aether Dental"
```

> **Note:** The raw direct host (`db.<ref>.supabase.co:5432`) is IPv6-only; this project uses the **Session pooler** (port 5432) for Prisma CLI/migrations and the **Transaction pooler** (port 6543) for runtime, which avoids that limitation.

### 3. Install dependencies
```bash
npm install
```

### 4. Initialize a new development database and seed
Point both database URLs at a new loopback PostgreSQL database ending in `_test`.
The destructive seed refuses hosted and application databases. Use the tenant
provisioning command below when creating real clinics.

```bash
npx prisma migrate deploy
npx prisma db seed
```
The seed prints the generated staff passwords once. Store them — no default
staff password exists in this repository.

For an existing database, follow [the baseline and deployment instructions](docs/production-hardening.md)
before running migrations. Do not seed a database containing real patient data.

### 5. Run the dev server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000):
- Book an appointment at `/book`
- Staff login at `/login` → admin dashboard at `/admin`
- Use the isolated showcase configuration above for optional demo access.

## Going Live (Security Checklist)
- [ ] Set `DEMO_MODE="false"` if the database will hold real patient data.
- [ ] Rotate any passwords from an older seeding:
      `npm run security:rotate-passwords -- <clinic-subdomain>` (prints new passwords once).
- [ ] Replace `NEXTAUTH_SECRET` with a fresh, strong random value per environment.
- [ ] Keep `.env` out of version control (already git-ignored).
- [ ] Configure real SMTP credentials; leave `EMAIL_PREVIEW_MODE="true"` to avoid
      sending real email from a demo environment.

## Scripts
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript
- `npm test` — unit and API regressions
- `npm run test:integration` — live PostgreSQL races and rollback checks (requires an isolated `TEST_DATABASE_URL`)
- `npm run test:e2e` — Chromium regressions against a production build
- `npm run perf:loading` — read-only Playwright timings for a running local production server (default port 3102, 30 repeat samples). Override `PERF_BASE_URL`, `PERF_SAMPLES`, or `PERF_OUTPUT` when needed. Results contain timings and sizes, without response bodies or database credentials.
- `npm run security:rotate-passwords` — rotate all staff passwords (pre-launch)
- `npx prisma db seed` — (re)seed demo data (prints generated staff passwords)
- `npx prisma db push` — sync schema to database

Integration tests accept only a loopback PostgreSQL database whose name ends in
`_test`, distinct from both configured application database URLs. Schema setup
refuses destructive changes; tests require an empty clinic. Browser tests create
their own temporary staff account in the isolated database and never reuse an
existing app server. See [deployment and verification notes](docs/production-hardening.md).

## Caching
Public pages, booking, login and staff pages render with request-specific tenant
context. Clinic responses use `private, no-store` so shared caches cannot mix
subdomains. Static framework assets remain cacheable. Existing mutation
invalidation is retained for already visited routes. Tenant-aware cache keys and
selective cache invalidation can be introduced after measuring the pilot.

## Database
Models: `Tenant`, `User`, `Patient`, `Dentist`, `Service`, `Appointment`, `ConfirmationEmail`, `Availability`, `BlockedDate`, `ClinicSetting`, `Notification`, `Activity`, `EmailLog`.

Appointments enforce double-booking prevention at both the application layer and within a transaction.

## Roadmap
Patients, Dentists, Services CRUD UIs, calendar (day/week/month), reports & revenue, appointment reminders, patch notes. See `plan.md` for the full product plan.

## License
Personal portfolio project.

## Clinic configuration

Administrators can use `/admin/configuration` to edit public address, phone and
email; change clinic hours and the optional lunch interval; and add or remove
single-date clinic closures. Demo administrators can view the page but cannot
save. Clinic branding, dentist schedules and service prices/durations stay in
their existing locations.

Hours take effect immediately in Manila time. Schedule changes that would
newly invalidate live appointments are rejected with affected references for
staff follow-up; no appointments are moved or cancelled automatically. Contact
and hours forms save separately, reject stale updates, and record changes in
the activity log. Public contact changes invalidate the homepage and privacy
page; privacy contact links use the current clinic email and disappear when it is cleared.

Deploy migrations before enabling the module. The clinic-closure migration
adds a partial unique index for clinic-wide dates. If duplicate dates already
exist, it stops without deleting anything; review those records before retrying.
Prisma `db push` does not create this partial index. Use the existing deployment
procedure (`prisma migrate deploy`), including the baseline instructions for
older databases in `docs/production-hardening.md`.

`npm run test:integration` exercises the existing booking suite and configuration
transactions sequentially against an explicitly isolated `TEST_DATABASE_URL`.
Configuration browser regressions run with `npm run test:e2e` against that same
disposable database and a production build. Neither command should target an
application database.

## Loading performance

Booking services and dentists load independently. Availability reads run concurrently,
and the dashboard streams metrics and analytics separately. Charts load near the
viewport. The calendar uses a lean, paginated month view and reports incomplete
loads instead of silently stopping at 500 appointments. Appointment responses still
report actual email outcomes; independent post-commit notifications run concurrently.

Measured on October 24, 2026 against local webpack production builds using the same
configured PostgreSQL database, with 30 repeat samples per endpoint:

| Request | Median before → after | p95 before → after |
| --- | --- | --- |
| Available dates | 864 → 542 ms | 937 → 619 ms |
| Available slots | 789 → 470 ms | 816 → 504 ms |
| Booking dentists | 258 → 199 ms | 299 → 210 ms |

The booking dentist response decreased from 8,788 to 551 bytes. Repeat booking visits
reached usable service selection in a median of 328 ms, previously 363 ms. These are
local measurements, not production traffic or load-test results. Unchanged reference
endpoints varied by around 15 ms between runs.

`perf:loading` visits only public routes and makes GET requests. Run the server with
the intended `DATABASE_URL`; the benchmark itself does not load database credentials.
Protected browser regressions and all write-based tests use the isolated test database.
In-app reminders remain dashboard-triggered best-effort work after the response;
durable delivery and concurrent reminder deduplication require a separate follow-up.

### Admin navigation and notifications

Successful login, demo access and logout each replace the document once. Server
pages and their admin layout share session resolution within that render; API
requests still resolve current permissions independently.

Notification state belongs to the authenticated admin layout. The badge loads once
on entry, except direct history entry uses its list response. Navigation, window
focus and idle time never poll the badge. Opening the bell explicitly refreshes its
ten-item preview, sharing any pending request. History and preview responses supply
their unread counts; marking read updates both views, rolls back failures and never
requests another count. Demo interactions send no notification PATCH requests.
Notifications created elsewhere appear on the next notification interaction.

The optional `GET /api/notifications?view=preview&pageSize=10` returns only
`{ items, unreadCount }` inside the usual success envelope. Existing paginated and
count endpoints remain compatible. Reads are private with `Cache-Control: private,
no-store` and `Server-Timing` stages for `auth` and `data`.

`vercel.json` selects Singapore (`sin1`) for the next deployment, near the configured
Supabase transaction pooler. Existing deployment rules and connection settings are
unchanged. After deployment, verify function placement and measure authenticated
cold starts separately from 30 warm requests; the warm p95 target is below one second.

Run `npm run test:e2e:demo` for the separate demo-enabled browser suite.
`npm run perf:notifications` measures a running local production server on port
3110 with demo access enabled and a synthetic demo account in an isolated test
database. It never creates fixtures or marks notifications read. Configure
`PERF_BASE_URL`, `PERF_SAMPLES` (default 30), or `PERF_OUTPUT` as needed. The output
separates browser TTFB, body download, response size and server auth/data duration;
first observed requests are reported separately and do not prove a platform cold
start. No credentials, cookies or notification bodies are saved.

Measured on October 25, 2026 against a local production build and isolated local
PostgreSQL, with 40 synthetic notifications and 30 authenticated repeat samples:

| Request | Warm median / p95 total | p95 TTFB | p95 body download |
| --- | --- | --- | --- |
| Unread count | 9.2 / 14.4 ms | 13.4 ms | 2.0 ms |
| Ten-item preview | 10.7 / 17.1 ms | 16.2 ms | 2.0 ms |
| History (20 items) | 8.4 / 20.6 ms | 20.1 ms | 1.8 ms |

The first observed count, preview and history requests took 128.4, 47.7 and
153.3 ms respectively. Login, bell opening and history navigation produced one
dashboard request, one initial count, one preview and one history request. These
measurements validate local behavior; production network, dataset size, function
placement and cold starts still require measurement after deployment.

### Multi-tenant clinic pilot

The application uses clinic subdomains with one clinic per staff account and a
shared PostgreSQL database. Managed trials and manual subscriptions are available;
self-service signup and automatic payment collection are not included. Each clinic owns its patients, schedules, services, users, audit records,
notifications and email history. Shared query filtering covers APIs and server
pages; SQL composite foreign keys reject cross-clinic record relationships.
This is application-level read isolation, not PostgreSQL row-level security.

Set `TENANT_BASE_DOMAIN` to the platform domain without a scheme or port. A clinic
with slug `aether` opens at `aether.<platform-domain>`. Configure wildcard DNS and
TLS on the hosting platform and keep authentication cookies host-only. Production
rejects the apex, unknown and suspended clinics. In development, the default is
`localhost`: `aether.localhost` identifies Aether, and direct `localhost`/`127.0.0.1`
requests resolve to Aether for existing local tooling. Never use a development
server as the public production server.

`TRUST_PROXY_HOST` defaults to false. Enable it only if the trusted ingress removes
client-supplied forwarded headers and replaces them with the verified original
host. Do not set a global `AUTH_URL`/`NEXTAUTH_URL` to a single clinic host: each
clinic signs in on its own host. Existing sessions without tenant identity are
revoked by this release. Passwordless showcase access additionally requires an
explicit `DEMO_TENANT_SLUG` and a dedicated demo account; never point it at a clinic
containing real patient data. There is no administrator-account demo fallback.

Public clinic pages are dynamic and clinic responses disable shared caches. Email
uses shared platform SMTP, clinic-specific display identity and reply-to contact.
SMTP credentials remain deployment configuration, never clinic records.

Provision a clinic with `npm run tenant:provision -- <slug> <clinic-name>
<admin-email> <admin-name>` and supply the initial administrator password through
stdin from a secure input source. Do not put passwords in command arguments or
shell history. Provisioning creates the clinic, settings and administrator in one
transaction and rejects duplicate slugs. Configure services and dentists through
the clinic administrator after onboarding. The development seed is destructive;
it is explicitly guarded and must never be used for onboarding.

Before release, inspect the actual database and migration history, take and test a
restorable backup, and rehearse all migrations on a disposable database. The new
migration preserves existing records under tenant `aether`, including historical
email logs; it replaces global identity/closure indexes with tenant-aware indexes.
Historical deployments may have had targeted SQL applied without Prisma migration
history: reconcile that state before running migration deployment. Never execute
the existing-schema baseline against an already populated database.

Use actual migrations, not `db push`: normalized-email indexes, partial closure
uniqueness and composite tenant foreign keys include SQL-only constraints. The
runtime client intentionally rejects nested writes; use separately scoped flat
writes in the same transaction. Raw clients are reserved for tenant resolution,
reviewed provisioning/migrations and guarded test fixtures.

`npm run test:integration` requires a separate loopback `TEST_DATABASE_URL` ending
in `_test`; it refuses the configured application database. It tests preservation,
SQL constraints, two-clinic isolation, scheduling races and user-management
regressions. Browser fixtures also require a disposable migrated database. Do not
run write-based tests against an application database.

Deploy tenant-aware code and migration together during a maintenance window,
with old writers stopped. After more than one clinic writes data, rolling back to
the original single-clinic code is unsafe. Verify clinic login, cookies, booking,
email identity, tenant suspension and cache behavior on the actual hosting ingress
before onboarding customers. Pushing `main` can trigger Vercel deployment; local
verification does not authorize a production push or deployment.


### Managed trials and subscriptions

New clinics receive a 30-day trial when provisioned. Administrators can view
`/admin/subscription`; all staff see trial/expiry notices. Pricing is not displayed
until the business price is agreed. No checkout, automatic charges, invoices or
payment-provider integration is included.

Apply `202611080001_managed_subscriptions` through the reviewed migration process.
It preserves the original `aether` tenant as INTERNAL with no billing expiry;
other existing pilot clinics receive a 30-day trial. Trial/paid deadlines are
absolute timestamps displayed in Philippine time. Missing or invalid subscription
metadata denies writes rather than granting unlimited access.

After expiry, staff can still sign in and read retained records. Clinical changes,
new public bookings, notification acknowledgements and reminder/email writes are
blocked with HTTP 403 and code `SUBSCRIPTION_READ_ONLY`. Public booking displays a
generic unavailable notice without exposing subscription details. Tenant.active
remains a separate suspension control: renewing does not undo suspension.

Only the platform operator can manage subscriptions using the database-backed CLI:

```bash
npm run tenant:subscription -- status north-clinic
npm run tenant:subscription -- renew north-clinic 1
npm run tenant:subscription -- expire north-clinic
```

`renew` grants 1..12 calendar months from the later of now or the current deadline,
retaining any unused trial/paid period. UTC month-end dates clamp to the last day
of the target month. Run renewal once per agreed extension: repeating the command
adds another period. Renewal and expiry are transactionally audited; they do not
collect or verify a payment. INTERNAL clinic subscriptions cannot be changed by
these commands. Staff APIs cannot modify subscription fields or invoke this CLI.

No scheduler is required to expire a term: access is checked on requests and
writes. Background reminder batches refresh tenant entitlement before starting;
email helpers recheck immediately before sending. An external delivery already
in progress at the deadline may still complete. Expiry never deletes clinic data.

Before pitching real clinics, validate the chosen domain/HTTPS, production
migration history, backup recovery and SMTP setup in staging. Run the guarded
integration suite and the subscription browser checks against disposable data.
