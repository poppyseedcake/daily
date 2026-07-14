# PRD: Milestone 8 - Production Hardening

## Problem Statement

Daily can authenticate Users, persist their setup, generate live Weather, Commute, Calendar, and Todo sections, send test email, and deliver scheduled Daily Summaries through an idempotent worker. However, the application is not yet ready to operate safely on its target VPS. There is no repeatable production deployment path, no supervised web service or scheduled worker timer, no production backup and restore workflow, and no CI gate that proves every change can be checked, tested, and built.

An Administrator also lacks enough privacy-safe operational visibility to tell whether scheduled delivery is healthy, whether the worker is still running, why technical operations are failing, or whether a Google Maps cap alert was delivered. Existing console output is not a complete operational interface and may accept arbitrary error objects whose content is unsafe to expose. At the same time, operational tooling must not become a support surface for reading Summary Recipients, Todo Tasks, Calendar Events, Commute locations, rendered summaries, provider payloads, credentials, or tokens.

Finally, a signed-in User cannot delete their Daily account and associated data. Disabling Summary Delivery is not an account-deletion substitute: the User needs one explicit flow that stops future delivery, removes authentication and product data, revokes the local connection to Google, and returns the browser to Visitor mode.

## Solution

Establish a production operating model for the existing single SvelteKit, Node, and SQLite application on one self-managed VPS. Run the built web application as an unprivileged systemd service and invoke the existing scheduled Daily Summary worker once per minute through a separate systemd oneshot service and timer. Add a repeatable deployment workflow that installs locked dependencies, builds the application, creates and verifies a pre-migration SQLite backup, applies migrations, restarts services, and verifies a minimal privacy-safe health endpoint.

Add an application-owned SQLite backup command that uses SQLite's online backup mechanism so the web service does not have to copy a live database file directly. Run it daily under systemd, verify each backup before finalizing it, store it outside the application release directory, and apply configurable age-based retention with a 30-day default. Document and exercise the corresponding restore procedure.

Introduce a structured technical logging boundary and persisted Scheduled Worker Run records containing only allowlisted operational fields. Continue emitting JSON to standard output for journald while making bounded, privacy-safe technical events and worker health available to authorized Administrators in the existing Admin Panel. Extend that panel with Delivery Record aggregates, latest worker status, stale-processing indicators, technical-log filtering, current Google Maps usage and kill switch state, and Google Maps operator-alert outcomes. Preserve the existing deployment-configured Administrator allowlist and the higher-priority environment Maps kill switch.

Add an irreversible account deletion flow for signed-in Users. The flow first marks the account as deleting and clears scheduling eligibility, then removes User-owned domain data, Delivery Records, authentication sessions and provider credentials, attributable operational records, and the Daily account itself. The scheduled worker must revalidate account state immediately before provider submission. The deletion flow signs the User out and returns them to Visitor mode; already accepted external provider deliveries cannot be recalled.

Add GitHub Actions CI for pull requests and pushes to the main branch. CI installs from the lockfile, runs Svelte checks, deterministic tests, Playwright workflows, and a production build without contacting live providers or requiring production secrets.

## User Stories

