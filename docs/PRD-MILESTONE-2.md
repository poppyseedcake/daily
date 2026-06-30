# PRD: Milestone 2 - Accounts and Persistence

## Problem Statement

Daily currently proves the core product experience for a Visitor, but that setup lives only in the browser. A person can configure Summary Configuration, manage Todo Tasks, and preview a Daily Summary, but they cannot yet become a User whose setup is durable across devices, sessions, browser storage resets, or later email delivery.

Without accounts and persistence, later milestones cannot safely add test delivery, live Weather, Google Calendar, Google Maps, or scheduled Daily Summaries. Those features require a stable User identity, server-side sessions, durable Summary Configuration, durable Todo data, a verified Summary Recipient, and a privacy-preserving Administrator access model.

Milestone 2 must turn the walking skeleton into a real persistent application while keeping the no-friction Visitor path intact. A Visitor should still be able to explore Daily without signing in, and signing in should preserve useful Local Setup work instead of forcing the User to start over.

## Solution

Add Google sign-in with Better Auth, server-side sessions, and SQLite-backed persistence through Drizzle. A signed-in User can keep Summary Configuration, Todo Categories, Uncategorized Todo Tasks, Todo Tasks, urgency, and ordering in the database. The User's verified Google email becomes the Summary Recipient for future Daily Summary delivery, even though actual email delivery remains out of scope for this milestone.

Visitor mode remains available. A Visitor continues to store Local Setup in browser storage and can interact with the same core Daily surface before signing in. After Google sign-in, Daily automatically imports the Visitor's valid Local Setup into the User only when that User has no existing saved setup. Returning Users with existing saved setup must not be overwritten by browser Local Setup.

The application becomes auth-aware: navigation, status messaging, persistence behavior, and the Admin Panel all respond to whether the person is a Visitor, a signed-in User, or an Administrator. Administrator access is limited to deployment-configured verified Google email addresses and does not expose private User content.

## User Stories

