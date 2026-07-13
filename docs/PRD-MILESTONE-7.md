# PRD: Milestone 7 - Scheduled Daily Summaries

## Problem Statement

Daily can generate a User's Daily Summary from live Weather, Commute, Calendar, and Todo data, show the result in preview, and send it as a test email. However, a User still has to open the application and initiate delivery manually. Summary Time, User Time Zone, and Summary Delivery are persisted preferences, but they do not yet cause a Daily Summary to arrive automatically.

Without a scheduled delivery path, Daily does not fulfill its core promise. A naive scheduler would also be unsafe: local Summary Time has to map correctly to UTC across daylight-saving transitions, overlapping worker invocations could send duplicates, one User or provider failure could stop the entire run, and unlimited retries could deliver a stale summary long after it is useful.

Milestone 7 must turn the existing generation and test-delivery capabilities into an idempotent scheduled workflow. It must preserve section-level degradation, skip empty summaries, keep delivery history useful without retaining private email content, and isolate failures while remaining simple enough to run once per minute from cron or a systemd timer.

## Solution

Add a scheduled Daily Summary worker to the existing application. Store each eligible User's next scheduled summary instant as `next_summary_at` in UTC, calculate it from Summary Time and User Time Zone with Temporal, and invoke the worker every minute through a non-interactive application command.

Each worker run claims due scheduled occurrences through a unique Delivery Record before sending. A single scheduled Delivery Record represents one User and one scheduled occurrence, and is updated as delivery moves through processing, bounded retry, sent, or failed states. Concurrent or repeated worker invocations therefore cannot independently send the same occurrence. The same occurrence identity is also passed to the email provider as an idempotency key where the provider supports it.

The worker generates sections through the same Daily Summary generation path used by preview and test delivery. An enabled section that fails becomes an Unavailable Section while other qualifying sections continue. If no section produces qualifying content, the worker sends nothing, creates no Delivery Record, and schedules the next occurrence. Retryable email-provider failures receive at most three total attempts within 15 minutes of Summary Time; permanent failures and stale occurrences are not retried.

Signed-in Users continue to see the last 30 days of Delivery Records, now including scheduled delivery status and bounded retry information. Delivery Records and technical logs contain operational metadata only, never rendered email content, Todo Task titles, Calendar Event content, Commute locations, provider payloads, credentials, or tokens.

## User Stories

