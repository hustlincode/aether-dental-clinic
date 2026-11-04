# User Management recovery checkpoint

Approved: 2026-10-27. User explicitly requested implementation of the agreed plan.

## Requirements

- Admin-only Users module; Admin and demo accounts are read-only.
- Manage Front-desk (`RECEPTIONIST`), Assistant, and Dentist logins; no deletion.
- Existing Dentist profiles and scheduling remain separate. Dentist logins link to existing profiles by a unique stable relation.
- Assistants read clinic records, edit appointment notes, check in confirmed appointments, and complete checked-in appointments. No other clinic mutations; personal notification acknowledgements remain allowed.
- Admin sets/resets passwords (12 characters minimum, 72 UTF-8 bytes maximum). Revoke sessions on password reset, deactivation, role changes, and Dentist relinking.
- Preserve public anonymous booking, reject Assistant/demo booking writes, and preserve existing Dentist permissions.
- REA static source analysis succeeded through installed CLI during planning. Keep Codex configuration unchanged. JEV is decision support only; do not export repository security details.
- Recovery happens when Codex reopens; no unattended worker or extra dependency.

## Recovery procedure

Read this file and inspect the current diff before continuing. Verify incomplete or uncertain operations against source and actual checks. A checkpoint records authorization; it never expands it. Do not expose credentials, patient information, or secret values here.

## Phases and ownership

1. **Identity/schema — implemented:** Prisma schema and additive migration, conservative legacy Dentist backfill, auth/JWT session versions, seed links, password-rotation revocation, Dentist ownership and notification consumers.
2. **Users backend/UI — implemented:** Admin API routes, strict validation, safe projections, atomic audit/link writes; Users screen, navigation, forms and filters using existing components.
3. **Assistant permissions — implemented:** Shared status permission checks, server mutation boundaries, list/calendar actions and notes-only payload.
4. **QA — completed:** Unit, integration and focused browser coverage; lint and typecheck; independent review.

Root owns integration, checkpoint updates, appointment server permissions, and final verification. Parallel agents receive disjoint file ownership.

## Checks and remaining work

- Initial working tree: clean.
- Final full unit suite: 83 passed (`node --import tsx --test --test-concurrency=1 tests/unit/*.test.ts`).
- Whole-project lint and typecheck passed. Independent read-only review found no remaining concrete authorization/transaction/session defects.
- Live integration runner passed all four suites (eight tests including subtests): actual migration/backfill and duplicate-preflight rollback, booking concurrency/identity/audit rollback, clinic configuration, and Users transactions/link races/session changes.
- No PostgreSQL/Docker installation or configured test database existed initially. A temporary PostgreSQL 18.4 binary package was downloaded to ignored `build/user-management-postgres/`; its cluster listened only on `127.0.0.1:54879`, with database `aether_user_management_test`. No package manifest, lockfile, permanent service, or application database was changed.
- Full production build passed against that disposable database, including compilation, TypeScript, and prerendering all 26 static pages. Network access was used for the project's existing Google Fonts.
- Generated Chromium smoke passed for actual Users UI create/edit/link/reset/deactivate/filter, protected Admin/demo rows, Unicode validation, list error/retry, keyboard focus/Escape, mobile layout, and Assistant notes-only/list/calendar controls. This used mocked API responses, not a live database. Reproduce with `node build/users-smoke/run.mjs` while the ignored generated harness exists; screenshot: `build/users-smoke/users-mobile.png`.
- All four database-backed Chromium tests passed in `tests/e2e/users.spec.ts`: staff create/edit/link/reset/deactivate/filter/mobile flow; protected Admin rows and non-admin page/API denial; real reset/new-password login and saved-token replay after reactivation; Assistant notes-only actions with no scheduling requests.
- Prisma schema validation passed. Prisma generation updated the generated schema/types, but copying the unchanged engine DLL reported EPERM because an existing workspace Node process holds it. No user process was stopped. Installed/generated client versions are both 6.19.3, and generated/installed engine SHA-256 hashes are identical.
- Legacy unlinked Dentist accounts can be deactivated immediately; activation or identity editing still requires a valid profile link.
- Known migration consideration: seeded Dentist account emails differ from clinical profile emails. Link only unambiguous email or verified seed matches; expose unmatched accounts for manual admin repair.
- Initial implementation did not authorize production deployment or application-database migration. The later explicit migration authorization and execution are recorded below.
- Temporary PostgreSQL server was stopped after verification; generated test artifacts remain only under ignored `build/`.

## Reproducing checks and deployment boundary

