# Milestone 1: Walking Skeleton

Milestone 1 proves the core Daily experience without external Google Calendar, Google Maps, Open-Meteo, or Resend integration.

## Scope

- SvelteKit application with Tailwind CSS and local Svelte components
- SQLite and Drizzle schema/migrations
- Visitor Local Setup persisted in the browser
- Todo management with uncategorized tasks, categories, urgency, ordering, and drag-and-drop
- Summary settings for Summary Time, User Time Zone, Summary Theme, Summary Delivery, and Summary Section toggles
- Daily Summary preview using the real email renderer, Demo Calendar, mock Weather, and mock Commute data
- Light and dark email themes with HTML and text output
- Minimal Admin Panel shell without live operational metrics
- Initial tests for scheduling, summary eligibility, email rendering, and Todo ordering

## Out of Scope

- Google sign-in and Better Auth persistence
- Google Calendar connection
- Google Maps autocomplete, map points, usage caps, and traffic estimates
- Open-Meteo live forecasts
- Resend delivery
- Cron/systemd scheduled worker
- VPS deployment automation
