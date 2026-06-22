# PRD: Milestone 1 - Walking Skeleton

## Problem Statement

Daily needs a first runnable version that proves the core product experience before any external services are connected. A Visitor should be able to open the application, understand the shape of the product, configure a Local Setup, manage Todo Tasks, adjust Summary Configuration, and preview the Daily Summary email they would eventually receive after Google sign-in.

Without this walking skeleton, later integrations with Better Auth, Google Calendar, Google Maps, Open-Meteo, Resend, and the scheduled worker would be built without a stable product surface, shared domain model, or tested rendering path.

## Solution

Build a SvelteKit application that runs locally and contains the core Daily interface, local Visitor state, Todo management, Summary Configuration, Daily Summary preview, email rendering, and a minimal Admin Panel shell.

The Milestone 1 application does not send emails, authenticate Users, connect Google Calendar, call Google Maps, fetch live weather, or run scheduled summaries. Instead, it proves the internal application flow with Demo Calendar data, mock Weather data, mock Commute data, local Todo data, and the real Daily Summary renderer for both HTML and plain text output.

The app should make the future product contract visible: every Summary Section is optional, Summary Delivery is configurable, Summary Sections appear in the fixed order Weather, Commute, Calendar, Todo, Todo Tasks and Calendar Events are separate, and a Daily Summary would only be sent later when a signed-in User has configured and enabled qualifying content.

## User Stories