1. As a signed-in User, I want Daily to send my Daily Summary automatically, so that I do not have to open the application every morning.
2. As a signed-in User, I want scheduled delivery to use my Summary Time, so that the email arrives when it is useful to me.
3. As a signed-in User, I want scheduled delivery to use my User Time Zone, so that server location does not change when my summary arrives.
4. As a signed-in User, I want `next_summary_at` stored as a UTC instant, so that scheduling has an unambiguous persisted reference.
5. As a signed-in User, I want changing Summary Time to recalculate my next scheduled delivery, so that the old time is no longer used.
6. As a signed-in User, I want changing User Time Zone to recalculate my next scheduled delivery, so that future delivery follows my new local time.
7. As a signed-in User, I want disabling Summary Delivery to stop future scheduled delivery, so that delivery remains under my control.
8. As a signed-in User, I want enabling Summary Delivery to schedule the next future occurrence, so that automation resumes without sending an old summary.
9. As a signed-in User, I want disabling every Summary Section to remove my pending schedule, so that Daily does not wake the worker for an impossible summary.
10. As a signed-in User, I want enabling at least one Summary Section to restore my schedule when Summary Delivery is enabled, so that content can be delivered again.
11. As a signed-in User, I want configuration changes made near Summary Time to select only a future occurrence, so that a save does not trigger an accidental duplicate or stale send.
12. As a signed-in User, I want spring daylight-saving changes handled predictably, so that a nonexistent local Summary Time does not break future scheduling.
13. As a signed-in User, I want autumn daylight-saving changes to produce one scheduled summary, so that a repeated local time does not produce two emails.
14. As a signed-in User, I want future scheduling to remain correct after a daylight-saving transition, so that a UTC offset change does not permanently shift my local Summary Time.
15. As a signed-in User, I want the scheduled Daily Summary to use the same Summary Configuration as preview and test delivery, so that automatic output respects my choices.
16. As a signed-in User, I want scheduled delivery to use the same Summary Theme as preview and test delivery, so that automatic email does not look different.
17. As a signed-in User, I want scheduled delivery to keep Summary Sections in the fixed Weather, Commute, Calendar, Todo order, so that automatic output remains predictable.
18. As a signed-in User, I want scheduled delivery to use current Todo data, so that completed or reordered Todo Tasks are reflected at send time.
19. As a signed-in User, I want scheduled delivery to fetch Weather live, so that the forecast is current for Summary Time.
20. As a signed-in User, I want scheduled delivery to fetch Commute Estimates live only when the Commute Section qualifies, so that traffic information is current without wasting Maps usage.
21. As a signed-in User, I want scheduled delivery to fetch Calendar Events live from my Selected Calendars, so that the email reflects my current schedule.
22. As a signed-in User, I want disabled Summary Sections to skip their provider calls, so that disabled content cannot fail or consume provider usage.
23. As a signed-in User, I want one failed enabled section to appear as an Unavailable Section, so that I can still receive useful content from the other sections.
24. As a signed-in User, I want a Weather failure to leave Commute, Calendar, and Todo available, so that one provider does not discard the whole summary.
25. As a signed-in User, I want a Commute failure or protective Maps suspension to leave Weather, Calendar, and Todo available, so that Maps guardrails do not stop unrelated content.
26. As a signed-in User, I want a Calendar connection or provider failure to leave Weather, Commute, and Todo available, so that Calendar problems remain section-level.
27. As a signed-in User, I want an Unavailable Section rendered in both HTML and plain text output, so that failure information survives email fallback.
28. As a signed-in User, I want Daily to send a partially available summary when at least one section has qualifying content, so that useful content is not lost.
29. As a signed-in User, I want Daily not to send an email when no section has qualifying content, so that I do not receive empty or failure-only summaries.
30. As a signed-in User, I want a no-content skip to create no Delivery Record, so that delivery history represents actual email attempts.
31. As a signed-in User, I want a no-content skip to schedule the next occurrence, so that a quiet day does not disable future summaries.
32. As a signed-in User, I want overlapping worker invocations not to send the same scheduled occurrence twice, so that scheduler timing cannot duplicate email.
33. As a signed-in User, I want a repeated worker invocation to remain safe, so that an operator can rerun it after uncertainty.
34. As a signed-in User, I want a process interruption around provider submission not to create a second provider delivery, so that crash recovery remains idempotent where the provider supports idempotency keys.
35. As a signed-in User, I want a temporary email-provider failure retried briefly, so that a short outage does not immediately lose my summary.
36. As a signed-in User, I want no more than three total delivery attempts for one scheduled occurrence, so that retries remain bounded.
37. As a signed-in User, I want retries to stop 15 minutes after Summary Time, so that Daily does not send stale day-planning email.
38. As a signed-in User, I want configuration and permanent provider rejections not to be retried, so that repeated attempts do not repeat a known failure.
39. As a signed-in User, I want retries to preserve the original scheduled occurrence identity, so that one summary does not become multiple history entries.
40. As a signed-in User, I want the next day's schedule to remain independent of today's retry state, so that one failed occurrence does not shift my configured Summary Time.
41. As a signed-in User, I want a successful retry to mark the scheduled occurrence sent, so that history shows the final delivery outcome.
42. As a signed-in User, I want an exhausted or stale retry to mark the scheduled occurrence failed, so that history does not imply delivery is still pending.
43. As a signed-in User, I want scheduled Delivery Records visible with my test Delivery Records, so that I can understand recent email activity in one place.
44. As a signed-in User, I want delivery history to distinguish Scheduled from Test attempts, so that automated and manual activity are not confused.
45. As a signed-in User, I want delivery history to show the scheduled time and final status, so that I can tell what should have happened and when.
46. As a signed-in User, I want delivery history to show the number of attempts without exposing provider payloads, so that retry behavior is understandable and private.
47. As a signed-in User, I want delivery history limited to the existing recent-history window, so that scheduled delivery does not create an unlimited UI history surface.
48. As a signed-in User, I want Delivery Records not to store rendered HTML or plain text email, so that private summary snapshots are not retained.
49. As a signed-in User, I want Delivery Records not to copy Todo Tasks, Calendar Events, Weather forecasts, Commute Routes, or Commute Estimates, so that operational history stays metadata-only.
50. As a signed-in User, I want one User's scheduled failure not to stop another User's summary, so that delivery is isolated per User.
51. As a signed-in User, I want one slow User generation not to make another due User disappear from the run, so that due work remains independently processable.
52. As an Administrator, I want the worker invokable through a non-interactive command, so that cron or a systemd timer can run it every minute.
53. As an Administrator, I want normal per-User failures summarized without failing the whole worker process, so that one bad occurrence does not cause an endless scheduler-level failure.
54. As an Administrator, I want a top-level infrastructure failure to return a failing process status, so that the scheduler can report a broken worker run.
55. As an Administrator, I want each worker run to emit privacy-safe counts for due, sent, skipped, retrying, failed, and isolated-error outcomes, so that operation is observable.
56. As an Administrator, I want technical logs to exclude private User content and provider credentials, so that worker diagnostics follow Daily's privacy model.
57. As an Administrator, I want logs to identify occurrences with opaque technical identifiers rather than email addresses, so that troubleshooting does not expose Summary Recipients.
58. As an Administrator, I want due work queried in bounded batches, so that one worker invocation does not load all Users and private configuration into memory.
59. As an Administrator, I want a new deployment to initialize schedules for existing eligible Users, so that migration does not require every User to edit settings.
60. As a developer, I want scheduling calculations isolated behind a Temporal-based domain boundary, so that local-time and DST rules are deterministic.
61. As a developer, I want the worker to accept a controlled clock and provider boundaries, so that scheduling and delivery can be tested without real time or live services.
62. As a developer, I want due-User claiming and Delivery Record uniqueness enforced in SQLite, so that correctness does not depend on one process instance.
63. As a developer, I want scheduled generation to reuse the existing Daily Summary generation and renderer seams, so that preview, test delivery, and scheduled delivery do not drift.
64. As a developer, I want expected section-provider failures represented as typed unavailable outcomes, so that normal partial delivery does not depend on uncaught exceptions.
65. As a developer, I want retryability decided from stable delivery error classifications, so that the worker does not infer retry behavior from display messages.
66. As a developer, I want test delivery to remain immediate and non-retrying, so that manual tests do not unexpectedly repeat.
67. As a developer, I want automated tests to avoid live Resend, Google Calendar, Google Maps, and Open-Meteo calls, so that the worker suite remains deterministic and safe.
68. As a developer, I want Milestone 7 to avoid advanced queues, multi-region coordination, deployment automation, and long-lived retries, so that scheduled delivery remains a focused SQLite-backed workflow.

