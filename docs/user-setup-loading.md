# User setup loading and editing readiness

## Problem

A signed-in page load currently catches saved User setup read failures and supplies
empty defaults. Todo and Commute read failures retain an `unavailable` flag only
inside the route. The browser receives the same values as a successful empty read,
enables editing, and can replace saved Todo Tasks or saved location collections
with a partial state.

## Behavior

- A User setup loading module reads Summary Configuration, Todo state, Weather
  Location, Commute setup, Saved Weather Cities, and Saved Commute Addresses.
- The result carries an explicit editing permission for each part. A successful
  empty read is editable; a failed read is unavailable and cannot be edited or
  submitted from that page instance.
- Failures remain isolated: the workspace, unaffected editors, Settings, account
  navigation, and Sign out stay available.
- Unavailable parts are identified in a notice. Retry loading opens a fresh page
  document, reads saved state again, and constructs fresh browser save baselines
  before editing becomes available. Failed retries remain protected.
- Automatic saves and direct mutations obey the same permissions as controls.
  Summary Configuration failure blocks delivery and every section-pause control.
  Todo failure blocks capture, categories, task mutations, and drag and drop.
  Weather and Commute failure block their respective editors. Failed saved city
  or address reads block collection updates while verified locations/routes may
  still be edited.
- Failure diagnostics contain only an opaque User identifier and classification.
  They do not include persisted content or exception payloads.

## Scope and verification

Calendar connection, Selected Calendars, Delivery Records, authentication,
account lifecycle, Local Setup import, and write endpoint contracts retain their
existing behavior. No schema or data migration is required.

Tests cross the User setup loading interface with normal and faulting persistence
adapters, and the browser workflow with a real signed-in User and SQLite. The
browser regressions cover failed Todo, Saved Weather Cities, and Saved Commute
Addresses reads, attempted editing, recovery, and a subsequent edit retaining
the previously saved items. Collection regressions check both disabled controls
and rejection of save attempts even if a control is accidentally enabled.