1. As a Visitor, I want to open Daily without signing in, so that I can understand the product before granting Google access.
2. As a Visitor, I want the application to clearly show that sending a Daily Summary requires Google sign-in later, so that I understand why no email will be delivered yet.
3. As a Visitor, I want to create a Local Setup in my browser, so that I can try Daily before creating a User.
4. As a Visitor, I want my Local Setup to persist in the browser, so that refreshing the page does not erase my trial configuration.
5. As a Visitor, I want to edit Summary Time, so that I can model when my day starts.
6. As a Visitor, I want Summary Time to default to 07:00 while still being visibly editable, so that the default is clear but not restrictive.
7. As a Visitor, I want to choose a User Time Zone, so that the preview can calculate today and the Week Ahead using local dates.
8. As a Visitor, I want to choose a Summary Theme, so that I can preview either the light or dark Daily Summary email.
9. As a Visitor, I want the light Summary Theme to be selected by default, so that the initial preview is readable and conventional.
10. As a Visitor, I want to toggle Summary Delivery, so that I understand delivery is separate from section configuration.
11. As a Visitor, I want Summary Delivery to be enabled by default, so that the app reflects the normal future behavior.
12. As a Visitor, I want to enable or disable each Summary Section independently, so that I can choose which parts of the Daily Summary I would receive.
13. As a Visitor, I want Weather, Commute, Calendar, and Todo section toggles to be visible in the main panel, so that configuration is discoverable.
14. As a Visitor, I want disabled Summary Sections to be omitted from the Daily Summary preview, so that the preview matches my preferences.
15. As a Visitor, I want the Daily Summary preview to show Summary Sections in the fixed order Weather, Commute, Calendar, Todo, so that the preview matches the product contract.
16. As a Visitor, I want a Demo Calendar to appear before I connect a real Google Calendar in later milestones, so that I can understand the Calendar Section.
17. As a Visitor, I want the Demo Calendar to be clearly labeled as demo data, so that I do not confuse it with my own Calendar Events.
18. As a Visitor, I want Calendar Events to be shown separately from Todo Tasks, so that scheduled events and personal tasks do not blur together.
19. As a Visitor, I want the Calendar Section preview to show events for today and the Week Ahead, so that the summary demonstrates the planned Daily Summary structure.
20. As a Visitor, I want the Week Ahead to mean today plus the next six days, so that the date range is precise.
21. As a Visitor, I want mock Weather information in the preview, so that I can understand how the Weather Section will look before live weather exists.
22. As a Visitor, I want mock Commute information in the preview, so that I can understand how the Commute Section will look before Google Maps exists.
23. As a Visitor, I want Commute information to be hidden when the Commute Section is disabled, so that the preview respects section choices.
24. As a Visitor, I want to create Todo Tasks without assigning them to a Todo Category, so that I can keep simple loose tasks.
25. As a Visitor, I want Uncategorized Todo Tasks to appear before categorized Todo Tasks in the Daily Summary preview, so that loose tasks get first visibility.
26. As a Visitor, I want to create Todo Categories, so that I can group Todo Tasks like folders.
27. As a Visitor, I want to rename Todo Categories, so that category names can match how I organize my day.
28. As a Visitor, I want to delete a Todo Category only after confirming, so that I do not accidentally delete its Todo Tasks.
29. As a Visitor, I want deleting a Todo Category to delete the Todo Tasks in that category, so that category deletion has a clear and complete result.
30. As a Visitor, I want empty Todo Categories to remain visible in the app, so that I can prepare folders before adding tasks.
31. As a Visitor, I want empty Todo Categories to be hidden from the Daily Summary preview, so that the email stays minimal.
32. As a Visitor, I want to create Todo Tasks inside a Todo Category, so that related work stays grouped.
33. As a Visitor, I want to set each Todo Task urgency to low, medium, or high, so that I can indicate relative urgency.
34. As a Visitor, I want low urgency to show no visual mark, so that ordinary tasks stay quiet.
35. As a Visitor, I want medium urgency to show a yellow exclamation mark, so that it is visible without dominating the list.
36. As a Visitor, I want high urgency to show a red exclamation mark, so that urgent tasks stand out.
37. As a Visitor, I want urgency not to reorder Todo Tasks automatically, so that my manual ordering remains authoritative.
38. As a Visitor, I want to reorder Todo Tasks by dragging with the mouse, so that changing task order feels direct.
39. As a Visitor, I want task order to be independent within each Todo Category, so that every folder has its own order.
40. As a Visitor, I want Uncategorized Todo Tasks to have their own independent order, so that loose tasks are not mixed with category ordering.
41. As a Visitor, I want to move Todo Tasks between Todo Categories by dragging, so that reorganizing tasks is fast.
42. As a Visitor, I want to move Todo Tasks between a Todo Category and the uncategorized list by dragging, so that loose and categorized tasks can be managed naturally.
43. As a Visitor, I want a moved Todo Task to keep its title and urgency, so that moving only changes its grouping and order.
44. As a Visitor, I want to mark a Todo Task as complete, so that it disappears from the active Todo list.
45. As a Visitor, I want completed Todo Tasks not to be retained in the product surface, so that Daily stays focused on unfinished tasks.
46. As a Visitor, I want the Todo Section to be hidden from the Daily Summary preview when there are no active Todo Tasks, so that empty Todo does not create email clutter.
47. As a Visitor, I want Todo Tasks to have no due date, so that Todo remains separate from Calendar Events.
48. As a Visitor, I want Todo Tasks to have no creation date shown or used, so that task order is the only ordering mechanism.
49. As a Visitor, I want Todo Tasks to have only the information needed for the Daily Summary, so that the app stays simple.
50. As a Visitor, I want the Daily Summary preview to update when I change Todo Tasks, so that I can trust the preview.
51. As a Visitor, I want the Daily Summary preview to update when I change Summary Configuration, so that the preview reflects my choices immediately.
52. As a Visitor, I want to preview the HTML email, so that I can inspect the professional minimalist visual style.
53. As a Visitor, I want to preview the plain text email, so that I can verify the fallback content.
54. As a Visitor, I want the light and dark Summary Themes to affect the email preview, so that theme selection is meaningful.
55. As a Visitor, I want the email preview to use the same renderer that future email delivery will use, so that preview and delivery do not drift.
56. As a Visitor, I want the email preview to remain useful even when only one Summary Section is enabled, so that partial setups are supported.
57. As a Visitor, I want unavailable mock states to be representable in the preview, so that the design can handle future section failures.
58. As an Administrator, I want a minimal Admin Panel shell, so that the app has a reserved operational surface for later milestones.
59. As an Administrator, I want the Admin Panel shell not to expose private Visitor or User content, so that operational surfaces follow the privacy model from the start.
60. As a developer, I want a SQLite and Drizzle schema for the core domain, so that later persistence can build on typed relational structures.
61. As a developer, I want migrations to exist from the first milestone, so that schema changes are tracked intentionally.
62. As a developer, I want Summary Time and User Time Zone calculations to use Temporal, so that local-day behavior and daylight saving transitions are explicit.
63. As a developer, I want summary eligibility rules to be testable without external providers, so that optional Summary Sections are reliable.
64. As a developer, I want Todo ordering rules to be testable without browser drag events, so that the reorder model is protected.
65. As a developer, I want email rendering to be testable as pure HTML and text output, so that later Resend delivery can rely on it.
66. As a developer, I want the first UI workflows covered with Playwright, so that the walking skeleton remains runnable as integrations are added.
67. As a developer, I want the codebase to use local Svelte components and Tailwind, so that the UI can stay lightweight and consistent.
68. As a developer, I want forms validated with shared schemas, so that user-facing mutations follow one validation model.
69. As a developer, I want mock Weather, mock Commute, and Demo Calendar data to be clearly separated from future live providers, so that later milestones can replace providers without changing the UI contract.
70. As a developer, I want the Milestone 1 scope to avoid Google sign-in, Calendar, Maps, Open-Meteo, Resend, and scheduled workers, so that the first slice remains achievable and focused.