1. As a signed-in User, I want Daily to remain available after a server process failure, so that a transient application crash does not require manual recovery.
2. As a signed-in User, I want scheduled delivery to continue after a VPS reboot, so that server maintenance does not silently disable my Daily Summary.
3. As a signed-in User, I want production migrations preceded by a verified database backup, so that an operational mistake has a recoverable starting point.
4. As a signed-in User, I want live SQLite backups to be internally consistent, so that a restored account does not contain a torn database copy.
5. As a signed-in User, I want operational logs to exclude my Summary Recipient email and private content, so that operating Daily does not expose my day-planning data.
6. As a signed-in User, I want the Admin Panel to show delivery health without showing my Daily Summary content, so that service operation respects my privacy.
7. As a signed-in User, I want to find an account deletion action from my signed-in Daily surface, so that I can remove my account without contacting an Administrator.
8. As a signed-in User, I want account deletion to require an explicit irreversible confirmation, so that I do not remove my account accidentally.
9. As a signed-in User, I want account deletion to stop future scheduled delivery before my data is removed, so that a concurrent worker cannot intentionally start a later Daily Summary for me.
10. As a signed-in User, I want account deletion to remove my Summary Configuration, so that Daily no longer retains my delivery preferences.
11. As a signed-in User, I want account deletion to remove my Todo Categories and Todo Tasks, so that my task data is not retained.
12. As a signed-in User, I want account deletion to remove my Weather Location, so that my selected location is not retained.
13. As a signed-in User, I want account deletion to remove my Commute Routes and Commute Days, so that my route and schedule data are not retained.
14. As a signed-in User, I want account deletion to remove my Calendar Connection and Selected Calendars, so that Daily no longer retains my Google Calendar setup.
15. As a signed-in User, I want account deletion to remove my Delivery Records, so that my delivery history is not retained.
16. As a signed-in User, I want account deletion to remove my Daily identity, sessions, and locally stored Google credentials, so that I can no longer be authenticated as the deleted User.
17. As a signed-in User, I want Daily to attempt revocation of its Google authorization during deletion, so that its provider access is withdrawn where Google allows it.
18. As a signed-in User, I want local account deletion to finish even if external token revocation is unavailable, so that a provider outage cannot trap my data in Daily.
19. As a signed-in User, I want deletion to remove operational records that are explicitly attributable to my account, so that operational tooling does not preserve a hidden User profile.
20. As a signed-in User, I want aggregate service counters to remain anonymous after deletion, so that operational totals can stay accurate without retaining my private setup.
21. As a signed-in User, I want to become a Visitor after deletion, so that the browser no longer acts as my deleted account.
22. As a signed-in User, I want a clear success result after deletion, so that I know the operation completed.
23. As an Administrator, I want a documented list of production prerequisites, so that I can prepare the target VPS consistently.
24. As an Administrator, I want Daily to run under a dedicated unprivileged operating-system account, so that a compromised process has limited host access.
25. As an Administrator, I want application releases separated from persistent database and backup storage, so that replacing application code does not replace production data.
26. As an Administrator, I want production secrets and environment configuration outside the application release, so that deployments do not overwrite credentials.
27. As an Administrator, I want the web application supervised by systemd, so that startup, restart, shutdown, and status follow the host's normal service model.
28. As an Administrator, I want the web service to start automatically after reboot, so that Daily returns without an interactive login.
29. As an Administrator, I want the web service restarted after unexpected failure with bounded restart behavior, so that transient crashes recover without an uncontrolled restart loop.
30. As an Administrator, I want systemd to stop the Node process gracefully, so that in-flight work receives a normal termination window.
31. As an Administrator, I want the service to use an explicit working directory and environment file, so that runtime configuration is deterministic.
32. As an Administrator, I want service hardening that still permits the configured application data and backup operations, so that host privileges are minimized without breaking Daily.
33. As an Administrator, I want the scheduled Daily Summary worker invoked once per minute by a systemd timer, so that Summary Time delivery runs in production.
34. As an Administrator, I want the timer enabled automatically after deployment, so that installing a release does not leave scheduled delivery dormant.
35. As an Administrator, I want a missed timer during a short reboot to run after startup, so that recent due work is evaluated under the existing retry and staleness rules.
36. As an Administrator, I want the worker to run as a separate oneshot service, so that a worker failure does not terminate the web application.
37. As an Administrator, I want systemd to prevent overlapping invocations of the same worker service, so that routine scheduling does not create unnecessary concurrency.
38. As an Administrator, I want application-level idempotency to remain authoritative even with systemd overlap protection, so that manual or abnormal duplicate invocations stay safe.
39. As an Administrator, I want worker exit status and structured completion counts visible in service logs, so that scheduler failures are diagnosable.
40. As an Administrator, I want a repeatable deployment command, so that releases follow the same ordered procedure.
41. As an Administrator, I want deployment to install exactly the dependencies recorded in the lockfile, so that the VPS does not resolve an unreviewed dependency set.
42. As an Administrator, I want deployment to build the production SvelteKit Node server before service restart, so that a broken release does not replace the running process.
43. As an Administrator, I want deployment to abort before migration when the pre-migration backup cannot be created or verified, so that schema changes never proceed without a recovery point.
44. As an Administrator, I want database migrations to run once as an explicit deployment step, so that normal web and worker startup do not race to migrate SQLite.
45. As an Administrator, I want failed migrations or failed health verification to produce a failing deployment result, so that an incomplete release is not reported as successful.
46. As an Administrator, I want the deployment procedure to explain application rollback and database-restore limits, so that I do not assume a code rollback reverses a migration.
47. As an Administrator, I want a minimal health endpoint after restart, so that deployment can verify the web process and database are ready.
48. As an Administrator, I want the health endpoint to expose no User, provider, configuration, or secret data, so that it is safe for an unauthenticated readiness check.
49. As an Administrator, I want a daily SQLite backup without stopping the web service, so that routine protection does not create daily downtime.
50. As an Administrator, I want backups created through SQLite's consistency mechanism instead of direct live-file copying, so that WAL activity cannot corrupt the backup.
51. As an Administrator, I want every backup written to a temporary destination and verified before its final name is published, so that partial files are not mistaken for recovery points.
52. As an Administrator, I want backup filenames and metadata to use UTC timestamps and identify daily or pre-migration purpose, so that recovery points can be ordered and understood.
53. As an Administrator, I want backup integrity checked before success is reported, so that creation alone is not treated as proof of recoverability.
54. As an Administrator, I want backup checksums recorded alongside finalized backups, so that later restore input can be checked for accidental damage.
55. As an Administrator, I want backups stored outside the active application release directory, so that deployment cleanup cannot delete recovery points.
56. As an Administrator, I want backup files readable only by the operational account and explicitly authorized operators, so that database copies do not broaden data access.
57. As an Administrator, I want backup retention configurable with a safe 30-day default, so that storage use remains bounded.
58. As an Administrator, I want retention to run only after a new backup is verified, so that a failed backup cannot trigger deletion of the last good recovery point.
59. As an Administrator, I want retention to preserve the newest verified backup of each backup purpose, so that age cleanup cannot leave no recovery point.
60. As an Administrator, I want concurrent backup attempts serialized, so that daily and deployment backups do not compete for the same output or retention operation.
61. As an Administrator, I want a documented offline restore command and checklist, so that a backup is operationally useful during recovery.
62. As an Administrator, I want restore to verify checksum and SQLite integrity before replacing the active database, so that invalid input does not destroy the current database.
63. As an Administrator, I want restore to preserve the replaced database until recovery is confirmed, so that a failed restore has a local fallback.
64. As an Administrator, I want a restored service checked through migrations, service status, and health verification, so that recovery ends with a proven application state.
65. As an Administrator, I want the Admin Panel to show the latest Scheduled Worker Run time, outcome, duration, and aggregate counts, so that I can tell whether scheduling is alive.
66. As an Administrator, I want the Admin Panel to identify a missing or overdue worker run, so that a stopped timer is visible even when no User was due.
67. As an Administrator, I want delivery-health totals for recent sent, retrying, failed, and processing Scheduled Delivery Records, so that I can assess service health without reading User content.
68. As an Administrator, I want stale processing claims highlighted, so that interrupted delivery work is distinguishable from healthy in-flight work.
69. As an Administrator, I want recent delivery failure classifications grouped by stable code, so that recurring operational causes are visible without raw provider messages.
70. As an Administrator, I want technical logs ordered newest first and paginated, so that the Admin Panel remains bounded.
71. As an Administrator, I want to filter technical logs by time, severity, subsystem, and stable event code, so that I can narrow an investigation without full-text access to private content.
72. As an Administrator, I want technical logs to contain only allowlisted structured fields, so that arbitrary exceptions or provider payloads cannot reach the Admin Panel.
73. As an Administrator, I want technical logs to remain available in journald when SQLite persistence is unavailable, so that database failures remain diagnosable.
74. As an Administrator, I want operational log retention bounded, so that observability cannot grow the primary SQLite database forever.
75. As an Administrator, I want Admin Panel access to remain restricted to verified Google emails in the deployment allowlist, so that operational data and controls are not exposed to ordinary Users.
76. As an Administrator, I want critical Admin Panel actions recorded as privacy-safe audit events, so that Google Maps kill switch changes are traceable.
77. As an Administrator, I want to see current UTC Google Maps daily and monthly usage, configured caps, category totals, and effective suspension state, so that provider cost protection is operationally visible.
78. As an Administrator, I want the deployment environment Google Maps kill switch to remain higher priority than the Admin Panel switch, so that an infrastructure override cannot be cleared from the UI.
79. As an Administrator, I want one operator alert when a daily or monthly global Google Maps cap suspends calls, so that protective suspension is not silent.
80. As an Administrator, I want Google Maps cap alert delivery outcome visible without recipient or provider payload data, so that I can see whether the operator notification worked.
81. As an Administrator, I want an alert failure not to re-enable Maps or cause repeated alerts from blocked requests, so that notification failure cannot weaken or flood the guardrail.
82. As a developer, I want pull requests and main-branch pushes checked automatically, so that regressions are caught before production deployment.
83. As a developer, I want CI to install from the committed lockfile, so that dependency drift fails visibly.
84. As a developer, I want CI to run Svelte and TypeScript checks, so that invalid application code cannot pass the pipeline.
85. As a developer, I want CI to run deterministic Vitest suites, so that domain, database, worker, logging, backup, and account-deletion rules remain protected.
86. As a developer, I want CI to run Playwright workflows in a controlled environment, so that critical User and Administrator behavior is verified through the browser.
87. As a developer, I want CI to produce a production build, so that type-correct tests do not hide an adapter or bundling failure.
88. As a developer, I want CI to use pinned Node and package-manager versions compatible with production, so that the pipeline and VPS do not validate different runtimes.
89. As a developer, I want CI tests to use temporary SQLite databases and fake provider boundaries, so that the pipeline is isolated and does not mutate real data or consume external quotas.
90. As a developer, I want CI to require no production OAuth, Resend, Open-Meteo, or Google Maps secrets, so that untrusted pull requests can run safely.
91. As a developer, I want backup and restore commands testable against temporary directories and databases, so that production safety behavior can be proven without a VPS.
92. As a developer, I want systemd unit and timer definitions validated by machine-readable checks, so that syntax and critical command wiring do not rely only on review.
93. As a developer, I want privacy tests seeded with sensitive canary values, so that any path from User content or raw errors into technical logs fails deterministically.
94. As a developer, I want Milestone 8 to preserve the single-VPS, SQLite-backed architecture, so that production hardening does not introduce a second deployment platform or database.

