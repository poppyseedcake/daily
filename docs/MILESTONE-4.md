# Milestone 4: Live Weather

Milestone 4 replaces mock Weather data with live Weather Section generation.

## Scope

- Weather Location selection by city
- City geocoding and coordinate persistence for Weather Location
- Open-Meteo live forecast fetch during preview and test delivery
- Weather Section output with short daily description, minimum and maximum temperature, and chance of precipitation
- Weather Section enabled/disabled handling
- Weather unavailable state when geocoding or forecast fetch fails
- Visitor preview can use live weather within normal app guardrails
- Tests for Weather Location validation, forecast mapping, and unavailable states

## Out of Scope

- Google Maps location selection
- Google Calendar connection
- Scheduled worker
- Weather forecast snapshot storage
- Weather alerts, wind details, or advanced forecast customization