## Implementation Decisions

- Continue building within the existing single SvelteKit, Node, TypeScript, SQLite, Drizzle, Temporal, Better Auth, Resend, provider, and Daily Summary renderer application.
- Add a non-interactive worker command in the same application. It is designed to be invoked once per minute by cron or a systemd timer and must not be exposed as a public HTTP route.
- Add nullable `next_summary_at` scheduling state to each persisted User and store it as a UTC instant.
- A User is schedule-eligible only when Summary Delivery is enabled and at least one Summary Section is enabled. Store no next occurrence for an ineligible User.
- Calculate the next occurrence from Summary Time and User Time Zone with Temporal. The selected occurrence must be strictly after the calculation reference instant.
- Use Temporal-compatible disambiguation for daylight-saving transitions: move a nonexistent spring-forward local time to the first valid later instant and choose the earlier occurrence of a repeated fall-back local time. Always schedule the following day from local calendar time rather than adding 24 hours to the previous UTC instant.
- Recalculate `next_summary_at` after a scheduled occurrence is claimed or skipped and whenever Summary Time, User Time Zone, Summary Delivery, or Summary Section enablement changes.
- Initialize `next_summary_at` for existing eligible Users during migration or a one-time idempotent backfill using deployment-time current time. Leave ineligible Users unscheduled.
- Query due Users by `next_summary_at <= now` in stable, bounded batches. Claiming and subsequent work remain isolated per User.
- Treat the UTC value stored in `next_summary_at` as the scheduled occurrence identity before advancing it to the next local occurrence.
- Extend Delivery Records so a scheduled occurrence can retain its scheduled UTC instant, current processing or final status, attempt count, last attempt time, optional next retry time, provider identity, provider message id, privacy-safe provider status metadata, and stable error classification.
- Enforce one scheduled Delivery Record per User and scheduled UTC occurrence with a database uniqueness constraint. Test Delivery Records remain separate and retain their existing semantics.
- Generate the occurrence far enough to determine send eligibility before creating a Delivery Record. Duplicate workers may perform harmless duplicate generation, but only the invocation that atomically inserts the unique scheduled Delivery Record may submit email.
- Use an atomic, expiring processing claim when a worker handles a non-final scheduled Delivery Record. Another invocation may recover an expired claim, but it must reuse the same occurrence and provider idempotency key.
- Derive a stable provider idempotency key from the scheduled occurrence identity and reuse it for every retry where the delivery provider supports idempotency keys. Do not include an email address or private content in that key.
- A single scheduled Delivery Record represents the whole occurrence across initial delivery and retries. Retries update its attempt metadata and final outcome rather than adding another scheduled history row.
- Advance the User's `next_summary_at` independently of the current occurrence's retry state. Retry eligibility is driven by the scheduled Delivery Record, not by replacing the next daily occurrence.
- Build scheduled content through the existing Daily Summary input generation and renderer used by preview and test delivery.
- Load current User-owned Summary Configuration, Todo state, Weather Location, Commute setup, Calendar Connection, and Selected Calendars at generation time. Do not persist provider content snapshots for later retries.
- Before each retry, regenerate the Daily Summary from current provider and User data while retaining the original scheduled occurrence identity and retry deadline.
- Keep Summary Section enablement authoritative and skip provider calls for disabled sections.
- Convert expected Weather, Commute, Calendar, and other section-provider failures into the existing Unavailable Section representation. An unexpected failure in one section must be contained at the section boundary when safe output can still be produced.
- Send a partial Daily Summary when at least one enabled section produces qualifying content. Include concise Unavailable Section output for failed enabled sections alongside that content.
- An empty or unavailable section alone does not make a Daily Summary send-eligible. If every enabled section is empty, inapplicable, or unavailable, skip provider delivery, create no Delivery Record, and advance `next_summary_at`.
- Isolate errors at three levels: top-level worker infrastructure, per-User occurrence processing, and per-section generation. Continue processing other Users after a per-User or per-section failure.
- Once an actual scheduled attempt is claimed, record unexpected per-User failures with a stable privacy-safe classification. Do not store thrown messages that might contain provider or User content.
- Retry email delivery only for transient delivery classifications such as provider unavailability and retryable server responses. Do not retry missing configuration, validation failures, provider acceptance without a message id, authentication failures, or permanent provider rejection.
- Allow at most three total provider submissions for a scheduled occurrence, including the initial attempt.
- Allow retries only until 15 minutes after the original scheduled UTC instant. A retry that would begin after the deadline is not attempted and the Delivery Record becomes failed with a stale or retry-exhausted classification.
- The every-minute worker finds both new due Users and retryable scheduled Delivery Records whose next retry time is due. Retry timing should use a short deterministic backoff that fits all attempts inside the 15-minute window.
- Test delivery remains immediate, creates its existing Test Delivery Record, and is not included in scheduled retry automation.
- Treat a provider acceptance without a message id as a terminal failed delivery, consistent with existing test-delivery behavior.
- Keep the Summary Recipient as the signed-in User's verified Google email. Alternate recipients remain out of scope.
- Keep Delivery Records metadata-only. Never store rendered HTML, rendered plain text, section content, provider response bodies, Calendar Event content, Todo Task content, Weather forecasts, Commute locations or estimates, tokens, or credentials.
- Continue showing Delivery Records from the existing recent 30-day window. Extend the User-visible history to distinguish Scheduled and Test records and to show scheduled time, final or retrying status, completion time, and attempt count without private provider payloads.
- Emit structured privacy-safe worker diagnostics with opaque User or occurrence identifiers, timings, classifications, and aggregate counts. Do not log Summary Recipient email addresses or private summary content.
- Return a failing process exit status only when the worker cannot perform its top-level responsibilities, such as opening the database or querying due work. Expected skips, isolated User failures, and recorded provider failures are completed worker outcomes.
- Keep production systemd unit and timer definitions, VPS deployment automation, production backups, advanced Admin Panel delivery-health tooling, and operator log viewing for Milestone 8.