## Implementation Decisions

- Continue deploying Daily as one full-stack SvelteKit Node application with SQLite and a separate non-interactive scheduled Daily Summary worker command from the same release.
- Target one self-managed Linux VPS with systemd. Container orchestration, multiple application hosts, and distributed database coordination are not introduced.
- Run Daily under a dedicated unprivileged operating-system account. Persistent application data, release code, environment configuration, and backups are separate operational locations with least-privilege ownership and permissions.
- Keep the SQLite database outside replaceable release contents. The web service, worker, migration command, backup command, and restore command receive the same explicit database configuration.
- Keep production secrets in a systemd-readable environment file outside the release. Repository files and generated service definitions contain documented variable names and safe examples, never production values.
- Pin and document the supported Node and package-manager versions. The same major runtime versions are used by CI and production.
- Provide a repeatable deployment command and operator documentation. A deployment performs prerequisite checks, lockfile installation, production build, verified pre-migration backup, explicit database migration, required idempotent backfills, service restart, timer enablement, and post-restart health verification in that order.
- Do not run database migrations implicitly from normal web or worker startup. A failed pre-migration backup, migration, service restart, or health verification makes deployment fail visibly.
- Preserve the previous release until the new release passes health verification. Document that reverting application code does not reverse an applied database migration and that database rollback requires the restore procedure.
- Run the built SvelteKit Node server as a systemd service with an explicit unprivileged User, working directory, environment file, restart-on-failure policy, bounded restart delay, graceful stop timeout, journald output, and automatic startup after networking is available.
- Apply systemd hardening appropriate to a Node and SQLite service, including restricted privilege escalation and write access limited to required runtime locations. Hardening must be verified against database, temporary-file, and network-provider needs rather than copied blindly.
- Run the existing scheduled delivery command as a separate systemd oneshot service under the same operational identity and configuration as the web service.
- Invoke the worker oneshot service through a systemd timer once per minute. Enable persistence for missed timer activation after a reboot; the existing 15-minute delivery deadline, retry policy, and idempotent claims remain authoritative for whether recovered work is sent or marked stale.
- Rely on systemd to avoid overlapping activation of the same oneshot unit during ordinary scheduling. Retain SQLite-backed occurrence uniqueness and provider idempotency because manual invocation, abnormal timing, or another process can still create concurrency.
- Emit web and worker standard output as single-line structured JSON suitable for journald. Human-readable arbitrary strings and raw serialized Error objects are not the technical logging contract.
- Add a minimal unauthenticated health endpoint for deployment readiness. A healthy response confirms that the Node request path is running and a trivial SQLite query succeeds. It returns only a fixed status and optional build identifier; it does not expose environment values, provider readiness, counters, User data, schema details, paths, or exception text. Database unavailability returns a generic unhealthy status and a non-success HTTP code.
- Add an application-owned backup command with explicit daily and pre-migration purposes. Use SQLite's online backup API instead of copying the active database file or its WAL and shared-memory sidecars.
- Serialize backup operations with an operational lock. Write a backup to an incomplete temporary name, run SQLite integrity verification against the produced database, compute a checksum and small non-private metadata record, then atomically publish the finalized backup. Failed or interrupted temporary output is never reported as a successful recovery point.
- Use UTC timestamps in backup names and metadata. Metadata identifies backup purpose, creation time, schema migration state where available, byte size, checksum, and verification outcome without copying User content into a separate index.
- Store backups outside the application release directory with permissions limited to the operational account and authorized operators.
- Run a daily backup through a separate systemd oneshot service and timer. A backup failure produces a failing unit result and a privacy-safe technical event.
- Run the same backup command with pre-migration purpose from deployment. Migration is blocked unless the new pre-migration backup is finalized and verified.
- Apply configurable age-based retention after, and only after, a new backup of the requested purpose is finalized successfully. Use 30 days as the default retention window and always preserve the newest verified daily and pre-migration backups even when they exceed the age threshold.
- Keep retention and backup creation in one serialized operator boundary so concurrent daily and deployment commands cannot remove or overwrite one another's output.
- Document an offline restore workflow that stops the web and worker timer, verifies checksum and SQLite integrity, preserves the replaced database, installs the selected backup atomically, applies forward migrations if required, starts services, and verifies service status and the health endpoint.
- Introduce a structured technical logging module used by web actions, provider boundaries, scheduled delivery, backup, restore, deployment-related commands, and critical Admin Panel actions.
- Define technical events through stable event codes, severity, subsystem, UTC timestamp, optional opaque correlation identifiers, duration, outcome classification, and a small event-specific allowlist of scalar metadata. Do not accept arbitrary metadata maps at call sites.
- Never include Summary Recipient email, Todo Task title, Calendar Event content, Weather or Commute content, location labels or coordinates, rendered HTML or text, provider request or response bodies, raw exception messages or stacks, sessions, credentials, OAuth tokens, client addresses, User-Agent values, or unhashed User identifiers in Technical Log Records.
- Map caught failures to stable privacy-safe classifications at the boundary where they are understood. Unknown failures use a generic classification; raw errors may be handled in memory for control flow but are not serialized to stdout, SQLite, or the Admin Panel.
- Continue emitting technical events to standard output even when persistence is unavailable. Persist Admin-visible Technical Log Records in SQLite on a best-effort basis without allowing a logging write failure to recurse or replace the primary operation result.
- Retain Technical Log Records for a configurable 30-day default. Delete expired records in bounded maintenance work that cannot block the one-minute scheduled delivery path for an unbounded period.
- Persist a Scheduled Worker Run record for each worker invocation with start and completion instants, final top-level outcome, duration, and aggregate due, sent, skipped, retrying, failed, and isolated-error counts. Do not store per-User content or Summary Recipient identity in the run record.
- Bound Scheduled Worker Run retention to the same operational retention window. A run that fails before normal worker initialization still records or emits the best available top-level failure classification.
- Extend the existing allowlisted Admin Panel instead of creating a separate operational application. All new loads and mutations recheck the current verified Google session and Administrator allowlist on the server.
- Add a Delivery Health view based on Scheduled Worker Runs and Delivery Records. Show the latest run and whether it is overdue, recent delivery totals by status, stale processing claims, and grouped stable failure classifications for fixed recent windows. Do not show User identity, recipient, provider message identifiers, or summary content.
- Treat the worker as overdue when no successful top-level invocation has completed within a configurable threshold greater than the one-minute timer interval. Show the threshold and UTC basis in the Admin Panel rather than implying that a quiet delivery period is a worker failure.
- Add a Technical Log view ordered newest first with bounded cursor pagination and filters for UTC time range, severity, subsystem, and event code. Do not add arbitrary full-text search or raw journal access.
- Record privacy-safe audit events for critical Admin Panel mutations, including the previous and new Admin Panel Google Maps kill switch state, without recording the Administrator email.
- Preserve the existing Google Maps usage gate, UTC daily and monthly counters, category totals, per-person abuse limit, SQLite-backed Admin Panel kill switch, and higher-priority deployment environment kill switch.
- Preserve one idempotently claimed operator alert per Google Maps cap type and UTC period. Surface its delivered or failed outcome in the Admin Panel using stable metadata only. Alert failure never changes Maps suspension and blocked requests do not retry the alert.
- Keep the operator alert recipient in deployment configuration and send through the existing Resend boundary. Do not display the recipient address in the Admin Panel or Technical Log Records.
- Add an account lifecycle state that distinguishes active from deleting while account deletion is in progress. Only active Users are eligible for preview, test delivery, scheduled generation, retry, or provider submission.
- Expose account deletion only to a currently signed-in User through a CSRF-protected server action. Require an exact explicit confirmation value and present the action as irreversible; Google OAuth sign-in provides no Daily password to request.
- Start deletion by atomically marking the User deleting, clearing the next scheduled occurrence, disabling Summary Delivery eligibility, and preventing retryable Scheduled Delivery Records from being submitted. The worker revalidates active account state immediately before each provider submission.
- After delivery eligibility is revoked, delete User-owned Summary Configuration, Todo data, Weather Location, Commute setup, Calendar Connection, Selected Calendars, Delivery Records, and any persisted operational records explicitly keyed to that User.
- Delete Better Auth sessions and provider accounts, locally stored access, refresh, and ID tokens, and the authentication User together with the Daily User identity. Use SQLite transactions and foreign-key cascades where they make completeness enforceable, and test every owned table explicitly so a newly added table cannot be forgotten silently.
- Delete the signed-in User's keyed per-person Google Maps abuse-counter rows when the attribution identity can be deterministically derived. Preserve anonymous global Google Maps usage totals, because consumed provider calls still count toward real caps, and preserve global control and cap-alert state.
- Attempt Google OAuth token revocation without logging or persisting the token. External revocation is best effort: failure records only a stable privacy-safe classification and does not roll back local data deletion.
- Invalidate the current session and return the browser to Visitor mode after deletion. A repeated or interrupted deletion request is safe to resume and must not recreate scheduling or User data.
- Guarantee that no new Daily delivery is intentionally started after the deleting state is committed. Document that an email already accepted by the external delivery provider before deletion cannot be recalled.
- Add GitHub Actions CI on pull requests and pushes to the main branch. Use concurrency cancellation for superseded runs where it does not hide a completed main-branch result.
- Install dependencies with the lockfile-strict command, cache only safe dependency artifacts, install the required Playwright browser and system dependencies, and use temporary SQLite storage.
- Run Svelte and TypeScript checks, Vitest, Playwright, and the production adapter build. Jobs may be split for useful failure reporting, but all are required parts of the CI result.
- Keep CI deterministic and secret-free. Replace Resend, Google Calendar, Google Maps, Open-Meteo, OAuth, and operator-alert calls with existing fake or injected boundaries; do not weaken tests by conditionally skipping provider-related behavior when secrets are absent.
- Do not add automatic production deployment to GitHub Actions in this milestone. Deployment remains an explicit operator action against the prepared VPS.

