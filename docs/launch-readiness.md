# Daily launch readiness

Status: not ready for public launch or Google OAuth verification.

Operator: Wojciech Makowiec, individual, Poland<br>
Contact: `daily@dailykickoff.eu`  
Website: <https://dailykickoff.eu>  
Service price: free  
Minimum age: 16

The contact mailbox is not active. This is a launch blocker. This document records what the
repository shows. Code that can call a provider does not prove that the provider is active in
production.

## Factual data-flow summary

| Source or feature | Data handled | Purpose and destination | Code reference and production note |
| --- | --- | --- | --- |
| Google sign-in | `openid`, `email`, `profile`; Google account ID, name, email, verification state, optional image | Create and use a Daily account. The email is the Daily Summary recipient. | [`auth.ts`](../src/lib/server/auth.ts), [`auth/google/confirm/submit/+server.ts`](../src/routes/auth/google/confirm/submit/+server.ts). Production OAuth status is unknown. |
| OAuth storage | Google account ID, access token, refresh token, ID token, scope, and expiry values | Better Auth session and account operation; refresh live Calendar access. | [`schema.ts`](../src/lib/server/db/schema.ts), [`googleCalendarList.ts`](../src/lib/server/googleCalendarList.ts). Production encryption at rest is an open question. |
| Calendar connection | One connection status, provider account ID, granted scopes, token-availability flags, expiry, and selected calendar IDs and labels | Read the selected calendars and show a live Calendar Section. | [`auth/google/calendar/+server.ts`](../src/routes/auth/google/calendar/+server.ts), [`calendarConnectionStore.ts`](../src/lib/server/db/calendarConnectionStore.ts), [`userCalendarEvents.ts`](../src/lib/server/userCalendarEvents.ts). |
| Calendar events | Live event IDs, titles, start/end or all-day dates, calendar IDs, and calendar labels | Build the Calendar Section and the generated Daily Summary. Event content is not stored in the Daily database. | [`googleCalendarList.ts`](../src/lib/server/googleCalendarList.ts), summary generation modules. An email can contain the generated Calendar Section. |
| Daily setup | Summary time and time zone, delivery and section settings, Todo data, weather locations, saved commute addresses/routes/days, and selected calendars | Provide the Daily board and generate a requested Daily Summary. | [`schema.ts`](../src/lib/server/db/schema.ts), [`localSetup.ts`](../src/lib/localSetup.ts). |
| Email delivery | Recipient, generated HTML and text, subject, and an optional idempotency key | Send a requested or scheduled Daily Summary through Resend when configured. | [`dailySummaryDelivery.ts`](../src/lib/server/dailySummaryDelivery.ts). Production Resend activation and retention are unknown. |
| Weather | Search text, latitude, longitude, time zone, forecast values | Open-Meteo geocoding and forecast requests. | [`weatherLocationGeocoding.ts`](../src/lib/server/weatherLocationGeocoding.ts), [`weatherForecast.ts`](../src/lib/weatherForecast.ts). |
| Commute | Search text and place IDs; saved route coordinates | Google Places search/details and Google Routes travel-time estimates. | [`googlePlacesProvider.ts`](../src/lib/server/googlePlacesProvider.ts), [`googleRoutesProvider.ts`](../src/lib/server/googleRoutesProvider.ts). Production map-key activation is unknown. |
| Optional weather AI | Normalised weather values and local time values | Produce one short weather sentence. No name, email, Calendar, Todo, or commute data is sent by this code. | [`weatherSummaryProvider.ts`](../src/lib/server/weatherSummaryProvider.ts). Production OpenAI activation is unknown. |
| Technical records | Event code, severity, subsystem, outcome, timestamps, correlation ID, duration, and allowlisted metadata | Troubleshooting and operations. The technical log design excludes private content. | [`technicalLogStore.ts`](../src/lib/server/db/technicalLogStore.ts), [`docs/adr/0005-keep-technical-logs-free-of-private-content.md`](adr/0005-keep-technical-logs-free-of-private-content.md). |
| Sessions and browser state | Better Auth session cookie; a short-lived OAuth state cookie and matching verification row; session expiry, IP address and user agent when supplied; visitor Local Setup in `localStorage` | Keep sign-in state, protect the Google redirect, and preserve visitor setup before sign-in. | Better Auth configuration in [`auth.ts`](../src/lib/server/auth.ts), [`localSetup.ts`](../src/lib/localSetup.ts). No app use of `sessionStorage`, IndexedDB, or `document.cookie` was found. |

