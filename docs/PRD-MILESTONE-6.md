# PRD: Milestone 6 - Google Maps and Commute

## Problem Statement

Daily can now persist signed-in User setup, generate live Weather and Calendar content, and send test Daily Summaries, but Commute still uses mock data. Visitors and signed-in Users cannot define real Commute Origins and Commute Destinations, manage their own Commute Routes, choose the weekdays on which commute information matters, or verify traffic-aware driving times in preview and test delivery.

Replacing mock Commute data with Google Maps introduces a different operational risk from the existing providers: every map-selection or route-estimate request can consume a shared paid quota. Without application-level usage accounting, configurable global caps, per-person abuse limits, and kill switches, a small service could incur uncontrolled cost. Without clear suspended and unavailable states, protective controls would also make Commute fail opaquely for Users and Administrators.

Milestone 6 must deliver useful live Commute Estimates while treating Google Maps cost control as part of the product contract. It should preserve Commute Route configuration, fetch current estimates only when needed, keep Visitor and User data appropriately scoped, and suspend quota-consuming calls safely whenever a limit or kill switch requires it.

## Solution

Add Google Maps-backed point selection and traffic-aware driving estimates for the Commute Section. A Visitor or signed-in User can create up to five User-named Commute Routes, choose a specific Commute Origin and Commute Destination for each route, enable or disable individual routes, and select shared Commute Days that default to Monday through Friday.

Visitor Commute Routes remain part of Local Setup in the browser and are imported through the existing first-sign-in flow when applicable. Signed-in User Commute Routes and Commute Days are stored in SQLite and scoped to that User. Preview and test delivery use the same Daily Summary generation path to fetch live Commute Estimates for enabled routes only when the Commute Section is enabled and the current local weekday is a Commute Day.

Route setup and estimate requests pass through one Google Maps usage gate. The gate applies a high per-person daily abuse limit, configurable global daily and monthly caps, an environment-level kill switch, and an Administrator-controlled SQLite kill switch. SQLite stores daily and monthly global usage totals and the state needed to issue one operator alert when a global cap is reached. The Admin Panel shows current usage, effective suspension state, and kill switch state without exposing private Commute Origins, Commute Destinations, or Commute Routes.

When Google Maps is unavailable, disabled, or suspended, Daily shows a clear unavailable state at the affected setup or Commute Section surface. Other Summary Sections and test delivery remain usable.

## User Stories