## Testing Decisions

- Tests should assert externally visible operational behavior and stable privacy contracts rather than implementation details such as shell command ordering internals, component structure, exact SQL statement text, or systemd formatting whitespace.
- The highest production-operations seam is the operator command boundary against a temporary release layout, backup directory, and SQLite database. Use it to verify backup creation, integrity, retention, pre-migration gating, restore behavior, exit statuses, and privacy-safe events without requiring a real VPS.
- The highest application seam is the SvelteKit server boundary with persisted state and controlled auth. Use it to verify health, Admin Panel delivery health and technical logs, critical Admin actions, account deletion, and scheduled-delivery exclusion after deletion.
- Use Playwright only for the critical browser workflows that gain confidence from a real page: an authorized Administrator can inspect privacy-safe health and logs and mutate the Maps kill switch, unauthorized actors remain denied, and a signed-in User confirms account deletion and becomes a Visitor.
- Use Vitest for operator commands, SQLite stores, structured event schemas, retention policies, worker-run health calculations, Admin server loads and actions, deletion coordination, and privacy filtering.
- Extend prior art from the existing scheduled worker command and event tests, SQLite store tests, Admin Panel authorization and Google Maps control tests, page server tests, signed-in Playwright setup, and provider fakes.
- Validate systemd service and timer definitions with systemd's unit verification tooling in an environment where it is available. Add repository-level assertions for required service commands, environment wiring, user isolation, restart behavior, timer cadence, persistence, and enablement documentation without starting production services.
- Test the web service definition and worker service definition separately so worker failure cannot be mistaken for web-service failure.
- Test that normal timer activation does not overlap the same oneshot service and that application-level duplicate invocation remains idempotent through existing worker tests.
- Test the health endpoint with a working database and an unavailable database. Assert its status code and fixed public payload and verify that configuration, paths, errors, schema, counters, provider state, and User data never appear.
- Test a backup while the source database is open and receiving WAL-backed writes. Restore the finalized output into a separate database and verify a consistent committed snapshot.
- Test that direct source file copying is not used as the production backup implementation.
- Test backup temporary-file finalization, UTC naming, purpose metadata, checksum creation, integrity verification, restrictive permission intent, and successful exit status.
- Test an interrupted or failed backup and verify that no finalized recovery point is reported and retention does not run.
- Test concurrent daily and pre-migration backup attempts and verify serialization without output collision.
- Test retention below, exactly at, and above the configured age boundary with a controlled clock.
- Test that retention runs only after successful verification and always preserves the newest verified backup of each purpose.
- Test that pre-migration backup failure prevents the migration dependency from being invoked.
- Test restore rejection for a missing checksum, checksum mismatch, failed SQLite integrity check, and invalid destination state.
- Test a successful restore into an offline temporary deployment, preservation of the replaced database, forward migration, and readiness verification.
- Test structured technical events as schema-validated values with only event-specific allowlisted fields.
- Seed raw failures and User data with recognizable canaries for Summary Recipient email, Todo Task title, Calendar Event title, Weather Location, Commute labels and coordinates, rendered email, provider payload, token, session, client address, and User-Agent. Assert that none can appear in JSON stdout, Technical Log Records, Scheduled Worker Runs, Admin Panel responses, or audit events.
- Test that an unknown Error becomes a stable generic classification without message, stack, cause, or enumerable custom properties.
- Test that failure to persist a Technical Log Record still emits the safe stdout event and does not recursively log or replace the primary operation outcome.
- Test bounded log retention and pagination with deterministic UTC clocks and cursors.
- Test Scheduled Worker Run persistence for successful, top-level failed, empty, and isolated-error runs. Verify aggregate counts and durations without User identity.
- Test overdue-worker calculation before, exactly at, and after the configured threshold and verify that a run with zero due Users is still healthy.
- Test Admin Panel delivery totals and failure grouping across the fixed recent windows, including sent, retrying, failed, active processing, and expired processing claims.
- Test that Admin Panel health queries remain aggregate and cannot return recipient email, provider message id, occurrence identity, or content from joined User tables.
- Test Admin Panel Technical Log filters and cursor pagination as authorized server behavior. Verify Visitors and ordinary signed-in Users receive no operational data and cannot mutate controls.
- Test that a Maps kill switch mutation records previous and new state as a privacy-safe audit event and still respects the environment override.
- Extend existing Google Maps tests for cap-alert visibility, one claim per cap and UTC period, failed alert behavior, aggregate-only output, and no retry from later blocked requests.
- Test account deletion rejection for a Visitor, stale or invalid session, missing confirmation, and incorrect confirmation without changing User data.
- Test that deletion first commits a non-deliverable deleting state and that preview, test delivery, new scheduled occurrence processing, and retry provider submission reject that state.
- Test deletion racing with a controlled scheduled worker immediately before provider submission and verify no provider call begins after the deleting state is observed.
- Seed every User-owned table, Better Auth session and account data, Delivery Records, attributable Technical Log Records, Scheduled Delivery state, and keyed per-person Maps counters. After deletion, verify each is gone explicitly.
- Verify that global Google Maps usage totals, control state, cap-alert state, and anonymous aggregate Worker Run counts remain after User deletion.
- Test successful and failed best-effort Google token revocation without exposing the token and without allowing revocation failure to retain local User data.
- Test interrupted and repeated deletion so it can finish from the deleting state without restoring schedules, duplicating side effects, or failing on already removed rows.
- Test that the deleted browser session is invalid and the next page load is Visitor mode with no access to prior signed-in state.
- Test the CI workflow definition for pull-request and main-branch triggers, lockfile installation, supported runtime, Svelte checks, Vitest, Playwright, production build, and absence of required production secrets.
- Run the same check, test, and build commands locally when validating the workflow so CI does not refer to stale package scripts.
- Automated tests must not call live Google OAuth, Calendar, Maps, Open-Meteo, Resend, a production VPS, or a production SQLite database.