1. As a Visitor, I want to continue opening Daily without signing in, so that I can evaluate the product before granting Google access.
2. As a Visitor, I want Visitor mode to remain visibly labeled, so that I understand my setup is local to this browser.
3. As a Visitor, I want Local Setup to keep saving in browser storage, so that refreshing the page does not erase my exploratory setup.
4. As a Visitor, I want to see a Google sign-in action from the main Daily surface, so that I can turn my Local Setup into a durable User setup when ready.
5. As a Visitor, I want clear messaging that sign-in is required before Daily Summaries can be sent, so that I understand the boundary between preview and future delivery.
6. As a Visitor, I want the app to avoid asking for Google Calendar permissions during sign-in, so that the first account step asks only for identity.
7. As a Visitor, I want failed Google sign-in to return me to Visitor mode without losing Local Setup, so that an auth problem does not erase my work.
8. As a Visitor, I want a canceled Google sign-in to return me to the same Visitor experience, so that I can keep exploring without penalty.
9. As a Visitor, I want my Summary Configuration to be eligible for import after sign-in, so that my Summary Time, User Time Zone, Summary Theme, Summary Delivery, and Summary Section toggles are preserved.
10. As a Visitor, I want my Todo Categories to be eligible for import after sign-in, so that my folder-like organization is preserved.
11. As a Visitor, I want my Uncategorized Todo Tasks to be eligible for import after sign-in, so that loose tasks are not lost.
12. As a Visitor, I want my categorized Todo Tasks to be eligible for import after sign-in, so that grouped work is not lost.
13. As a Visitor, I want Todo Task urgency to be preserved after sign-in, so that urgent work stays visually distinct.
14. As a Visitor, I want Todo Task ordering to be preserved after sign-in, so that my manual order remains authoritative.
15. As a Visitor, I want Todo Category ordering to be preserved after sign-in, so that my group order remains stable.
16. As a Visitor, I want Local Setup import to ignore Demo Calendar data, so that sample Calendar Events do not become User data.
17. As a Visitor, I want Local Setup import to ignore mock Weather and mock Commute output, so that provider placeholder data does not become User data.
18. As a Visitor, I want invalid Local Setup to be ignored safely during import, so that corrupt browser data does not create broken User data.
19. As a Visitor, I want unsupported Local Setup versions to be ignored safely during import, so that future schema changes do not corrupt persistence.
20. As a Visitor, I want sign-in to import Local Setup automatically when I have no saved setup, so that I do not need an extra migration step.
21. As a Visitor, I want the app to confirm that my setup is now saved to my User after import, so that I know the sign-in had an effect.
22. As a Visitor, I want browser-only status messaging to change after sign-in, so that I know whether changes are local or durable.
23. As a User, I want to sign in with my Google account, so that Daily can remember my setup.
24. As a User, I want Daily to identify me by my Google account identity, so that returning sign-ins load the same User setup.
25. As a User, I want my verified Google email to be used as my Summary Recipient, so that future Daily Summaries go to the email I signed in with.
26. As a User, I want my Summary Recipient to update from verified Google profile data when appropriate, so that future delivery uses my current Google email.
27. As a User, I want to sign out, so that I can stop using Daily as my signed-in User on a shared device.
28. As a signed-out person, I want sign-out to return me to Visitor mode, so that the app remains usable without an account.
29. As a User, I want my Summary Configuration to persist in SQLite, so that changing browsers or refreshing the page does not reset it.
30. As a User, I want Summary Time changes to persist, so that Daily remembers when my day starts.
31. As a User, I want User Time Zone changes to persist, so that today and the Week Ahead continue to use my chosen local dates.
32. As a User, I want Summary Theme changes to persist, so that the Daily Summary preview keeps my visual preference.
33. As a User, I want Summary Delivery state to persist, so that delivery readiness remains under my control.
34. As a User, I want Summary Section toggles to persist, so that Weather, Commute, Calendar, and Todo choices remain stable.
35. As a User, I want Summary Configuration validation to match Visitor mode validation, so that signing in does not change what values are allowed.
36. As a User, I want Todo Categories to persist in SQLite, so that my folders survive across sessions.
37. As a User, I want Todo Category renames to persist, so that changes to organization are durable.
38. As a User, I want Todo Category deletion to persist, so that deleted categories and their Todo Tasks do not reappear.
39. As a User, I want Todo Category order to persist, so that the app and Daily Summary preview remain consistent after reload.
40. As a User, I want Uncategorized Todo Tasks to persist, so that loose tasks remain available across sessions.
41. As a User, I want categorized Todo Tasks to persist, so that grouped tasks remain available across sessions.
42. As a User, I want Todo Task title edits to persist, so that corrections survive reload.
43. As a User, I want Todo Task urgency changes to persist, so that urgency markers remain stable.
44. As a User, I want Todo Task completion to persist as removal from the active Todo surface, so that finished tasks do not return.
45. As a User, I want Todo Task order within each grouping to persist, so that manual ordering is not lost.
46. As a User, I want moving Todo Tasks between categories to persist, so that reorganization survives reload.
47. As a User, I want moving Todo Tasks between a Todo Category and the uncategorized list to persist, so that loose and grouped work stay where I put them.
48. As a User, I want the Daily Summary preview to use my persisted setup, so that the preview reflects what future delivery will use.
49. As a User, I want the Daily Summary preview to keep using Demo Calendar, mock Weather, and mock Commute data until live providers exist, so that the preview remains useful in this milestone.
50. As a User, I want the app to avoid storing Calendar Event content in this milestone, so that Calendar remains a later explicit consent step.
51. As a User, I want the app to avoid storing Weather Location or Commute Routes in this milestone, so that live provider setup remains scoped to later milestones.
52. As a User, I want a returning sign-in to load my existing saved setup, so that my account is durable.
53. As a returning User, I want browser Local Setup not to overwrite existing saved setup, so that a shared or stale browser cannot destroy my account data.
54. As a returning User, I want the app to tell me when Local Setup import was skipped because saved setup already exists, so that the behavior is understandable.
55. As a User, I want database writes to be atomic when importing Local Setup, so that I never get only half of my setup saved.
56. As a User, I want failed import writes to leave my account setup unchanged, so that errors do not create inconsistent data.
57. As a User, I want invalid imported Todo Task category references to be rejected, so that my persisted Todo data remains coherent.
58. As a User, I want generated User-side ids to be distinct from browser Local Setup ids, so that imported data cannot collide with existing database records.
59. As a User, I want all persisted setup queries to be scoped to my User, so that another User cannot read or change my setup.
60. As a User, I want signing out and signing back in to restore the same persisted setup, so that sessions behave predictably.
61. As a User, I want auth session expiry to return me to a clear signed-out state, so that stale sessions do not create confusing behavior.
62. As a User, I want changes made while signed in to be saved server-side rather than only in browser storage, so that database state is the source of truth for Users.
63. As a User, I want the app to avoid private content in technical logs, so that my Todo data and Summary Configuration are not exposed operationally.
64. As a User, I want account identity and sessions to be stored securely, so that Daily can safely recognize returning Users.
65. As a User, I want CSRF and session protections to be handled by the auth layer, so that form-based account actions are not fragile.
66. As an Administrator, I want to sign in with Google, so that Admin Panel access is tied to verified identity.
67. As an Administrator, I want Admin Panel access to be controlled by a deployment-configured verified Google email allowlist, so that access can be managed without building database roles.
68. As an Administrator, I want non-allowlisted Users to be blocked from the Admin Panel, so that private operational controls are restricted.
69. As an Administrator, I want unauthenticated Visitors to be redirected or blocked from the Admin Panel, so that the Admin Panel is not public.
70. As an Administrator, I want the Admin Panel to keep showing only operational shell data in this milestone, so that no private User content is exposed.
71. As an Administrator, I want Admin Panel messaging to identify when I am signed in but not authorized, so that access failures are clear.
72. As a developer, I want Better Auth integrated with the existing SvelteKit application, so that authentication stays in the same TypeScript codebase.
73. As a developer, I want Better Auth to use the SQLite and Drizzle persistence stack, so that auth and application data share one deployment model.
74. As a developer, I want User identity, Summary Configuration, Todo Categories, and Todo Tasks to have explicit persistence boundaries, so that later provider features can attach to stable User data.
75. As a developer, I want Local Setup import to be represented as a validated draft before persistence, so that browser data is sanitized before database writes.
76. As a developer, I want Local Setup import persistence to use a transaction, so that summary and Todo data are saved together.
77. As a developer, I want app mutations to share validation schemas between Visitor and User modes where possible, so that the two modes do not drift.
78. As a developer, I want a single current setup shape for preview rendering, so that Visitor and User previews remain behaviorally equivalent.
79. As a developer, I want auth-aware route loading to be testable without calling live Google, so that CI can cover account behavior deterministically.
80. As a developer, I want database schema tests to protect required tables, relationships, defaults, and cascades, so that persistence changes are intentional.
81. As a developer, I want persistence mapping tests to protect Todo ordering and urgency defaults, so that database row order does not leak into product behavior.
82. As a developer, I want end-to-end tests for the Visitor-to-User Local Setup flow, so that the most important milestone transition remains covered.
83. As a developer, I want end-to-end tests for returning Users, so that existing saved setup is never overwritten by Local Setup.
84. As a developer, I want end-to-end tests for Admin Panel allowlist behavior, so that authorization is enforced at the route boundary.
85. As a developer, I want Milestone 2 to avoid delivery, live providers, and scheduling, so that account persistence can become stable before external services add complexity.