1. As a Visitor, I want to configure Commute Routes before signing in, so that I can evaluate the Commute experience as part of my Local Setup.
2. As a Visitor, I want my Commute Routes to persist in my browser, so that refreshing the application does not erase my setup.
3. As a Visitor, I want my Commute Days to persist in my browser, so that my Commute Section schedule survives a refresh.
4. As a Visitor, I want eligible Local Setup Commute Routes and Commute Days imported after my first Google sign-in, so that I do not need to configure them again.
5. As a returning User, I want my saved Commute setup to take precedence over Visitor Local Setup, so that signing in does not overwrite my existing data.
6. As a Visitor or signed-in User, I want to create a Commute Route with a name, Commute Origin, and Commute Destination, so that the route is recognizable and usable.
7. As a Visitor or signed-in User, I want to choose a specific map point as my Commute Origin, so that the estimate starts from the intended place.
8. As a Visitor or signed-in User, I want to choose a specific map point as my Commute Destination, so that the estimate ends at the intended place.
9. As a Visitor or signed-in User, I want map selection to show a readable place label, so that I can verify the selected point.
10. As a Visitor or signed-in User, I want Daily to store the selected point coordinates and display metadata needed for later estimates, so that route generation does not depend on repeating point selection.
11. As a Visitor or signed-in User, I want Commute Origins to remain separate from Weather Location, so that changing one does not silently change the other.
12. As a Visitor or signed-in User, I want Commute Destinations to remain separate from Weather Location, so that weather and route configuration have independent meaning.
13. As a Visitor or signed-in User, I want to name each Commute Route, so that multiple routes are easy to distinguish.
14. As a Visitor or signed-in User, I want Commute Route names to be validated, so that blank or unusably long names are not saved.
15. As a Visitor or signed-in User, I want to edit a Commute Route name, origin, and destination, so that I can keep a route current.
16. As a Visitor or signed-in User, I want to delete a Commute Route, so that obsolete routes no longer appear in my setup or summary.
17. As a Visitor or signed-in User, I want to keep up to five Commute Routes, so that I can model a small set of regular journeys.
18. As a Visitor or signed-in User, I want creation of a sixth Commute Route rejected clearly, so that the route limit is predictable.
19. As a Visitor or signed-in User, I want the five-route limit enforced by the trusted persistence boundary, so that it cannot be bypassed through concurrent or crafted requests.
20. As a Visitor or signed-in User, I want each Commute Route to have an enabled or disabled state, so that I can keep a route without including it in estimates.
21. As a Visitor or signed-in User, I want a newly created Commute Route to be enabled by default, so that it is immediately useful.
22. As a Visitor or signed-in User, I want disabled Commute Routes to remain editable, so that temporary exclusion does not discard configuration.
23. As a Visitor or signed-in User, I want disabled Commute Routes omitted from the Commute Section, so that the Daily Summary respects my route choices.
24. As a Visitor or signed-in User, I want disabled Commute Routes to avoid live estimate requests, so that they do not consume Google Maps usage.
25. As a Visitor or signed-in User, I want all enabled Commute Routes shown together, so that I can compare the journeys that matter that day.
26. As a Visitor or signed-in User, I want Commute Days configured once for the whole Commute Section, so that I do not maintain weekday rules per route.
27. As a Visitor or signed-in User, I want Commute Days to default to Monday through Friday, so that the normal workweek requires no extra setup.
28. As a Visitor or signed-in User, I want to add or remove any weekday from Commute Days, so that the Commute Section matches my schedule.
29. As a Visitor or signed-in User, I want Commute Day evaluation to use my User Time Zone, so that visibility follows my local weekday rather than server time.
30. As a Visitor or signed-in User, I want the Commute Section hidden on a day that is not a Commute Day, so that irrelevant commute information does not clutter the Daily Summary.
31. As a Visitor or signed-in User, I want the Commute Section hidden when there are no enabled Commute Routes, so that empty commute configuration does not create email clutter.
32. As a Visitor or signed-in User, I want the Commute Section omitted when its Summary Section toggle is disabled, so that Summary Configuration remains authoritative.
33. As a Visitor or signed-in User, I want estimate requests skipped when the Commute Section is disabled, so that disabled content does not consume Google Maps usage.
34. As a Visitor or signed-in User, I want estimate requests skipped on non-Commute Days, so that hidden content does not consume Google Maps usage.
35. As a Visitor or signed-in User, I want a traffic-aware driving Commute Estimate for every enabled route, so that the summary reflects current road conditions.
36. As a Visitor or signed-in User, I want Commute Estimates fetched when preview is generated, so that preview reflects current traffic.
37. As a signed-in User, I want Commute Estimates fetched when a test Daily Summary is generated, so that the delivered test reflects current traffic.
38. As a signed-in User, I want preview and test delivery to share Commute Section generation, so that their route behavior does not drift.
39. As a Visitor or signed-in User, I want each Commute Estimate displayed with its Commute Route name, so that I know which journey the duration describes.
40. As a Visitor or signed-in User, I want Commute output to work in both HTML and plain text, so that email fallback content remains useful.
41. As a Visitor or signed-in User, I want light and dark Summary Themes to apply to Commute output, so that Commute keeps the selected email style.
42. As a Visitor or signed-in User, I want Commute to remain in the fixed Summary Section order between Weather and Calendar, so that the Daily Summary stays predictable.
43. As a Visitor or signed-in User, I want a failed route estimate to produce a concise unavailable state rather than fail the whole Daily Summary, so that other sections remain useful.
44. As a Visitor or signed-in User, I want a protective Google Maps suspension to be explained as an unavailable state, so that I do not mistake it for missing route configuration.
45. As a Visitor or signed-in User, I want map point selection to fail clearly when Google Maps is unavailable or suspended, so that setup does not appear to save an invalid point.
46. As a Visitor or signed-in User, I want successful saved routes to remain intact during temporary Google Maps unavailability, so that provider failure does not erase configuration.
47. As a Visitor or signed-in User, I want Google Maps usage controls to apply consistently to map selection and estimate requests, so that no quota-consuming path bypasses protection.
48. As a Visitor or signed-in User, I want a high daily per-person usage limit, so that normal setup and preview use is practical while repeated abuse is stopped.
49. As a Visitor or signed-in User, I want exceeding my per-person daily limit to suspend only my further quota-consuming calls for that day, so that one person's activity does not directly block everyone else.
50. As an Administrator, I want configurable global daily and monthly Google Maps caps, so that service cost stays within the intended allowance.
51. As an Administrator, I want the monthly cap to constrain total free-tier consumption, so that usage cannot grow unchecked across the billing period.
52. As an Administrator, I want the daily cap to prevent rapid exhaustion of the monthly allowance, so that one busy day cannot consume the whole month.
53. As an Administrator, I want Google Maps calls suspended before they would exceed an applicable global cap, so that the application does not knowingly spend beyond its configured limit.
54. As an Administrator, I want global Google Maps usage stored in SQLite by daily and monthly period, so that restarts do not reset protective accounting.
55. As an Administrator, I want usage recorded for every quota-consuming Google Maps call admitted by the application, so that all protected call types share the same budget.
56. As an Administrator, I want Google Maps usage shown in the Admin Panel, so that I can compare current totals with configured caps.
57. As an Administrator, I want the Admin Panel to show whether Google Maps is active or suspended, so that I can understand current service behavior.
58. As an Administrator, I want the Admin Panel to show the reason for suspension, so that I can distinguish a daily cap, monthly cap, environment kill switch, Admin Panel kill switch, and provider failure.
59. As an Administrator, I want to enable or disable an SQLite-backed Google Maps kill switch from the Admin Panel, so that I can stop quota-consuming calls operationally.
60. As an Administrator, I want an environment-level Google Maps kill switch, so that a deployment operator can force suspension outside the application database.
61. As an Administrator, I want the environment-level kill switch to take precedence over the Admin Panel kill switch, so that the strongest operational override cannot be undone in the UI.
62. As an Administrator, I want the Admin Panel to make an active environment override visible without offering to clear it, so that control ownership is unambiguous.
63. As an Administrator, I want one operator alert when the global daily cap is reached for a daily period, so that I know Maps was suspended without receiving duplicate alerts.
64. As an Administrator, I want one operator alert when the global monthly cap is reached for a monthly period, so that I know the main allowance is exhausted without receiving duplicate alerts.
65. As an Administrator, I want alert state persisted, so that application restarts or concurrent requests do not send duplicate cap alerts.
66. As an Administrator, I want usage and suspension diagnostics to exclude Commute Origin, Commute Destination, Commute Route names, and rendered Daily Summary content, so that operating the service does not expose private User data.
67. As a developer, I want Google Maps requests behind a small provider boundary, so that automated tests can use deterministic fakes instead of live Google APIs.
68. As a developer, I want all quota-consuming Google Maps requests to pass through one atomic usage gate, so that caps and kill switches cannot diverge between call sites.
69. As a developer, I want Commute provider outcomes mapped into typed available or unavailable domain results, so that expected provider and guardrail states do not depend on uncaught errors.
70. As a developer, I want Milestone 6 to avoid scheduled delivery, non-driving travel modes, per-route weekday rules, estimate snapshot storage, and billing API integration, so that live driving Commute remains focused.