## Out of Scope

- Paid plans or subscriptions.
- Database migration to PostgreSQL or another database engine.
- Multiple production application hosts, active-active delivery, distributed leader election, or high-availability SQLite replication.
- Docker, Kubernetes, a managed application platform, or a second deployment target.
- Automatic continuous deployment from GitHub Actions.
- Zero-downtime rolling deployments.
- Remote or offsite backup transfer, object-storage integration, backup encryption key management, or a managed backup service.
- A guaranteed disaster-recovery time objective or recovery-point objective.
- Automated periodic restore drills against production infrastructure.
- Centralized log aggregation, OpenTelemetry collector deployment, Prometheus, Grafana, external uptime monitoring, paging integrations, or a full observability platform.
- Admin support tools for reading Summary Recipient email, Todo Tasks, Calendar Events, Commute Routes, rendered Daily Summaries, or provider payloads.
- Database-managed Administrator roles, delegated support roles, or fine-grained operational permissions.
- User data export, account recovery after deletion, soft-delete grace periods, or Administrator-initiated User deletion.
- Guaranteed deletion from provider-owned logs, email already accepted by Resend, email recipient mailboxes, or backups created before deletion.
- Selective rewriting of historical backup files after account deletion.
- Alternate Summary Recipients, paid delivery tiers, or new Summary Sections.
- Dedicated mobile app, PWA install flow, or multi-language localization.

