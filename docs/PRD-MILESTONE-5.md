# PRD: Milestone 5 - Google Calendar

## Problem Statement

Daily can now persist signed-in User setup, send test Daily Summaries, and generate live Weather content, but Calendar content is still demo-only. A Visitor can understand the Calendar Section through Demo Calendar data, yet a signed-in User cannot connect their own Google Calendar, choose which calendars should appear, or verify that preview and test delivery reflect real Calendar Events.

Without a real Google Calendar integration, Daily cannot prove one of its core product promises: a User's Daily Summary should summarize the day and Week Ahead from their own schedule while respecting their User Time Zone and privacy expectations. Later scheduled delivery would also be risky because Calendar consent, token failure handling, selected-calendar persistence, event filtering, and unavailable-state rendering would all remain untested.

Milestone 5 must connect signed-in Users to Google Calendar through a separate consent step after Google sign-in. It should fetch Calendar Events live during preview and test delivery, keep Visitor Demo Calendar clearly separate from real Calendar data, and avoid storing copied Calendar Event content.

## Solution

Add a Google Calendar connection flow for signed-in Users that requests Calendar read access only when the User explicitly connects Calendar. Google sign-in remains the identity step; Calendar consent is a separate provider connection step tied to the signed-in User.

After Calendar consent, Daily loads the User's Google calendar list, selects the primary Google calendar by default, and lets the User choose which calendars are included in the Calendar Section. The selected-calendar configuration is durable for signed-in Users and is scoped to the User. Daily fetches Calendar Events live from the selected calendars whenever it builds the Daily Summary preview or sends a test Daily Summary.

Calendar Events are grouped into Today and Week Ahead using the User Time Zone. All-Day Events render separately from timed events, declined Calendar Events are excluded, and unavailable Calendar states render as Calendar Section unavailable output instead of failing the whole Daily Summary. Visitor mode continues to use the clearly labeled Demo Calendar and never receives or stores real Google Calendar data.

## User Stories