## Implementation Decisions

- Continue building within the existing SvelteKit, TypeScript, SQLite, Drizzle, Zod, Superforms, Tailwind, local component, Temporal, Better Auth, Resend, Calendar, Weather, and Daily Summary renderer stack.
- Replace mock Commute generation with a live Commute Section generation path used by both preview and test delivery.
- Keep Visitor Commute configuration in Local Setup browser storage and include it in the existing first-sign-in import only when the User has no saved setup.
- Persist signed-in User Commute Routes and Commute Days in SQLite and scope all reads and mutations to the current User.
- Model each Commute Route with a User-visible name, Commute Origin, Commute Destination, enabled state, and stable ordering metadata if the existing setup UI requires deterministic order.
- Model Commute Origin and Commute Destination as specific map points with coordinates and the minimal provider/display metadata needed to show and reuse the selection.
- Keep Weather Location independent from Commute Origin and Commute Destination. Do not infer or synchronize these values.
- Limit each Visitor Local Setup and signed-in User to five Commute Routes.
- Enforce the signed-in User route limit atomically at the trusted server persistence boundary, not only in the UI.
- New Commute Routes are enabled by default and can be disabled without deleting their saved points.
- Configure Commute Days once for the whole Commute Section rather than per Commute Route.
- Default Commute Days to Monday through Friday for new Local Setup and new User setup.
- Evaluate the current Commute Day with Temporal and User Time Zone.
- Treat the existing Commute Summary Section toggle as authoritative. When disabled, omit Commute output and skip estimate requests.
- Hide the Commute Section and skip estimate requests when the current local weekday is not a Commute Day.
- Hide the Commute Section and skip estimate requests when there are no enabled Commute Routes.
- Use Google Maps Platform for interactive point selection and traffic-aware driving estimates.
- Support driving estimates only. Do not expose public transit, walking, or cycling modes in this milestone.
- Fetch Commute Estimates live at Daily Summary generation time. Do not persist estimate snapshots or raw provider route responses.
- Request estimates only for enabled Commute Routes that qualify for the current Daily Summary generation.
- Extend Daily Summary input and rendering to represent one estimate per enabled Commute Route and concise unavailable Commute states in both HTML and plain text.
- Keep Commute in the fixed Summary Section order: Weather, Commute, Calendar, Todo.
- Keep Google Maps provider failures and protective suspensions section-level when a Daily Summary can otherwise be generated.
- Route map-selection and estimate calls through one server-controlled Google Maps usage gate before any quota-consuming provider request is made.
- The usage gate evaluates the environment kill switch, SQLite-backed Admin Panel kill switch, applicable per-person daily usage, global daily usage, and global monthly usage.
- The environment-level kill switch has the highest precedence and cannot be overridden from the Admin Panel.
- The SQLite-backed kill switch is writable only through the authorized Admin Panel surface.
- Apply a configurable high per-person daily abuse limit to Visitors and signed-in Users. Use privacy-conscious request attribution appropriate to each mode without exposing the attribution key in Admin Panel output or logs.
- A per-person limit suspends further quota-consuming calls for that person until the next daily period but does not change the global kill switch state.
- Apply configurable global daily and monthly caps shared by all quota-consuming Google Maps calls and all people.
- Define cap periods using one documented operational time basis consistently for accounting, display, resets, and alerts. User Time Zone does not determine global cap periods.
- Store global daily and monthly Google Maps usage counters in SQLite so accounting survives process restarts.
- Reserve or increment usage atomically before admitting a quota-consuming call so concurrent requests cannot cross a configured cap.
- Track usage by protected call category where useful for operations while enforcing one shared total budget.
- Do not decrement admitted usage merely because the provider later returns an error; the request may still have consumed provider quota.
- Suspend a call that would exceed a global cap and expose the effective suspended reason without making the provider request.
- Persist alert deduplication state and send at most one operator alert for each reached global cap and accounting period.
- Alert failure must not reopen Google Maps access or repeatedly retry on every blocked User request. It should remain observable through privacy-safe operational diagnostics.
- Extend the Admin Panel with current daily and monthly Google Maps usage, configured caps, effective active or suspended state, suspension reason, environment kill switch visibility, and SQLite kill switch control.
- Never show Commute Origins, Commute Destinations, Commute Route names, raw provider payloads, rendered Daily Summary content, or person-level usage identities in the Admin Panel.
- Keep technical logs free of private Commute configuration and provider payload content. Log only safe call categories, outcomes, counters, periods, and suspension reasons needed for operations.
- Validate all route, point, weekday, and Admin Panel kill switch mutations with shared schemas.
- Keep scheduled Daily Summary worker behavior, Maps billing API integration, alternative travel modes, per-route weekday rules, and estimate snapshot persistence out of scope.