## Further Notes

- Milestone 8 hardens the existing product and operational loop; it does not redesign Daily's Summary Sections or scheduled delivery semantics.
- The UI and operator documentation should remain in English and use UTC explicitly for operational timestamps while preserving User Time Zone for Daily Summary scheduling.
- The existing Google Maps Admin Panel controls and cap alert implementation are prior art to preserve and integrate into the final production-health surface, not parallel control systems to rebuild.
- A backup retained on the same VPS protects against migration mistakes and release-directory loss but not complete host loss. Offsite backup is intentionally left for later work and should be called out as residual operational risk.
- SQLite online backup consistency and integrity verification reduce backup risk but do not prove every application-level restore path. The documented restore check closes that gap for the supported single-VPS model.
- Account deletion applies to the live application database. Existing backups remain immutable recovery artifacts until retention expires and must retain the same restricted access as the live database.
- Committing the deleting state is the boundary after which Daily must not intentionally begin another provider submission. Delivery already accepted externally before that boundary is outside Daily's ability to recall.
- Technical observability is intentionally based on stable classifications and aggregate counts. When that is insufficient, operators should improve a privacy-safe event schema rather than log raw User or provider data.
- The PRD uses the existing Daily domain language: Visitor, User, Summary Recipient, Summary Configuration, Summary Time, User Time Zone, Summary Delivery, Summary Section, Daily Summary, Delivery Record, Test Delivery Record, Scheduled Delivery Record, Scheduled Worker Run, Technical Log Record, Calendar Connection, Selected Calendar, Weather Location, Commute Route, Todo Category, Todo Task, Administrator, and Admin Panel.