## Implementation Decisions

- Continue building Daily as a single full-stack TypeScript application with SvelteKit.
- Add Better Auth for Google sign-in, sessions, and Google account linking.
- Use Google sign-in only for identity in this milestone; do not request Google Calendar scopes.
- Use SQLite as the primary persistence store and Drizzle for schema, migrations, and typed database access.
- Store auth state, User identity, Summary Configuration, Todo Categories, and Todo Tasks in the server-side persistence layer.
- Treat the Google account subject as the durable identity key for a User.
- Treat the verified Google email as the Summary Recipient for future Daily Summary delivery.
- Keep Summary Recipient read-only in this milestone; alternate recipients are out of scope.
- Keep Visitor mode fully available without sign-in.
- Keep Visitor Local Setup in browser storage.
- Use the same Summary Configuration and Todo domain rules for Visitor and User modes wherever possible.
- Make signed-in User persistence server-side and database-backed, not browser-storage-backed.
- Load the current setup from Local Setup for Visitors and from SQLite for signed-in Users.
- Keep the Daily Summary preview available to Visitors and signed-in Users.
- The Daily Summary preview should use the same renderer and domain shape regardless of whether the source setup is local or persisted.
- Keep Demo Calendar, mock Weather, and mock Commute as preview-only provider substitutes in this milestone.
- Never import Demo Calendar, mock Weather, or mock Commute output into User persistence.
- Automatically create or update the application User record after successful Google sign-in.
- Automatically create a default Summary Configuration for a new User when no imported Local Setup is available.
- Automatically import valid Local Setup after Google sign-in only when the User has no existing saved setup.
- Do not overwrite existing User setup with Local Setup for returning Users.
- Validate Local Setup on the server before import even if it was already validated in the browser.
- Convert Local Setup into a User Setup import draft before writing to the database.
- Generate database-side ids for imported Summary Configuration, Todo Categories, and Todo Tasks instead of reusing browser-local ids as authoritative persistence ids.
- Preserve Summary Time, User Time Zone, Summary Theme, Summary Delivery, and Summary Section toggles during import.
- Preserve Todo Category names and positions during import.
- Preserve Todo Task titles, category assignment, urgency, and positions during import.
- Reject an import draft when a Todo Task references a missing Todo Category.
- Persist Local Setup import in a database transaction.
- Return a stable import outcome for imported, skipped-existing-setup, invalid-draft, and import-failed states.
- Surface import outcomes in user-facing status messaging without exposing internal errors.
- Keep completed Todo history out of the user-facing product surface.
- Keep Todo Categories as folder-like groupings rather than tags.
- Keep empty Todo Categories visible in the app and hidden from the Daily Summary preview.
- Keep Uncategorized Todo Tasks as first-class Todo Tasks outside a Todo Category.
- Keep Uncategorized Todo Tasks before categorized Todo Tasks in the Daily Summary preview.
- Keep Urgency as low, medium, or high and preserve that Urgency independently from ordering.
- Keep Summary Sections in fixed order: Weather, Commute, Calendar, Todo.
- Keep Summary Delivery separate from Summary Section enablement.
- Do not send emails in this milestone.
- Do not create Delivery Records in this milestone.
- Do not add live Weather Location, Commute Routes, Selected Calendar, provider tokens, provider fetches, or scheduled worker behavior in this milestone.
- Add auth-aware navigation that distinguishes Visitor mode, signed-in User mode, and Administrator access.
- Add sign-in and sign-out controls to the main application surface.
- Add signed-in messaging that explains setup is saved to the User.
- Keep messaging clear that email delivery is still not performed in this milestone.
- Restrict Admin Panel access to signed-in Google accounts whose verified email appears in a deployment-configured allowlist.
- Do not build database-managed Administrator roles in this milestone.
- Keep Admin Panel content operational and free of private User content.
- Avoid technical logs that include Todo Task titles, Calendar Event content, Summary Configuration values, or rendered Daily Summary content.
- Add environment configuration for Google OAuth credentials, auth secrets, database location, and Administrator allowlist.
- Ensure production cookies and callback URLs can be configured for the Node-hosted SvelteKit deployment model.
- Keep account deletion out of scope until the production hardening milestone.

