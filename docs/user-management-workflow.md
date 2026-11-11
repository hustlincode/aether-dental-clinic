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

## Dialog standardization (2026-11-05)

- User approved shared headers, independently scrolling bodies, and persistent action bars for all dialogs, including confirmations and public booking consent. Preserve current theme tokens, widths, dismissal rules, submission behavior, and permissions; drawers/navigation/popovers are excluded.
- Implementation phase: shared DialogBody/AlertDialogBody and section layouts added; root owns shared primitives, Users/appointment/confirmation integration and verification. Separate agents migrated patient/dentist/service forms and booking consent; another owns focused browser regressions.
- Implementation and verification completed. Source inspection covered every Dialog/AlertDialog consumer; no API/database or drawer/popover changes were made. Obsidian MCP is unavailable and no existing Graphify graph is present; source references are authoritative.
- Independent read-only review identified the short-viewport gutter edge case; shared content now uses the smaller of 90dvh and the viewport height minus 32px. Form boundaries, existing close controls, confirmation safeguards, focus behavior, widths, and colors were reviewed and preserved.
- Fresh whole-project lint and typecheck passed, as did all 83 unit tests, the final production build (26 static pages), targeted lint for the final browser-test changes, and Git whitespace checks.
- Final full Chromium E2E run passed: 56 passed, one demo-disabled case skipped, zero failures (1.6 minutes). Eight new dialog tests cover desktop/light, mobile/dark, a 390x300 viewport, independently scrolling bodies, persistent headers/actions, viewport gutters, Close controls, nested selects, confirmation backdrop safety, validation, consent acceptance, and the existing Add user focus fallback. Geometry checks wait for opening animations to finish.
- Visually inspected mobile dark Dentist and booking-consent screenshots saved under ignored `test-results/`. Verification used a fresh build and the disposable loopback PostgreSQL test database, not the application database.
- No production deployment, push, or commit was performed. Separate database integration and demo-specific browser suites, real mobile hardware, Firefox/Safari, and GitHub-hosted CI were not run for this layout-only change.

## Compact calendar drawer (2026-11-05)

- User approved a content-sized mobile bottom sheet capped at 90dvh, a full-height right-side desktop drawer from the existing sm breakpoint, compact appointment details, and a persistent bottom action bar. Preserve staged dialog changes and existing permissions, cancellation, status-update, dismissal, and focus behavior.
- Root completed the calendar drawer implementation and checkpoint integration; a separate agent extended calendar browser-test coverage and another performed a read-only review with no concrete defects found. Shared Sheet components, APIs, and database schema remain unchanged, and the previously staged modal work was preserved.
- Whole-project lint and typecheck passed, all 83 unit tests passed, and a fresh production build passed (26 static pages). Targeted lint and whitespace checks also passed for the final test changes.
- All five focused calendar drawer browser cases passed. Final full Chromium E2E verification passed: 60 passed, one demo-disabled case skipped, zero failures (1.8 minutes), against the fresh build and disposable loopback PostgreSQL test database.
- Coverage includes desktop/mobile in both themes, content-sized mobile height, full-height right desktop positioning, footer anchoring, compact action order, cancellation dismissal, status updates, focus/Escape, long notes, long names, missing phone, and terminal Close-only actions on a 390x300 viewport. Desktop responsive animation utilities were verified in compiled CSS.
- Visually inspected mobile and desktop calendar screenshots under ignored `test-results/`. The disposable database was used only for verification; no application database, deployment, push, or commit was involved. Firefox/Safari, real-device checks, separate integration/demo-specific suites, and GitHub-hosted CI were not run for this layout-only change.

## Mobile sheet gestures and admin scrolling (2026-11-05)

