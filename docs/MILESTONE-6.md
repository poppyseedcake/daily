# Milestone 6: Google Maps and Commute

Milestone 6 replaces mock Commute data with Google Maps-backed route setup and traffic-aware estimates.

## Scope

- Google Maps Platform integration for map point selection
- Commute Origin and Commute Destination selection as specific map points
- Up to five User-named Commute Routes
- Commute Route enabled/disabled state
- Commute Days for the whole Commute Section, defaulting to Monday through Friday
- Traffic-aware driving Commute Estimates during preview and test delivery
- Shared Google Maps usage limit across quota-consuming Maps calls
- High per-person daily abuse limits for Visitors and Users
- SQLite-backed daily and monthly global usage tracking
- Configurable daily and monthly global caps
- Environment-level Google Maps kill switch
- Admin Panel SQLite-backed Google Maps kill switch
- Admin Panel Google Maps usage and suspended-state visibility
- Operator alert when a global Google Maps cap is reached
- Tests for route limits, Commute Day visibility, usage caps, kill switches, and unavailable states

## Out of Scope

- Public transit, walking, or cycling commute modes
- Per-route weekday rules
- Route estimate snapshot storage
- Scheduled Daily Summary worker
- Google Maps billing API integration