## Testing Decisions

- Tests should focus on externally visible behavior and domain contracts rather than internal component structure.
- The highest-value test seam is the Visitor-to-User transition: create Local Setup as a Visitor, sign in through a deterministic test auth path, import setup, reload, sign out, sign back in, and verify the User setup is durable.
- Use one end-to-end seam for the main persistence journey instead of testing every UI component independently.
- Use Playwright for auth-aware user journeys, including Visitor mode, first sign-in import, returning User persistence, sign-out, and Admin Panel authorization.
- Do not call live Google in automated tests; use a controlled auth fixture or mocked provider boundary that exercises the application session contract.
- Use Vitest for Local Setup loading, validation, version handling, import draft creation, and invalid-browser-data outcomes.
- Use Vitest for User Setup import persistence, including imported, skipped-existing-setup, invalid-draft, and import-failed outcomes.
- Use Vitest for database persistence mapping of Todo Categories and Todo Tasks, especially ordering, category assignment, urgency defaults, and completed-state compatibility.
- Use database schema tests to protect required User, Summary Configuration, Todo Category, Todo Task, and auth persistence tables, relationships, unique constraints, defaults, and cascades.
- Test that a first-time User with valid Local Setup receives imported Summary Configuration and Todo data.
- Test that a first-time User with empty Local Setup receives default Summary Configuration and empty Todo data.
- Test that invalid Local Setup is ignored and does not partially create User setup.
- Test that unsupported Local Setup versions are ignored and do not partially create User setup.
- Test that Local Setup with unsafe Todo Task category references is rejected before persistence.
- Test that Local Setup import does not persist Demo Calendar, mock Weather, or mock Commute output.
- Test that Local Setup import preserves Todo Category order and Todo Task order within each grouping.
- Test that Local Setup import preserves Uncategorized Todo Tasks.
- Test that Local Setup import preserves Urgency without sorting by Urgency.
- Test that import writes are transactional and leave no partial setup after a write failure.
- Test that returning Users with existing saved setup are not overwritten by browser Local Setup.
- Test that signed-in User Summary Configuration changes persist after reload and after a new session.
- Test that signed-in User Todo Category and Todo Task mutations persist after reload and after a new session.
- Test that signed-in User Todo drag-and-drop ordering persists after reload.
- Test that signed-in User Daily Summary preview is rendered from persisted setup.
- Test that Visitor Local Setup still persists locally after Milestone 2 changes.
- Test that sign-out returns the person to Visitor mode without exposing previous User data.
- Test that an unauthenticated Visitor cannot access the Admin Panel.
- Test that a signed-in non-allowlisted User cannot access the Admin Panel.
- Test that a signed-in allowlisted Administrator can access the Admin Panel.
- Test that Admin Panel output does not include private User content.
- Prior test art already exists for Visitor Local Setup, Todo domain behavior, Summary Configuration, Daily Summary rendering, database schema, Todo persistence mapping, User Setup import persistence, and Playwright walking-skeleton workflows; Milestone 2 should extend those seams rather than introduce a parallel test style.