1. As a Visitor, I want the Demo Calendar to remain visible in Visitor mode, so that I can understand Calendar output before signing in.
2. As a Visitor, I want the Demo Calendar to stay clearly labeled as demo data, so that I do not confuse it with real Google Calendar Events.
3. As a Visitor, I want Google Calendar connection to require sign-in first, so that real Calendar data is never requested from anonymous Local Setup.
4. As a Visitor, I want my Local Setup to avoid storing real Calendar data, so that Visitor mode stays browser-local and demo-only.
5. As a signed-in User, I want Google sign-in to remain separate from Google Calendar consent, so that creating an account does not automatically grant Calendar access.
6. As a signed-in User, I want to explicitly connect Google Calendar, so that I control when Daily receives Calendar read access.
7. As a signed-in User, I want the Calendar consent request to explain that Daily only needs read access, so that the permission request matches the product need.
8. As a signed-in User, I want a canceled Calendar consent flow to leave my account usable, so that declining Calendar access does not break Todo, Weather, preview, or test delivery.
9. As a signed-in User, I want failed Calendar consent to return me to a clear unavailable state, so that I know Calendar is not connected.
10. As a signed-in User, I want the app to remember that Calendar is connected, so that I do not reconnect on every visit.
11. As a signed-in User, I want Calendar connection state to be scoped to my User, so that another User cannot access or change my connection.
12. As a signed-in User, I want to disconnect Google Calendar, so that I can revoke Daily's Calendar use from the app surface.
13. As a signed-in User, I want disconnecting Calendar to remove stored Calendar provider tokens and selected-calendar configuration, so that Calendar access and settings are cleared together.
14. As a signed-in User, I want the Calendar Section configuration to show my available Google calendars, so that I can choose which schedules appear in the Daily Summary.
15. As a signed-in User, I want my primary Google calendar selected by default after first connection, so that the normal setup works without extra configuration.
16. As a signed-in User, I want non-primary calendars to be available for selection, so that shared or secondary calendars can be included when useful.
17. As a signed-in User, I want to include multiple Google calendars, so that my Daily Summary can reflect more than one schedule.
18. As a signed-in User, I want to exclude a Google calendar, so that noisy or irrelevant calendars do not appear in my Daily Summary.
19. As a signed-in User, I want selected-calendar changes to persist, so that reloads and future sessions keep my choices.
20. As a signed-in User, I want the selected-calendar list to use readable calendar names, so that I can understand what I am selecting.
21. As a signed-in User, I want selected-calendar metadata to refresh when my Google calendar list changes, so that renamed or removed calendars do not create confusing stale UI.
22. As a signed-in User, I want Calendar Section enablement to remain separate from Calendar connection, so that I can stay connected while temporarily hiding Calendar from the Daily Summary.
23. As a signed-in User, I want Daily to avoid Google Calendar event requests when the Calendar Section is disabled, so that disabled sections do not do provider work.
24. As a signed-in User, I want Daily to avoid Google Calendar event requests when no calendars are selected, so that my selection is respected.
25. As a signed-in User, I want the Daily Summary preview to use live Calendar Events, so that the preview reflects my current schedule.
26. As a signed-in User, I want test Daily Summary delivery to use live Calendar Events, so that the delivered test email matches what preview shows.
27. As a signed-in User, I want preview and test delivery to fetch Calendar Events at generation time, so that recent calendar edits are reflected without a sync job.
28. As a signed-in User, I want Daily to avoid storing copied Calendar Event content, so that private event details are not retained unnecessarily.
29. As a signed-in User, I want Delivery Records to avoid storing rendered Calendar content, so that delivery metadata does not retain private schedule details.
30. As a signed-in User, I want technical logs to avoid Calendar Event titles, descriptions, locations, attendees, and rendered summary content, so that operational diagnostics stay privacy-preserving.
31. As a signed-in User, I want Calendar Events grouped by Today and Week Ahead, so that the Daily Summary separates immediate schedule from upcoming schedule.
32. As a signed-in User, I want Today to use my User Time Zone, so that the Calendar Section matches my local day.
33. As a signed-in User, I want Week Ahead to use my User Time Zone, so that upcoming events are grouped by the dates I expect.
34. As a signed-in User, I want Week Ahead to mean today plus the next six local days, so that the date range is precise.
35. As a signed-in User, I want timed Calendar Events sorted by local start time, so that the Calendar Section is easy to scan.
36. As a signed-in User, I want All-Day Events shown separately from timed events, so that appointments and all-day commitments do not blur together.
37. As a signed-in User, I want multi-day All-Day Events represented on the relevant local days within the Week Ahead window, so that travel or time-off events remain visible.
38. As a signed-in User, I want declined Calendar Events excluded, so that events I am not attending do not clutter the Daily Summary.
39. As a signed-in User, I want canceled Calendar Events excluded, so that removed events do not appear in the Daily Summary.
40. As a signed-in User, I want Calendar Events from multiple selected calendars to remain distinguishable when useful, so that I can tell which calendar an event came from.
41. As a signed-in User, I want Calendar Event output to be concise, so that the Daily Summary remains scannable.
42. As a signed-in User, I want Calendar output to appear in the fixed Summary Section order, so that Weather, Commute, Calendar, and Todo stay predictable.
43. As a signed-in User, I want Calendar output to work in both HTML and plain text Daily Summary output, so that email fallback content remains useful.
44. As a signed-in User, I want light and dark Summary Themes to apply to Calendar output, so that Calendar does not create a separate visual style.
45. As a signed-in User, I want the Calendar Section omitted when Calendar is disabled, so that Summary Configuration is authoritative.
46. As a signed-in User, I want an empty selected-calendar result to render a useful empty Calendar state, so that I can distinguish "no events" from "Calendar failed."
47. As a signed-in User, I want missing Calendar consent to render a useful Calendar unavailable state when Calendar is enabled, so that setup problems are visible.
48. As a signed-in User, I want expired or revoked Calendar tokens to render a useful unavailable state, so that I know I need to reconnect.
49. As a signed-in User, I want Google Calendar provider failures to render a useful unavailable state, so that Todo, Weather, and other sections can still render.
50. As a signed-in User, I want partial calendar-list failures to avoid corrupting my saved selected calendars, so that temporary Google failures do not erase setup.
51. As a signed-in User, I want Calendar unavailable states to affect only the Calendar Section, so that the rest of the Daily Summary can still be previewed or sent.
52. As a signed-in User, I want test Daily Summary delivery to continue when Calendar is unavailable but the delivery provider accepts the email, so that provider failures remain section-level where possible.
53. As a signed-in User, I want delivery provider failures to remain Delivery Record failures, so that Calendar provider failures and email provider failures are not conflated.
54. As a signed-in User, I want Calendar connection status to be visible near Calendar Section configuration, so that I can understand whether Calendar is ready.
55. As a signed-in User, I want Calendar configuration controls to be hidden or disabled until Calendar is connected, so that I do not configure non-existent calendars.
56. As a signed-in User, I want Calendar selection changes to update preview output, so that I can verify the selected-calendar effect immediately.
57. As a signed-in User, I want Calendar data to stay separate from Todo Tasks, so that scheduled events and personal tasks remain different concepts.
58. As a signed-in User, I want Calendar Events to avoid becoming Todo Tasks, so that Calendar read access does not create task data.
59. As an Administrator, I want Calendar provider failures to be observable through safe diagnostics, so that operational issues can be investigated without exposing private event content.
60. As an Administrator, I want Milestone 5 to avoid scheduled Calendar sync jobs, so that the operational model remains generation-time fetching.
61. As an Administrator, I want Calendar integration to avoid Calendar write access, so that Daily cannot modify User calendars.
62. As a developer, I want a clear Calendar Connection domain model, so that consent, token availability, provider scopes, and User ownership are explicit.
63. As a developer, I want selected calendars modeled separately from Calendar Events, so that durable configuration is not confused with live private content.
64. As a developer, I want Calendar provider requests behind a small boundary, so that automated tests can use deterministic fakes instead of live Google.
65. As a developer, I want event mapping to be a pure domain seam, so that Google Calendar API payloads become stable Daily Calendar Section data before rendering.
66. As a developer, I want Calendar date grouping to use Temporal and User Time Zone, so that local-day and daylight-saving behavior is explicit.
67. As a developer, I want declined-event filtering to be tested before rendering, so that private event payload details do not leak into template tests.
68. As a developer, I want preview and test delivery to share Calendar Section generation, so that sent email and preview do not drift.
69. As a developer, I want Calendar unavailable outcomes to be typed domain results, so that normal provider failure states do not depend on thrown errors.
70. As a developer, I want Milestone 5 to avoid Google Maps, Calendar writes, Calendar sync jobs, and scheduled worker behavior, so that the Calendar read integration stays focused.