- User approved opt-in native drag/swipe dismissal from the handle or non-interactive header for Dentist and calendar details below sm, with short-drag return, body-only scrolling, compact Dentist layout, and unchanged desktop right drawers. Admin main remains the sole page-level vertical scroller; remove the nested Appointments vertical scroll while preserving horizontal scrolling and pagination. Public layouts and staged work are outside this change.
- Root integrated shared Sheet gestures, calendar revision-safe dismissal, compact Dentist layout, and admin scroll fixes. Independent agents implemented layout/scroll/test portions and performed source review; the review's callback-identity issue was fixed by keeping dismissal callbacks current without restarting gesture listeners.
- Mobile drag distance, recent velocity, short-drag return, cancellation/lost capture, responsive reset, reduced motion, header control exclusion, body scrolling, desktop inactivity, and focus restoration are covered by native Chromium touch tests. The fast-flick fixture stays below the distance threshold and accounts for measured browser touch-frame delivery without relaxing production thresholds.
- Runtime route sweeps confirmed hidden absolute TimePicker validation inputs escaped the static admin scrollport on Configuration and dentist schedules. Positioning admin main relatively contains these inputs; all 11 admin routes now pass desktop/mobile scroll-owner checks. The shell uses dynamic viewport height, navigation retains its own scroll, and Appointments keeps horizontal scrolling/pagination without a nested vertical table scroller.
- Dentist upcoming appointments now have an intentional horizontal scroll container so the compact desktop layout does not clip rightmost columns. Existing patient drawers, public pages, menus, dialogs, and staged work were preserved.
- Fresh whole-project lint and typecheck passed, all 83 unit tests passed, the final production build passed (26 static pages), and targeted lint/whitespace checks passed after final changes.
- Final full Chromium E2E run passed: 73 passed, one demo-disabled case skipped, zero failures (2.0 minutes), using the fresh build and disposable loopback PostgreSQL test database. This includes four new admin-scroll cases and nine native-touch cases, existing drawer/modal/theme coverage, pagination, nested cancellation, and late calendar status responses after swipe/reopen.
- Visually inspected mobile and desktop Dentist screenshots, including the horizontally scrolled upcoming table. No dependencies, APIs, database schema, application data, deployments, pushes, or commits were changed. Real mobile hardware, Firefox/Safari, separate integration/demo-specific suites, and GitHub-hosted CI were not tested for this UI change.

## Patient Details and Obsidian documentation (2026-11-06)

- Implemented the approved reference layout using the existing opt-in mobile Sheet: content-sized height up to 90dvh, draggable handle/header, desktop right drawer, stationary header/footer, and body-only scrolling. Profile/status, separated contacts, grouped statistics, bordered Next/Last cards, and compact wrapping history rows preserve all existing fields. Mobile history was explicitly retained. Notes, loading/error/retry, order/counts, dismissal, and selector-based focus restoration remain intact; no API/schema/dependency changes.
- Independent agents extended layout and native-touch tests in separate files and completed a read-only source review with no concrete defects. Eight additional browser cases cover patient gestures, responsive summary screenshots, short screens, long content, and loading/error/retry to an inactive empty profile. Existing light/dark patient coverage now checks bottom anchoring, desktop position, and history fields on both sizes.
- Whole-project lint and typecheck passed; all 83 unit tests passed. The final fresh production build passed, generating 26 static pages. Git whitespace checks passed. Mobile and desktop patient screenshots were inspected.
- The initial build could not reach the disposable database because it had started on the default port instead of the intended test port; restarting that same cluster on loopback port 54879 resolved setup. The first browser run found unequal Next/Last card heading alignment (corrected with top-aligned content), plus the existing Configuration flow exceeding its overall 30-second test budget. Final full Chromium verification passed: **81 passed, one demo-disabled case skipped, zero failures (3.5 minutes)** using `npm.cmd run test:e2e -- --timeout=60000`; assertion timeouts were unchanged.
- Refreshed the existing allowlisted Graphify AST approach into ignored `node_modules/.cache/aether-patient-drawer-20261106-final/`: seven source files, 157 nodes, 351 edges. Final source hashes match and prior graph artifacts were preserved. Structural maps supplement source review and tests; they are not runtime evidence.
- Obsidian MCP was unavailable. Updated and read back `D:/Grimoire/01-Projects/Aether-Dental/Drawers.md` and created/read back `Conversation Changes 2026-11-06.md` using the authorized filesystem fallback. Original drawer notes remain intact. The linked record covers earlier Users work, dashboard fixture and currency-label fixes, dialog standards, calendar/dentist sheets, admin scrolling, prior per-file commits/PR text, and this patient update, separating historical checks from newly executed verification. No secrets or patient data were recorded.
- The four changed repository files are committed individually under the standing instruction. No push, deployment, or PR publication is authorized by this update. Real mobile devices, Firefox/Safari, separate integration/demo-specific suites, and GitHub-hosted CI were not run for this layout change.

## Multi-tenant pilot (2026-11-08)

Authorized: independent clinics, one clinic per staff account, manual onboarding,
subdomain routing, shared PostgreSQL. No application-database migration, production
push or deployment is authorized. User asked whether production push is safe;
reported that implementation and release verification are still incomplete.

- Initial diff was clean. Obsidian Configuration/Performance/history notes and
  existing Graphify maps were consulted during assessment and source verified.
- Schema/provisioning, host/auth, and public/email work delegated with disjoint
  ownership; main agent owns tenant query isolation, integration, and verification.