## Implementation Decisions

- Build Daily as a single full-stack TypeScript application using SvelteKit.
- Use Tailwind CSS and local Svelte components for the application interface.
- Use lucide icons where icon buttons or compact controls need recognizable symbols.
- Use SQLite as the first database target and Drizzle ORM for schema, migrations, and typed database access.
- Include core database structures for the domain even though Visitor Local Setup is stored in the browser during this milestone.
- Persist Visitor Local Setup in browser storage.
- Model Summary Configuration separately from content data.
- Summary Configuration includes Summary Time, User Time Zone, Summary Theme, Summary Delivery, and per-section Summary Section toggles.
- Summary Time defaults to 07:00 and is not constrained to morning-only choices.
- Summary Theme supports light and dark modes, with light as the default.
- Summary Delivery is enabled by default but does not send anything in Milestone 1.
- Summary Sections are optional and independently enabled or disabled.
- Summary Sections render in the fixed order Weather, Commute, Calendar, Todo.
- Todo Section is hidden from the Daily Summary preview when there are no active Todo Tasks.
- Todo Tasks are separate from Calendar Events and do not have due dates.
- Todo Tasks do not have descriptions, creation dates, or retained completed history.
- Completing a Todo Task removes it from active Todo surfaces.
- Todo Categories behave like folders and can be empty in the app.
- Empty Todo Categories are hidden from the Daily Summary preview.
- Uncategorized Todo Tasks are supported as first-class tasks outside any Todo Category.
- Uncategorized Todo Tasks appear before categorized Todo Tasks in the Daily Summary preview.
- Deleting a Todo Category requires user confirmation and deletes its contained Todo Tasks.
- Todo Categories have their own user-defined order.
- Todo Tasks have integer positions within their current grouping.
- Reordering a grouping renumbers integer positions after each drop.
- Moving a Todo Task between groupings updates its grouping and position without changing its title or urgency.
- Drag-and-drop Todo behavior uses `svelte-dnd-action`.
- Urgency values are low, medium, and high.
- Urgency does not influence ordering.
- Low urgency is represented without an urgency mark.
- Medium urgency is represented by a yellow exclamation mark.
- High urgency is represented by a red exclamation mark.
- Use Zod schemas and SvelteKit form handling for user-facing mutations and settings validation.
- Use Temporal for Summary Time, User Time Zone, local today, and Week Ahead calculations.
- Implement a real Daily Summary renderer as TypeScript template functions that return HTML and plain text.
- The in-app Daily Summary preview uses the same renderer that later scheduled and test delivery will use.
- Email rendering is independent from Svelte UI components because email markup has different constraints.
- Include light and dark email themes in both HTML rendering and preview.
- Include a clearly labeled Demo Calendar for the Calendar Section.
- Use mock Weather data in Milestone 1 instead of Open-Meteo.
- Use mock Commute data in Milestone 1 instead of Google Maps.
- Represent Unavailable Section states in the renderer and preview so future provider failures have a defined display.
- Include a minimal Admin Panel shell without live operational metrics.
- The Admin Panel shell must not expose private User or Visitor content.