## Implementation Decisions

- Continue building within the existing SvelteKit, TypeScript, SQLite, Drizzle, Zod, Superforms, Tailwind, local component, Temporal, Better Auth, Resend, and Daily Summary renderer stack.
- Keep Google sign-in as the identity step and add Google Calendar consent as a separate signed-in User action.
- Request only read-oriented Google Calendar scopes for Calendar access; do not request Calendar write scopes.
- Model Calendar Connection as a User-owned provider connection with consent state, granted scopes, access token availability, refresh token availability, token expiry metadata, and provider account identity where needed.
- Store Calendar provider tokens only as connection credentials. Do not store copied Calendar Event content, rendered Calendar output, provider event payloads, event descriptions, event locations, or attendee lists as durable application data.
- Support disconnecting Google Calendar by clearing Calendar Connection credentials and selected-calendar configuration for the User.
- Treat missing, expired, revoked, or unusable Calendar credentials as Calendar unavailable states rather than global app failures.
- Use refresh tokens when available to recover from expired access tokens. If refresh fails, mark Calendar unavailable and guide the User to reconnect.
- Add a User-owned Selected Calendar configuration separate from Summary Configuration.
- Load the Google calendar list after successful Calendar consent and when the Calendar configuration surface needs current calendar metadata.
- Select the primary Google calendar by default on first successful Calendar connection when the User has no existing selected-calendar configuration.
- Persist selected Google calendar ids and lightweight display metadata needed for configuration UI. Event content remains live-only and is not persisted.
- Let Users include or exclude calendars independently from the existing Calendar Summary Section toggle.
- Keep Calendar Summary Section enablement in Summary Configuration authoritative: disabled Calendar means Calendar output is omitted and provider event fetches are skipped.
- If Calendar is enabled but Calendar is not connected, render a Calendar unavailable state with a setup-oriented reason.
- If Calendar is enabled but no calendars are selected, render a useful empty Calendar state and avoid event fetches.
- Fetch Calendar Events live from selected calendars when building Daily Summary preview and test Daily Summary delivery.
- Do not add Calendar sync jobs, background event cache refresh, or scheduled Daily Summary worker behavior in this milestone.
- Use the same Calendar Section generation path for preview and test delivery so that the in-app preview and sent test email do not drift.
- Keep Visitor Calendar behavior demo-only. Visitors continue to see the clearly labeled Demo Calendar and cannot connect real Google Calendar data.
- Never import Demo Calendar data into User Calendar Connection or Selected Calendar configuration.
- Extend Daily Summary input generation to accept generated Calendar Section data instead of always using Demo Calendar data.
- Extend the Calendar Section renderer shape enough to represent Today, Week Ahead, All-Day Events, timed events, empty states, and unavailable states in both HTML and plain text output.
- Keep Calendar output inside the existing fixed Summary Section order: Weather, Commute, Calendar, Todo.
- Use User Time Zone and Temporal for Today, Week Ahead, local event start times, local event end times, and all-day date calculations.
- Define Week Ahead as the User's local today plus the next six local days.
- Group timed Calendar Events by the local date of their start time.
- Sort timed Calendar Events within a day by local start time.
- Render All-Day Events separately from timed events within each local day.
- Represent multi-day All-Day Events on each covered local date inside the Today and Week Ahead window.
- Exclude declined Calendar Events from Calendar Section output.
- Exclude canceled Calendar Events from Calendar Section output.
- Keep Calendar Events and Todo Tasks separate throughout the domain model, UI, Daily Summary input, and renderer.
- Calendar provider failures should produce Calendar unavailable section output and should not fail the entire Daily Summary preview or test delivery by themselves.
- Delivery provider failures remain Delivery Record failures. Calendar provider failures remain Calendar Section unavailable states when an email can still be generated.
- Delivery Records continue to store delivery metadata only and must not store rendered Calendar content or copied Calendar Event content.
- Keep technical logs free of Calendar Event titles, descriptions, locations, attendees, rendered Daily Summary content, raw provider payloads, and provider tokens.
- Keep Google Maps commute estimates, Calendar write access, Calendar event editing, scheduled delivery, and Calendar sync jobs out of scope.

