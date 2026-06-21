# Milestone 2: Accounts and Persistence

Milestone 2 turns the walking skeleton into a persistent application while preserving no-friction Visitor exploration.

## Scope

- Better Auth Google sign-in
- SQLite-backed User and session persistence through Drizzle
- Persistent Summary Settings for signed-in Users
- Persistent Todo Categories, Uncategorized Todo Tasks, Todo Tasks, urgency, and ordering
- Automatic Local Setup import after Google sign-in when the User has no existing saved setup
- Visitor access without sign-in remains available
- Admin access through deployment-configured verified Google email allowlist
- Auth-aware navigation and messaging that explains sign-in is required before email delivery
- Tests for Local Setup import, authenticated persistence, and admin allowlist access

## Out of Scope

- Google Calendar connection and calendar scopes
- Resend email delivery
- Open-Meteo live forecasts
- Google Maps autocomplete, route estimates, usage caps, and kill switches
- Scheduled worker and Delivery Records for scheduled summaries
- VPS deployment automation