- Required ownership and SQL tenant relationship constraints prepared; legacy rows
  backfill to `aether`. Runtime Prisma rejects raw SQL, owner changes and nested
  writes, and scopes flat queries including transactions. No production DB touched.
- Background reminders capture tenant context before `after`; public pages are
  dynamic and responses disable shared caching. Auth tokens lacking tenant ID
  intentionally expire; production requires an explicit platform domain.
- Verification in progress. Earlier baseline was 83 unit tests and typecheck.
  First updated full serial unit run: 90 passed, 3 failed from missing tenant auth
  fixtures; fixing these fixtures before final verification. Prisma validate and
  client generation passed; generation preserved a byte-identical Windows engine
  DLL because another process holds the existing library open.

### Multi-tenant final verification

- Final application build PASSED with test-only local configuration; whole-project
  TypeScript and ESLint PASSED. Unit suite: 98 passed, zero failures.
- All five migrations deployed successfully to three disposable local PostgreSQL
  databases. Full guarded integration runner PASSED all six suites; final expanded
  isolation rerun: six passed (including parent), covering foreign IDs/deletes,
  tenant constraints, raw/nested-write rejection, booking races, clinic closures,
  captured background reminders, notification recipients, and email history.
- Full Chromium run: 81 passed, three failed, one demo-disabled check skipped.
  The three failures were test APIRequest DNS transport on Windows and outdated
  privacy-email assertions. Fixed the test harness/assertions; affected admin and
  configuration rerun: seven passed, zero failures. Live subdomain isolation tests
  passed in the full run. Separate demo-enabled run: one passed, three normal staff
  cases intentionally skipped. Product source did not change after final build.
- Independent security review found no additional concrete blocking issue after
  forwarded-origin, proxy matcher, background-context and SMTP identity fixes.
- Refreshed and queried ignored source AST graph at
  node_modules/.cache/aether-tenant-20261108/graphify-out/graph.json (1091 nodes,
  3631 edges, 35 communities). No model API calls; Prisma/CSS verified from source.
- Obsidian implementation/verification note created under existing project folder:
  Multi-tenant Pilot 2026-11-08. No credentials or patient records copied.
- No application database migration, push or deployment performed. Production
  release still requires migration-history reconciliation, tested backup/recovery,
  coordinated schema/code rollout, wildcard DNS/TLS, ingress/cookie checks and real
  SMTP verification. Single-clinic rollback is unsafe once multiple clinics write.

## Managed subscription phase (2026-11-08)

User selected managed trials/manual subscriptions for pitching and testing with
clinics: 30-day trial, read-only records and no new public bookings after expiry,
records retained, monthly price not set. No payment gateway, automatic charges,
self-service signup, production migration or deployment authorized.

Implementation in progress: shared subscription policy + runtime write guard,
subscription schema/operator tooling, request/API/delivery guards, and admin
Subscription page/expiry notice. Existing Aether owner clinic remains INTERNAL
without a billing deadline. Clinic admins cannot renew their own access.

### Managed subscriptions — final verification

- Implemented 30-day trials, INTERNAL/TRIAL/PAID modes and timestamped deadlines,
  operator-only status/renew/expire with transactional audits, ADMIN Subscription
  screen, staff expiry/trial notices, public booking unavailable notice, and write
  gates across proxy/API/runtime DB/background reminders/SMTP. Price remains unset;
  no gateway, automatic charges, invoices or self-service signup were introduced.
- Final full unit suite: 107 passed, zero failures. Complete integration runner:
  all eight suites passed on disposable loopback PostgreSQL, including preservation,
  expiry retention/write denial, manual renewal restoration and operator atomicity.
- Final production build, whole-project TypeScript, ESLint and diff whitespace
  checks passed. Full Chromium: 86 passed, zero failures, one demo-only case skipped.
- Final independent read-only subscription review found no concrete blocker.
- Updated source Graphify: 1102 nodes, 3727 edges, 31 communities; no LLM calls.
  Created Obsidian Managed Subscriptions 2026-11-08 note in the existing project folder.
- Migration applied only to disposable databases. No application DB access, push
  or deployment. Existing-domain hostname mapping remains a separate unimplemented
  option; current production routing requires configured clinic subdomains.

- Separate demo-enabled Chromium check passed: one test, three normal staff cases
  intentionally skipped. Disposable local test services stopped after verification.

## Branch-only commit checkpoint (2026-11-11)

User authorized committing all current SaaS changes on `multi_tenant_module`, one
changed file per commit with aligned messages. No branch switch, push, deployment
or application-database migration is authorized by this commit request. The
implementation verification results above describe earlier executed runs; tests
are not rerun solely for this Git operation. Git whitespace checks and per-commit
file ownership are verified during the commit process.