## Testing Decisions

- Tests should focus on externally visible behavior and stable domain contracts rather than implementation details, component internals, or live provider behavior.
- The highest-value test seam is Daily Summary generation for a signed-in User with Calendar consent and selected calendars: given Summary Configuration, Selected Calendar configuration, Calendar provider responses, Weather state, Todo state, and User Time Zone, it should produce preview and test delivery output with the expected Calendar Section.
- Use one high-level Playwright workflow for the main Calendar journey: sign in through the deterministic auth path, connect Calendar through a deterministic consent fixture, verify the primary calendar is selected by default, change selected calendars, preview live Calendar output, reload, and verify selection persistence.
- Do not call live Google Calendar in automated tests. Use deterministic Calendar provider fakes or fixtures at the provider boundary.
- Use Vitest for Calendar Connection state, token expiry handling, refresh failure outcomes, disconnect behavior, and User scoping.
- Use Vitest for Selected Calendar persistence, default primary-calendar selection, removed calendar handling, and selected-calendar updates.
- Use Vitest for Google calendar-list mapping into configuration metadata without storing event content.
- Use Vitest for Google Calendar Event mapping into Daily Calendar Section data before rendering.
- Test that Calendar Event content is fetched live for preview and test delivery and is not written as durable copied event content.
- Test that selected calendars are scoped to the current User and cannot be read or changed by another User.
- Test that Calendar provider tokens are cleared on disconnect.
- Test that Calendar event fetches are skipped when the Calendar Summary Section is disabled.
- Test that Calendar event fetches are skipped when Calendar is enabled but no calendars are selected.
- Test that missing Calendar consent produces a Calendar unavailable state when Calendar is enabled.
- Test that expired access tokens use refresh credentials when available.
- Test that failed token refresh produces a Calendar unavailable state and does not fail unrelated sections.
- Test that Google Calendar provider failures produce Calendar unavailable output rather than failing the whole preview.
- Test that Calendar unavailable output can still be sent in a test Daily Summary when the delivery provider accepts the email.
- Test that delivery provider failures continue to create failed Delivery Records through the existing delivery behavior.
- Test that Delivery Records do not store rendered Calendar content, copied Calendar Event content, or raw provider payloads.
- Test that declined Calendar Events are excluded from Calendar output.
- Test that canceled Calendar Events are excluded from Calendar output.
- Test that Today and Week Ahead grouping uses User Time Zone rather than server time.
- Test that Week Ahead covers local today plus the next six local days.
- Test that timed Calendar Events are sorted by local start time.
- Test that All-Day Events render separately from timed events.
- Test that multi-day All-Day Events appear on each covered local day inside the Week Ahead window.
- Test that Calendar Events from multiple selected calendars are included and remain distinguishable when labels are needed.
- Test that an empty selected-calendar result renders a useful empty Calendar state rather than an unavailable state.
- Test that Calendar output appears in the existing fixed Summary Section order.
- Test that HTML preview and plain text output both include Calendar output when provider data is available.
- Test that light and dark Summary Themes continue to apply to Calendar output.
- Test that Visitor mode continues to show clearly labeled Demo Calendar data and does not expose real Calendar connection controls.
- Test that Demo Calendar data is never imported into User Calendar Connection or Selected Calendar configuration.
- Extend prior art from existing Summary Configuration, Daily Summary preview, Daily Summary renderer, test delivery, Delivery Record, User persistence, Weather provider, and Playwright workflow tests instead of introducing a parallel testing style.