## Testing Decisions

- Tests should focus on externally visible behavior and stable domain contracts rather than component internals, Google Maps implementation details, or live provider behavior.
- The highest-value test seam is Daily Summary generation: given Summary Configuration, Commute Routes, Commute Days, User Time Zone, provider outcomes, and usage-gate state, it should produce preview and test delivery output with the expected Commute Section while making only eligible provider calls.
- Use deterministic Google Maps provider fakes for point selection and traffic-aware route estimates. Automated tests must not call live Google Maps Platform.
- Use deterministic clocks and accounting periods for per-person limits, global daily caps, global monthly caps, resets, and alert deduplication.
- Use one high-level Playwright workflow for the main Commute journey: create map points through a deterministic map fixture, create and edit routes, enforce the five-route limit, change enabled routes and Commute Days, preview estimates, reload, and verify persistence.
- Extend the signed-in test-delivery workflow to verify that preview and test delivery use the same qualifying Commute Routes and provider-backed estimate shape.
- Test Visitor Local Setup persistence for Commute Routes and Commute Days.
- Test first-sign-in import of Visitor Commute Routes and Commute Days when the User has no saved setup.
- Test that existing User Commute configuration is not overwritten by Visitor Local Setup.
- Test signed-in User scoping so one User cannot read, change, or delete another User's Commute Routes or Commute Days.
- Test Commute Route validation for required name, valid Commute Origin, valid Commute Destination, enabled state, and supported coordinate bounds.
- Test create, edit, enable, disable, delete, and deterministic ordering behavior for Commute Routes.
- Test that no more than five Commute Routes can be persisted, including concurrent or crafted signed-in requests.
- Test that Commute Days default to Monday through Friday.
- Test every weekday selection and empty Commute Day selection.
- Test that Commute Day eligibility uses User Time Zone across a server-day boundary and a daylight-saving transition.
- Test that the Commute Section is omitted and no estimate call occurs when the Summary Section is disabled.
- Test that the Commute Section is omitted and no estimate call occurs on a non-Commute Day.
- Test that the Commute Section is omitted and no estimate call occurs when there are no enabled Commute Routes.
- Test that disabled Commute Routes remain persisted but do not appear in output and do not trigger estimates.
- Test that every enabled qualifying Commute Route produces a traffic-aware driving estimate labeled with its Commute Route name.
- Test that estimate results render in both HTML and plain text and remain in the fixed Summary Section order.
- Test that Google Maps provider failure produces a concise unavailable Commute state without failing Weather, Calendar, Todo, preview, or test delivery.
- Test that a point-selection provider failure prevents invalid point persistence and leaves existing valid route configuration unchanged.
- Test the central usage gate rather than duplicating cap logic tests at every provider adapter.
- Test that every quota-consuming map-selection and estimate path passes through the usage gate.
- Test that admitted calls atomically consume shared usage and rejected calls do not reach Google Maps.
- Test that provider errors after admission still count toward usage.
- Test per-person daily abuse limits independently for Visitors and signed-in Users without exposing private attribution data.
- Test that one person's daily limit does not directly suspend other people below their own limits or the global caps.
- Test global daily and monthly caps immediately below, exactly at, and beyond their boundaries.
- Test that daily and monthly counters survive application restart through SQLite persistence.
- Test daily and monthly period rollover using the documented operational time basis.
- Test that concurrent requests cannot admit more calls than a global cap permits.
- Test that the environment kill switch blocks all quota-consuming calls regardless of counters or SQLite kill switch state.
- Test that the SQLite-backed kill switch blocks all quota-consuming calls when the environment switch permits Maps.
- Test that an active environment kill switch cannot be cleared from the Admin Panel.
- Test that disabling both kill switches restores calls only when per-person and global caps also allow them.
- Test that a global daily cap sends one operator alert for that daily period.
- Test that a global monthly cap sends one operator alert for that monthly period.
- Test alert deduplication across concurrent requests and application restarts.
- Test that alert delivery failure does not admit blocked Maps calls or generate an alert storm.
- Test Admin Panel authorization for Google Maps usage visibility and kill switch mutation.
- Test that the Admin Panel displays counters, caps, effective state, and suspension reason without private Commute configuration or person-level identities.
- Test that technical logs and operational diagnostics exclude Commute Origin, Commute Destination, Commute Route names, raw provider payloads, and rendered content.
- Extend prior art from existing Local Setup import, User persistence, Summary Configuration, Weather provider, Calendar provider, Daily Summary preview, test delivery, renderer, Admin Panel authorization, and Playwright tests instead of introducing a parallel testing style.