## Out of Scope

- Google Calendar connection or Calendar scopes.
- Selected Calendar management.
- Live Calendar Event fetches.
- Storing copied Calendar Event content.
- Resend email delivery.
- Test email sending.
- Delivery Records.
- Scheduled Daily Summary worker.
- Cron or systemd timer setup.
- Open-Meteo live forecasts.
- Weather Location selection and geocoding.
- Google Maps autocomplete, map points, Commute Routes, traffic estimates, usage caps, and kill switches.
- Admin Panel live operational metrics.
- Admin Panel Google Maps usage controls.
- Database-managed Administrator roles.
- Alternate Summary Recipients.
- Account deletion.
- VPS deployment automation.
- Production backup automation.
- Paid plans.
- Localization.

## Further Notes

- Milestone 2 is the identity and persistence foundation for later provider and delivery milestones.
- The milestone should preserve the low-friction Visitor experience from Milestone 1 while making signed-in User state durable.
- The UI should remain the usable Daily application, not a landing page.
- The app should continue using project domain language: Visitor, Local Setup, User, Summary Configuration, Summary Recipient, Summary Delivery, Summary Section, Daily Summary, Todo Category, Uncategorized Todo Task, Todo Task, Urgency, Administrator, and Admin Panel.
- Import behavior is deliberately asymmetric: Local Setup may initialize a new User, but it must not overwrite a returning User.
- The privacy model starts here: persistence and admin access must not create a support surface for reading private User content.