## Out of Scope

- Storing copied Calendar Event content.
- Storing rendered Calendar email content.
- Calendar sync jobs.
- Background Calendar event cache refresh.
- Scheduled Daily Summary worker.
- Cron or systemd timer setup.
- Scheduled delivery generation.
- Delivery retry automation.
- Google Maps commute estimates.
- Google Maps location selection.
- Calendar write access.
- Calendar Event creation.
- Calendar Event editing.
- Calendar Event deletion.
- Calendar attendee management.
- Google Calendar push notifications or webhooks.
- Full calendar search.
- Importing Calendar Events into Todo Tasks.
- Alternate calendar providers.
- Paid plans.
- Localization.

## Further Notes

- Milestone 5 is the first live private schedule-data milestone, so privacy boundaries matter as much as rendering behavior.
- The UI should remain in English and should continue opening into the usable main Daily surface.
- Calendar consent must stay visibly separate from Google sign-in because Milestone 2 intentionally avoided Calendar scopes during account creation.
- Visitor Demo Calendar should continue to be useful as a product demonstration but must never look like connected User data.
- Google Calendar data is intentionally fetched at generation time rather than copied into Daily storage, matching the existing ADR.
- The PRD uses the existing Daily domain language: Visitor, Local Setup, User, Summary Configuration, Summary Delivery, Summary Section, Daily Summary, Calendar Section, Demo Calendar, Calendar Event, All-Day Event, Selected Calendar, User Time Zone, Delivery Record, Summary Theme, Administrator, and Admin Panel.