### Google scopes and use

Daily currently has two code paths:

- Sign-in requests `openid`, `email`, and `profile`.
- The separate Calendar connection requests those identity scopes plus
  `https://www.googleapis.com/auth/calendar.readonly`.

The Calendar path calls `users/me/calendarList` and `calendars/{id}/events`. It requests read-only
access and does not write events. The exact scope classification and whether a narrower combination
works must be checked in the production Google Cloud project. The repository does not verify the
project configuration.

The official Google policy research is in
[`docs/research/google-api-user-data-policy.md`](research/google-api-user-data-policy.md). It
records the requirement to publish an accurate policy, request the minimum permissions, disclose
Google data access/use/storage/sharing, and satisfy Limited Use rules.

### Account, Calendar disconnection, deletion, logs, and backups

- Calendar disconnection deletes Daily Calendar connection and selected-calendar rows. It does not
  revoke or delete the separate Better Auth Google account record.
- Account deletion requires `DELETE MY ACCOUNT`, marks the user as deleting, prevents further Daily
  work, attempts to revoke unique Google access/refresh/ID tokens, and deletes the live Daily and
  Better Auth rows. Revocation is best effort. See [`accountDeletion.ts`](../src/lib/server/accountDeletion.ts)
  and [`accountDeletionStore.ts`](../src/lib/server/db/accountDeletionStore.ts).
- Delivery records store provider status metadata and message IDs, not email content. The UI and
  health queries use a 30-day window, but the current code has no separate live-row purge for old
  delivery records. This needs a launch decision.
- Technical logs and scheduled worker runs use a configurable operational retention period with a
  30-day default. See [`operationalRetention.ts`](../src/lib/server/db/operationalRetention.ts).
- Verified SQLite backups use `BACKUP_RETENTION_DAYS`, with a documented 30-day default. Account
  deletion changes the live database only. Historical backup copies remain until retention removes
  them. See [`docs/sqlite-backups.md`](sqlite-backups.md).
- Exact production values, provider retention, Cloudflare proxy logs, token encryption, and offsite
  backup handling are not known from the repository.

## Unresolved questions and blockers

See the separate review document: [`docs/privacy-terms-review.md`](privacy-terms-review.md).

Immediate blockers are the inactive contact mailbox, legal review, the live Delivery Record
retention decision, production token/security verification, provider and transfer review, and
Google Cloud OAuth configuration verification.

## Launch checklist

- [ ] Activate and test `daily@dailykickoff.eu`.
- [ ] Resolve the missing operator details and all legal and operational questions.
- [ ] Obtain legal review of the Privacy Policy, Terms of Service, and the age-confirmation approach.
- [ ] Verify ownership of `dailykickoff.eu` in Google Search Console.
- [ ] Check every requested OAuth scope against actual use and test the narrowest working Calendar
      scope set.
- [ ] Confirm the Cloud Console OAuth project is External and in the intended production state.
- [ ] Confirm the homepage, `/privacy`, `/terms`, authorized domains, redirect URIs, JavaScript
      origins, support email, and developer contact.
- [ ] Prepare Google verification evidence and a demonstration video that shows the same branding,
      complete consent screen, exact submitted scopes, OAuth grant, Calendar connection, and the
      feature that uses the scope.
- [ ] Enter the final public Privacy Policy and Terms URLs in Google Auth Platform.
- [ ] Confirm provider contracts, transfer safeguards, retention, token storage encryption,
      deletion procedures, and proxy logs.
- [ ] Decide the live Delivery Record retention policy and verify backup retention.
- [ ] Keep scheduled delivery disabled during launch preparation and verification. Do not send email
      as part of this code change.

## Test result record

The focused unit tests pass for:

- public sign-in route redirection to the confirmation step;
- signed confirmation cookie creation and tamper/expiry rejection;
- server-side Better Auth account-creation enforcement;
- valid and invalid confirmation form submissions;
- existing-account completion without changing saved account data, including Local Setup return;
- Google sign-in scope handling;
- Google Calendar connection scope handling;
- account deletion and Calendar disconnection route behaviour; and
- the existing Daily page server suite.

The exact commands and final results must be refreshed after the full unit and end-to-end suites
run on the release candidate. This work does not claim GDPR compliance or Google approval.