## Testing Decisions

- Tests should focus on externally visible worker outcomes and stable domain contracts rather than internal function calls, SQL statement shape, component structure, or live provider behavior.
- The primary and highest-value test seam is one worker invocation with a controlled clock, persisted eligible Users and Delivery Records, deterministic Daily Summary section providers, and a fake delivery provider. At this seam, verify due selection, generation, claim uniqueness, skip behavior, retry transitions, next scheduling, partial delivery, and isolation between Users.
- Use Vitest for the worker seam, Temporal scheduling rules, SQLite store behavior, Delivery Record state transitions, and privacy filters.
- Use one focused Playwright workflow for the User-visible history seam: a signed-in User sees Scheduled and Test Delivery Records, scheduled final status and attempt count, only within the existing 30-day history surface.
- Extend prior art from the existing Daily Summary preview generation, renderer, test-delivery action, Delivery Record store, Summary Configuration persistence, provider fakes, signed-in page tests, and Delivery Record history UI.
- Use deterministic clocks and Temporal instants. Tests must never wait for wall-clock minutes or depend on the machine time zone.
- Test next-occurrence calculation before, exactly at, and after Summary Time in multiple User Time Zones.
- Test a User Time Zone whose local date differs from the server's date.
- Test a nonexistent spring-forward Summary Time and verify it moves to the first valid later instant.
- Test a repeated fall-back Summary Time and verify exactly one earlier occurrence is selected.
- Test that the day after each daylight-saving transition returns to the configured local Summary Time.
- Test that recalculation always chooses an occurrence strictly after the reference instant and does not resend the just-processed local day.
- Test recalculation after Summary Time, User Time Zone, Summary Delivery, and Summary Section enablement changes.
- Test that disabling Summary Delivery or all Summary Sections clears scheduling and that re-enabling eligibility schedules the next future occurrence.
- Test migration or backfill behavior for existing eligible and ineligible Users and verify it is safe to run idempotently.
- Test due-User selection at the exact UTC boundary, below the boundary, above the boundary, and across bounded batches.
- Test that two concurrent or repeated worker invocations cannot claim or submit the same scheduled occurrence twice.
- Test that the stable scheduled occurrence identity and provider idempotency key are reused across retries without containing private identifiers.
- Test recovery from an interrupted processing state according to the claim policy without creating a second scheduled occurrence.
- Test that `next_summary_at` advances to the next correct local day after sent, failed, retrying, and skipped initial outcomes.
- Test that a current occurrence retry does not change the next day's configured occurrence.
- Test that scheduled generation reuses current Summary Configuration, Summary Theme, fixed section order, Todo state, Weather, Commute, Calendar, and renderer behavior.
- Test that disabled sections perform no provider calls.
- Test Weather, Commute, and Calendar failures separately and verify each becomes an Unavailable Section without failing qualifying unrelated sections.
- Test that a partial Daily Summary is delivered when at least one section has qualifying content.
- Test that no provider send and no Delivery Record occur when all enabled sections are empty, inapplicable, or unavailable.
- Test that a no-content skip still advances `next_summary_at`.
- Test that one User's configuration, provider, generation, database-write, or delivery failure does not stop another due User.
- Test retryable delivery failure followed by success and verify one scheduled Delivery Record, the expected attempt count, and a final sent status.
- Test three consecutive retryable failures and verify no fourth provider submission occurs.
- Test the 15-minute retry deadline independently from the maximum-attempt limit.
- Test permanent provider rejection, missing configuration, validation failure, and missing provider message id as non-retryable outcomes.
- Test that test delivery is never picked up by scheduled retry processing.
- Test Delivery Record uniqueness and scheduled state transitions against SQLite, including concurrent claims.
- Test that scheduled Delivery Records and worker logs exclude rendered HTML, plain text, Todo Task titles, Calendar Event content, Weather forecast content, Commute locations, raw provider payloads, Summary Recipient email, credentials, and tokens.
- Test top-level infrastructure failure as a failing process result and isolated recorded outcomes as a successful worker process result.
- Automated tests must use fake Resend, Weather, Calendar, and Maps boundaries and must not make live provider calls.

