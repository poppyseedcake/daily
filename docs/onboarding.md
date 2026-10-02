# Daily introduction and feature tour

The selected onboarding combines the first screen of prototype A with the contextual tour of prototype C. The exploratory variants are archived in commit `7b410bd` on `prototype/onboarding-exploration`; they are not production code.

The welcome screen explains that Daily combines Todo, Weather, Commute and Google Calendar in an email at the chosen time. It lists those four capabilities and shows an illustrative email alongside them on desktop. It uses the same current Daily logo as the rest of the app, verified against the production SVG.

“Show me” starts a five-stop tour of the actual board: task capture, Weather, Commute, Calendar and Mail delivery. Each stop has the feature name, a short explanation, progress, Skip, Back (after the first step) and Next (Done on the final step). Headlines describe the product or feature directly; there are no slogan headings, extra feature badges, prototype labels or decorative step icons.

Weather, Commute and Calendar also show a short example of that section's email content beneath their explanation. They reuse the welcome email's sample content and styling, matching the supplied production email references: weather metrics, a driving route, a seven-day calendar strip and grouped tasks with urgency dots. Commute, Calendar and Todo use fictional English sample data. Only the email's own section headings are shown; there are no “Example email” labels.

The introduction opens once per browser on the first visit to `/`. Skip, Done and Escape dismiss it and remember dismissal independently of Visitor Local Setup. Settings → Show me around reopens the welcome screen. Clearing browser storage allows automatic onboarding again. If reading browser storage is blocked, auto-opening is skipped; manual replay remains available. This preference is local to the browser, not synchronised to the account.

The tour only explains the interface. It does not change tasks, configuration, connections or delivery, and never initiates sign-in or sends an email. The native dialog provides modal keyboard focus; closing restores scrolling and focus. On mobile, the highlighted feature sits above the guide, which stays within the viewport. No motion is required.

Specification source: the user's requested A → C flow and concise copy, plus their confirmed once-per-browser launch/replay behavior and browser testing scope in this conversation.
