# Privacy and Terms review

Status: draft review document. This file is not public policy text.

Daily is not ready for public launch or Google OAuth verification until the items below are
resolved. The application code and the local environment do not prove the final production setup.

## Known launch blockers

- Activate and test `daily@dailykickoff.eu`. The supplied contact mailbox is not active.
- Obtain legal review of [`/privacy`](../src/routes/privacy/+page.svelte), [`/terms`](../src/routes/terms/+page.svelte),
  the proposed GDPR legal bases, and the age and Terms confirmation flow.
- Confirm that the operator has supplied every address, notice, tax, consumer, and business detail
  required for the final public documents. No physical address is invented in the draft.
- Decide and implement, or formally accept, the lack of an automated live-database purge for old
  Delivery Records. The interface reads the last 30 days, but old rows are not separately removed
  by [`deliveryRecordStore.ts`](../src/lib/server/db/deliveryRecordStore.ts).
- Verify the production controls for OAuth token encryption at rest, access control, logs, backups,
  and Google token revocation. The repository stores OAuth token fields, but it does not prove the
  storage encryption or the production key-management setting.

## Legal questions

1. Are the proposed Article 6 bases in the Privacy Policy correct for the account, Daily Summary,
   Calendar connection, security records, legal confirmation, and optional providers?
2. Does the operator need to publish a physical address or another legal notice for Poland and the
   intended users? Add it only after the operator supplies and verifies it.
3. Are the free-service terms about suspension, service change, information errors, user duties,
   complaints, and account deletion suitable without removing mandatory user rights?
4. Is the age-16 self-declaration suitable for the intended users and the operator's legal duties?
   Confirm whether another notice or parental process is required. Daily does not collect a date of
   birth or an identity document in this implementation.
5. Confirm the controller contact and complaint wording, including the current route to the Polish
   UODO. The public draft provides the contact email and a UODO link.
6. Confirm the Terms versioning rule. The current application version is
   `2026-09-21`, stored with the acceptance time.
7. Confirm whether the wording about provider-held email copies and immutable backups is correct
   for the final legal notice.

## Provider and transfer questions

1. Is Google OAuth configured as an External production application? Confirm the final project,
   consent-screen branding, support email, authorised domains, origins, redirect URIs, and policy
   URLs.
2. Confirm the Google classification of each exact scope in the current Cloud Console. The code
   requests `openid`, `email`, `profile`,
   `https://www.googleapis.com/auth/calendar.calendarlist.readonly`, and
   `https://www.googleapis.com/auth/calendar.events.readonly`.
3. Confirm the final scope set in the Google Cloud project and test a fresh Calendar connection
   with a live Google account before submitting the verification explanation. Google's endpoint
   authorization tables support this pair; the repository tests cannot prove live OAuth consent.
4. Confirm whether Google Calendar data or data derived from it reaches Resend through a requested
   Daily Summary. If so, document the transfer and user-facing purpose under Google's Limited Use
   rules and review the provider terms.
5. Confirm the Resend account, sending domain, data processing terms, retention, deletion process,
   and the final `RESEND_FROM_EMAIL`. Code for Resend exists, but production activation is unknown.
6. Confirm Open-Meteo processing terms for geocoding and forecast requests.
7. Confirm whether the optional OpenAI weather provider is enabled. If it is enabled, review its
   current data terms, retention, `store: false` behaviour, and the Google Limited Use position.
   The current code sends normalised weather values only, not Calendar data.
8. Confirm whether Cloudflare or cloudflared is in the live request path. The repository has no
   Cloudflare API integration. Review proxy logs, retention, access, and international transfers.
9. Confirm all provider contracts and international transfer safeguards before the policy claims a
   specific location, contract, or transfer mechanism.

## Operations questions

1. Confirm production values for `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ORIGIN`,
   `BETTER_AUTH_URL`, Google credentials, Resend credentials, map credentials, optional OpenAI
   credentials, `OPERATIONAL_RETENTION_DAYS`, `BACKUP_RETENTION_DAYS`, and proxy settings. Local
   `.env` values are not evidence of production activation.
2. Confirm whether scheduled delivery is still disabled for launch preparation. Do not enable it as
   part of this change.
3. Confirm the backup directory, access controls, offsite strategy, and the 30-day backup default.
   Account deletion does not rewrite historical backups.
4. Confirm the procedure and service level for a request to delete data from provider systems and
   delivered email copies. Daily can delete the live database records and attempts Google token
   revocation; provider deletion is separate.
5. Decide whether Calendar disconnection should also revoke the Google account or token. The current
   action removes Calendar connection and selected-calendar metadata only.
6. Confirm whether the short-lived legal confirmation cookie and its HMAC secret meet the final
   security design. The cookie carries no identity, date of birth, or document data.

## Google policy sources reviewed

- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies)
- [Choose Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Google verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)
- [Google OAuth verification submission](https://support.google.com/cloud/answer/13461325?hl=en-GB)
- [UODO rights and complaints information](https://uodo.gov.pl/en/680/1402)

The full source review is in
[`docs/research/google-api-user-data-policy.md`](research/google-api-user-data-policy.md).
