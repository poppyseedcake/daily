# Milestone 5: Google Calendar

Milestone 5 connects signed-in Users to their own Google Calendar data while keeping Visitor calendar data clearly demo-only.

## Scope

- Separate Google Calendar consent after Google sign-in
- Calendar Section configuration for signed-in Users
- Selected Calendar list with the primary Google calendar selected by default
- User-controlled calendar selection for Calendar Section inclusion
- Live Calendar Event fetch during preview and test delivery
- Today and Week Ahead event grouping using User Time Zone
- All-Day Event rendering separate from timed events
- Declined Calendar Events excluded from Daily Summary
- Calendar unavailable state for expired tokens or provider failures
- Visitor Demo Calendar remains clearly labeled and separate from real calendars
- Tests for calendar consent state, selected calendars, event filtering, and Week Ahead grouping

## Out of Scope

- Storing copied Calendar Event content
- Calendar sync jobs
- Scheduled Daily Summary worker
- Google Maps commute estimates
- Calendar write access or event editing