## Out of Scope

- VPS deployment automation.
- Production systemd service and timer unit installation.
- Production cron configuration management.
- Production SQLite backup automation.
- Pre-migration backup automation.
- Advanced queue systems such as Redis, BullMQ, RabbitMQ, or a managed job queue.
- Multi-region scheduling or distributed leader election beyond SQLite-backed idempotent claims.
- Sending a scheduled Daily Summary more than 15 minutes after Summary Time.
- Unlimited or operator-triggered replay of stale scheduled occurrences.
- Automatic retry of test Daily Summaries.
- Storing rendered Daily Summary HTML or plain text.
- Storing Weather forecast, Calendar Event, Commute Estimate, or rendered Todo snapshots for retries.
- Provider webhook processing for final delivery events.
- User-selectable retry policies.
- Alternate Summary Recipients.
- Digest frequencies other than daily.
- Per-section delivery schedules.
- User-facing manual replay of a failed scheduled occurrence.
- Advanced Admin Panel delivery-health dashboards and technical log viewing.
- Paid plans.
- Localization.

## Further Notes

- Milestone 7 completes the core automated product loop: saved User setup becomes a time-zone-correct Daily Summary delivered without manual action.
- The UI should remain in English and continue opening into the usable main Daily surface.
- The worker command belongs to Milestone 7, while production installation and verification of its systemd timer belong to Milestone 8.
- The 15-minute retry window and maximum of three total provider submissions intentionally favor timeliness over eventual delivery.
- SQLite uniqueness protects application-level claiming. A stable provider idempotency key closes the most important crash window when the email provider honors it; the system should document that provider-level guarantee rather than claim universal exactly-once delivery.
- A no-content skip is intentionally absent from Delivery Record history because no email submission was attempted. Privacy-safe aggregate logs may still count the skip.
- Unavailable Section output supports partial delivery, but a summary containing only unavailable or empty sections is not useful enough to send.
- The PRD uses the existing Daily domain language: User, Summary Recipient, Summary Configuration, Summary Time, User Time Zone, Summary Delivery, Summary Section, Daily Summary, Weather Section, Commute Section, Calendar Section, Todo Section, Unavailable Section, Delivery Record, Test Delivery Record, Scheduled Delivery Record, and Administrator.