## Testing Decisions

- Tests should focus on externally visible behavior and stable domain rules rather than internal component structure.
- Unit and integration tests use Vitest.
- End-to-end UI workflows use Playwright.
- Test Summary Time and User Time Zone behavior at the scheduling/eligibility seam using Temporal.
- Test that Summary Configuration determines whether a Daily Summary preview has qualifying content.
- Test that disabled Summary Sections are omitted from the preview.
- Test that enabled Summary Sections appear in the fixed order Weather, Commute, Calendar, Todo.
- Test that the Todo Section is hidden when no active Todo Tasks exist.
- Test that Uncategorized Todo Tasks appear before categorized Todo Tasks.
- Test that Todo Task order is independent per Todo Category and independent for the uncategorized grouping.
- Test that moving Todo Tasks between groupings preserves title and urgency while changing grouping and order.
- Test that urgency indicators render as no mark for low, yellow exclamation for medium, and red exclamation for high.
- Test that urgency changes do not reorder Todo Tasks.
- Test that deleting a Todo Category deletes contained Todo Tasks only after confirmation in the UI workflow.
- Test that completed Todo Tasks are removed from active Todo surfaces.
- Test that the email renderer returns both HTML and text output.
- Test that the renderer supports light and dark Summary Themes.
- Test that Demo Calendar, mock Weather, mock Commute, and Todo content render as separate Summary Sections.
- Test that Calendar Events and Todo Tasks remain separate in preview output.
- Test the main Visitor workflow: open app, create Local Setup, add Todo Categories and Todo Tasks, reorder by drag-and-drop, adjust Summary Configuration, and inspect the Daily Summary preview.
- Test that browser persistence keeps Local Setup after reload.
- Test that the Admin Panel shell is reachable only through the intended route surface and does not show private content.

## Out of Scope

- Google sign-in and Better Auth persistence.
- Automatic Local Setup import after Google sign-in.
- Google Calendar connection or OAuth calendar scopes.
- Selected Calendar management.
- Google Maps autocomplete, map point selection, usage caps, traffic estimates, and Commute Route persistence.
- Open-Meteo live forecasts.
- Resend email delivery.
- Test email sending.
- Delivery Records.
- Cron or systemd scheduled worker.
- Idempotent scheduled Daily Summary generation.
- VPS deployment automation.
- Production backup automation.
- Live Admin Panel operational metrics.
- Admin Google Maps usage controls.
- Paid plans.
- Localization.

## Further Notes

- Milestone 1 is intentionally a walking skeleton: it should establish the product shape and domain seams without external provider risk.
- The UI should be in English.
- The visual style should be professional, minimalist, and practical rather than marketing-oriented.
- The app should open into the usable main panel, not a landing page.
- The Daily Summary preview is a product-critical surface because it validates the future email output before Resend exists.
- The PRD uses the domain language from the Daily glossary and respects the ADRs already made for the first implementation slice.
