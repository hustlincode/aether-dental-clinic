# Aether Dental — Clinic Booking & Management System

A modern, full-stack **dental clinic booking & management system** built as a portfolio project. Patients can book appointments online with instant confirmation, while clinic staff manage appointments, patients, and operations through a role-based admin dashboard.

## Tech Stack

- **Next.js 16** (App Router, React 19, TypeScript, Tailwind CSS v4)
- **Prisma ORM**
- **Supabase** (managed PostgreSQL — used as the database provider)
- **NextAuth (Auth.js v5)** — JWT sessions, custom RBAC
- **Zod** — request validation
- **Nodemailer** — email notifications
- **bcryptjs** — password hashing

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@aetherdental.ph` | `admin123` |
| Receptionist | `reception@aetherdental.ph` | `reception123` |
| Dentist | see seeded dentist accounts | `dentist123` |

## Features (implemented)

### Public Booking (mobile-first) — `/book`
- Multi-step flow: **Service → Dentist → Date → Time → Details → Review → Confirm**
- Calendar only shows dates with available slots
- Dynamic slot generation honoring clinic hours, dentist schedule, lunch breaks, blocked dates, and existing appointments
- **Server-side double-booking prevention** (+ transactional re-check)
- Instant email confirmation (decoupled from booking — failures logged, never roll back)
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
- Node.js 18+
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

NEXT_PUBLIC_APP_NAME="Aether Dental"
```

> **Note:** The raw direct host (`db.<ref>.supabase.co:5432`) is IPv6-only; this project uses the **Session pooler** (port 5432) for Prisma CLI/migrations and the **Transaction pooler** (port 6543) for runtime, which avoids that limitation.

### 3. Install dependencies
```bash
npm install
```

### 4. Push the schema and seed
```bash
npx prisma db push
npx prisma db seed
```

### 5. Run the dev server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000):
- Book an appointment at `/book`
- Staff login at `/login` → admin dashboard at `/admin`

## Scripts
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — ESLint
- `npx prisma db seed` — (re)seed demo data
- `npx prisma db push` — sync schema to database

## Database
Models: `User`, `Patient`, `Dentist`, `Service`, `Appointment`, `Availability`, `BlockedDate`, `ClinicSetting`, `Activity`, `EmailLog`.

Appointments enforce double-booking prevention at both the application layer and within a transaction.

## Roadmap
Patients, Dentists, Services CRUD UIs, calendar (day/week/month), reports & revenue, appointment reminders, patch notes. See `plan.md` for the full product plan.

## License
Personal portfolio project.