Set an isolated loopback PostgreSQL `TEST_DATABASE_URL` whose database name ends in `_test`, distinct from both application database URLs. Run `npm run test:integration`, then build with both database URLs pointing at that disposable database and run `npm run test:e2e -- tests/e2e/users.spec.ts`. Review and apply the included migration in the intended deployment process before running updated application code; restart the application after migration. Migration conflicts deliberately abort without deleting or merging user records. The broader browser suite and deployment were not run.

## Local authentication recovery (2026-10-27)

- User reported `/api/auth/error?error=Configuration` on localhost:3000.
- Fresh login diagnostic confirmed the existing development server ran as `CodexSandboxOffline` and could not reach the configured hosted database. Stopped only the verified workspace Next processes, regenerated Prisma successfully, and restarted the same webpack development server as a hidden network-capable process on port 3000.
- Fresh login now reaches the database and reports `P2022` for missing `users.session_version`; the home page also reports missing `dentists.user_id`.
- Read-only schema inspection confirmed both columns and the ASSISTANT role are absent. There is no Prisma migration-history table. Canonical email collision preflight returned zero groups.
- Before the subsequent authorization, application database schema and passwords were unchanged. Only the exact prepared User Management migration was proposed; do not run every historical migration against this existing unbaselined database.

## Authorized hosted migration (2026-10-27)

- User explicitly instructed: "migrate it now" after discussing the effect on a shared deployed database. This authorizes the exact prepared migration and supersedes the earlier migration hold; it does not authorize application deployment or unrelated migrations.
- Rechecked missing columns, original roles, and zero normalized-email collision groups before execution.
- Applied only `202610270000_user_management/migration.sql` using Prisma `db execute` against the same configured database that was inspected. The script completed successfully.
- Verified both new columns, the ASSISTANT enum value, and a successful auth schema query. Counts remained unchanged: 7 users, 4 Dentist profiles, 30 patients, 217 appointments. An in-memory comparison of database aggregate password fingerprints confirmed all stored password hashes remained unchanged; no hashes or fingerprints were printed or saved.
- Three of five Dentist accounts were safely linked; two remain unlinked and need explicit admin repair in Users. No Assistant accounts were created.
- Verified local `/login` and `/` return 200. A deliberately invalid test login now returns normal `CredentialsSignin` rather than `Configuration`; the reported configuration failure is resolved. Actual admin credentials were not requested or tested.
- No application deployment was performed. The existing database still has no Prisma migration-history table; this was a targeted SQL execution, not a historical migration deployment or baseline operation.

## Local font recovery (2026-10-27)

- User reported broken fonts after the current changes. Font source configuration and global CSS had no diff.
- Chromium inspection confirmed compiled development CSS selected only `Geist Fallback` and `Fraunces Fallback`, with no font-file requests. Next's installed Google-font loader emits this CSS after failed development font downloads; the old offline server's output had remained cached.
- Stopped only the verified workspace dev server, moved `.next/dev` into an ignored `build/font-dev-cache-*` backup, and restarted the same hidden webpack dev server on port 3000 with network access. No source font definitions or database records were changed.
- Chromium verification passed on `/login` and `/`: actual Geist, Geist Mono, and Fraunces faces loaded; local WOFF2 responses returned 200. Recovered screenshot: `build/font-recovered-login.png`.
- Existing browser tabs may need a hard refresh to discard old styles. Deployed site rendering was not checked or changed.

## Commit preparation (2026-11-04)

- Inspected all 48 staged files for the requested per-file commits; no implementation changes were made during preparation.
- Fresh verification passed: all 83 unit tests (`node --import tsx --test --test-concurrency=1 tests/unit/*.test.ts`), whole-project lint (`npm.cmd run lint`), typecheck (`npm.cmd run typecheck`), and staged whitespace checks (`git diff --cached --check`).
- Database integration, browser tests, and production build were not rerun during commit preparation; earlier results above are historical. No database changes, deployment, or push were performed.

## Dashboard E2E fixture repair (2026-11-04)

- Reproduced both reported chart failures locally: the desktop/light and mobile/dark cases could not find the Completed legend button because their Dentist account had no linked clinical profile. Matching emails no longer establish dashboard ownership.
- Added `userId: staffId` to the existing chart test's Dentist fixture. Application authorization and chart code remain unchanged.
- Both focused chart cases passed after the change. The full `npm.cmd run test:e2e` then completed successfully: 48 passed, one demo-mode case skipped, zero failures (1.3 minutes). Verification used the existing production build and disposable loopback PostgreSQL test database; no application database was used.
- Typecheck, ESLint for the changed test, and Git whitespace checks passed. Sandboxed Windows browser runs stalled during web-server teardown after reporting individual results; the full run outside the sandbox exited successfully.
- Production build, database integration suite, demo-specific browser suite, and GitHub-hosted CI were not rerun for this fixture-only change. No deployment or push was performed.
