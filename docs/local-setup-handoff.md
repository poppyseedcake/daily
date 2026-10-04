# Local Setup Handoff

The Local Setup Handoff module owns Visitor hydration, browser persistence, and
the transition after Google sign-in. Its interface is `initialize` and `save`;
storage, import transport, and navigation adapters stay behind the seam.

## Behavior

- Restore valid Visitor Local Setup without replacing its User Time Zone.
- Initialize empty browser storage using the system time zone.
- Keep invalid browser storage untouched until the Visitor changes Local Setup.
- Keep blocked storage usable with an unsaved status.
- Do not persist browser data before hydration or for a signed-in User.
- On the Google callback, submit valid Local Setup through the existing import
  route and retain its atomic transaction and existing-setup preservation rules.
- After any submitted import, load a fresh document before enabling editing.
  Saved User data supplies the Commute Route IDs and all browser save baselines;
  the original Visitor snapshot is never applied as saved User state.
- Reload even when the import response is lost: the transaction may have committed.
- Carry only a recognized outcome in the `localSetupImport` query parameter during
  reload, then consume it and remove the parameter without repeating the import.
  Preserve unrelated query parameters and the fragment.
- When no valid browser setup exists, keep the already loaded User setup and
  clear the callback parameter without submitting an import.

The module uses a full document reload because the workspace initializes editing
state and save coordinators from the first server load. A partial invalidation
would require rebuilding those baselines in the caller. The reload also keeps
private setup data out of the import route's metadata-only response.

## Verification seams

The module interface covers hydration, persistence, failed imports, callback
completion, and readiness. Browser tests exercise the real import route and SQLite:
deleting an imported Commute Route before a manual refresh, retaining existing
Commute Routes, and editing imported Todo Tasks without losing earlier data.
Existing import transaction and browser save coordinator tests remain in place.

This implements architecture-review candidate 01. Changes to ordinary signed-in
read-failure handling (candidate 02) and Weather generation (candidate 03) are
separate work. Google sign-in intent and Terms acceptance remain governed by
`docs/authentication-flow.md`; ADR-0012's automatic handoff remains in effect.
