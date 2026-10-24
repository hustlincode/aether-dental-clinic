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

- Disabled by default. Set `DEMO_MODE="true"` to enable the button and provider,
  including in production. Disabling it also rejects existing demo sessions.
- The demo session is backed by the dedicated `demo@aetherdental.ph` account
  created by the seed (override with `DEMO_EMAIL`). On older databases without
  that account it falls back to the seeded admin, still read-only.
- **Before this deployment ever holds real patient data, set
  `DEMO_MODE="false"`.**

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
- A Supabase project (free tier)

### 2. Set up environment variables
Create a `.env` file based on the values below (or use the existing `.env`):

```bash
# Prisma/runtime (Supabase Transaction pooler, port 6543)
DATABASE_URL="postgresql://<user>.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Prisma CLI/migrations (Supabase Session pooler, port 5432)
DIRECT_URL="postgresql://<user>.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"

NEXTAUTH_SECRET="<generate a strong random secret>"

# Email (optional). Leave SMTP_* blank to use preview mode (logs emails to database).
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="Aether Dental <no-reply@aetherdental.local>"
EMAIL_PREVIEW_MODE="true"

# Read-only showcase demo; enable only on deployments containing demo data.
DEMO_MODE="false"

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
- Enable `DEMO_MODE="true"` for read-only dashboard access, including production

## Going Live (Security Checklist)
- [ ] Set `DEMO_MODE="false"` if the database will hold real patient data.
- [ ] Rotate any passwords from an older seeding:
      `npm run security:rotate-passwords` (prints new passwords once).
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
The public homepage (`/`) is an Incremental Static Regeneration route
(`export const revalidate = 300`). It is prerendered at build time and served
from the Full Route Cache, so a client-side navigation to it does not re-query
the database on every visit.

Two consequences to be aware of:

- **`npm run build` needs `DATABASE_URL` to be reachable.** The homepage is
  prerendered during the build, so the build fails if the database is not
  reachable from the build machine. Previously only runtime needed the database.
- **Content changes are picked up immediately, not after 5 minutes.** Every API
  route that mutates homepage-visible data (services, dentists, patients,
  appointments) calls `revalidateHomepage()` from `src/lib/home-cache.ts`,
  which invalidates the cached page. The 5-minute window is only a safety net
  for changes made outside the app.

`/login` remains dynamic and `/book` static. `/privacy-policy` uses the same
5-minute revalidation and is invalidated after clinic configuration saves.

## Database
Models: `User`, `Patient`, `Dentist`, `Service`, `Appointment`, `Availability`, `BlockedDate`, `ClinicSetting`, `Activity`, `EmailLog`.

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
page; the dedicated privacy email remains independent.

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
