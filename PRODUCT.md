# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Daily serves one person planning their own day. A User signs in with Google and can receive a private Daily Summary by email. A Visitor can explore and configure the same product locally before signing in. The User and Visitor interfaces should be nearly identical; Visitor mode is communicated as a lightweight status rather than a separate experience.

## Product Purpose

Daily helps a person prepare for the day by combining a frequently maintained Todo list with optional Weather, Commute, and Calendar information, then delivering the resulting Daily Summary at the configured local time.

Success means that the User can maintain Todo Tasks with little friction, configure the other Summary Sections once, and trust the Daily Summary to arrive without repeatedly managing the application.

## Positioning

Daily turns a small amount of persistent personal setup into a private, scheduled briefing. Todo is the active workspace; Weather, Commute, and Calendar are supporting context that should recede after configuration.

## Operating Context

- Todo is the only area intended for frequent interaction.
- Weather, Commute, Calendar, Summary Time, and related preferences are usually configured once and revisited rarely.
- Summary Delivery can be enabled or paused independently from individual Summary Sections.
- A Visitor can create Local Setup in the browser and later import it after Google sign-in.
- Delivery History and Settings are secondary destinations rather than primary-dashboard content.
- The application UI remains in English.

## Capabilities and Constraints

- Daily Summary Sections are Weather, Commute, Calendar, and Todo.
- Summary Delivery is enabled by default and must have an easily discoverable enable/pause control.
- Todo Tasks support categories, urgency, ordering, editing, completion, and deletion.
- Weather uses one chosen Weather Location.
- Commute supports named driving routes with independently selected Commute Days.
- Calendar uses selected Google calendars for signed-in Users and a clearly labeled Demo Calendar for Visitors.
- The main UI must work equally well on desktop and mobile.
- Mail Preview is not required on the primary view and may be removed from the main experience.
- Existing privacy boundaries and the distinction between User, Visitor, and Administrator must be preserved.

## Brand Commitments

The product name is Daily. Product terminology defined in `CONTEXT.md` should be preserved. The interface should feel minimalist and professional, with configuration controls revealed on demand instead of persistent text fields.

## Evidence on Hand

- Domain terminology and product behavior are documented in `CONTEXT.md`.
- Product requirements and milestone decisions are documented in `docs/`.
- The existing SvelteKit application contains working User and Visitor workflows, Todo interactions, Summary configuration, Weather, Commute, Calendar, delivery history, and account management.
- No customer claims, testimonials, commercial benchmarks, or external brand assets are available and none should be fabricated.

## Product Principles

- Make the next useful action obvious, especially in Todo.
- Keep configured context calm and compact until the User chooses to edit it.
- Present Visitor mode as a status, not a diminished parallel product.
- Keep delivery state visible and understandable without making configuration dominate.
- Move infrequent operational and account tasks out of the primary workspace.

## Accessibility & Inclusion

The web interface must support keyboard interaction, visible focus, semantic controls, reduced motion, sufficient contrast, and responsive use across desktop and mobile.