## Out of Scope

- Public transit Commute Estimates.
- Walking Commute Estimates.
- Cycling Commute Estimates.
- User-selectable travel modes.
- Per-route Commute Days or weekday rules.
- Planned departure times per Commute Route.
- Scheduled Daily Summary worker.
- Cron or systemd timer setup.
- Scheduled Daily Summary delivery.
- Commute Estimate snapshot storage.
- Raw Google Maps route response storage.
- Google Maps billing API integration.
- Automatic synchronization with Google Maps billing data.
- Automatic cap changes based on billing data.
- More than five Commute Routes per Visitor or User.
- Sharing Commute Routes between Users.
- Route optimization or waypoint planning.
- Turn-by-turn navigation.
- Live map tracking or continuous location access.
- Reusing Weather Location as an implicit Commute Origin or Commute Destination.
- Database-managed Administrator roles.
- Paid plans.
- Localization.

## Further Notes

- Milestone 6 is both a live Commute milestone and a cost-safety milestone. Google Maps functionality is not complete unless all quota-consuming call paths are covered by the shared usage gate.
- The UI should remain in English and continue opening into the usable main Daily surface.
- Google Maps caps are application guardrails, not a source of truth for provider billing. Counters should be conservative because admitted requests may consume quota even when their responses fail.
- Exact per-person limits, global caps, alert destination, and accounting time basis remain deployment configuration, but their behavior and precedence are part of this PRD.
- A protective suspension should degrade only Maps-dependent surfaces. Existing saved configuration and unrelated Summary Sections remain available.
- The Admin Panel is an operational surface and must not become a way to inspect individual User or Visitor Commute data.
- The PRD uses the existing Daily domain language: Visitor, Local Setup, User, Summary Configuration, Summary Section, Daily Summary, Commute Section, Commute Day, Commute Route, Commute Origin, Commute Destination, Commute Estimate, User Time Zone, Unavailable Section, Administrator, and Admin Panel.
