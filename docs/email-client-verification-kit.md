# Immutable Email-Client Verification Kit

This kit verifies one immutable Daily Summary release candidate in real email clients.
It does not replace real Test Delivery with a local HTML preview.

## What the kit contains

The source of truth is `src/lib/dailySummaryFixtures.ts`.

- `all-active` is one dense fixture. It contains long and non-ASCII Weather, Commute,
  Calendar, and Todo content.
- `rotate-01` through `rotate-04` are fixed state rotations.
- `buildDailySummaryStateMatrixFixtures()` remains the exhaustive local renderer matrix.
- `npm run verify:email-client-kit` renders the five named fixtures, measures their UTF-8
  HTML and plain-text size, and prints a SHA-256 digest for each rendered pair.

The four rotations cover every supported state. Weather has no Empty state. Todo has no
Unconfigured state. This is the accepted Summary Section contract.

| Fixture | Weather | Commute | Calendar | Todo |
| --- | --- | --- | --- | --- |
| `all-active` | Active | Active | Active | Active |
| `rotate-01` | Paused | Unconfigured | Empty | Unavailable |
| `rotate-02` | Unconfigured | Empty | Unavailable | Paused |
| `rotate-03` | Unavailable | Paused | Unconfigured | Empty |
| `rotate-04` | Active | Unavailable | Paused | Active |

The command reports size only. It does not enforce a byte limit. A realistic message that
clips in a supported client is a release failure and needs a separate product decision. Do
not add a byte limit to make that failure pass.

## Immutable candidate procedure

Run the checks from the exact commit that will be deployed. Record the commit SHA and the
output of the verification command.

```sh
git status --short
npm ci
npm run check
npm run test
npm run build
DAILY_RELEASE_SHA="$(git rev-parse HEAD)" npm run verify:email-client-kit
```

Deploy that same commit with the production procedure in `docs/production-deployment.md`.
Do not rebuild the application from another commit after the matrix starts. Use a dedicated
verification User and Summary Recipient. Keep Scheduled Delivery stopped until the matrix
passes.

## Real Test Delivery path

Every message in the matrix must use the signed-in User Test Delivery action:

```text
Summary Configuration and fixture data
  -> Daily Summary generation
  -> shared TypeScript renderer
  -> Resend submission
  -> Summary Recipient
  -> one Test Delivery Record
```

Use the Daily application to prepare the dedicated User for one fixture, then select Test
Delivery. Do not copy the rendered HTML into Resend by hand. Do not use a local-only script
as evidence of delivery. The provider request must contain the same complete HTML and plain
text that the production Test Delivery path generated.

For every fixture, verify all of the following:

- Resend accepted the message for the intended Summary Recipient.
- The subject is `Test · Your Daily Summary · <weekday, day month>`.
- The message contains Weather, Commute, Calendar, and Todo in that order.
- The User history contains exactly one new Test Delivery Record for the message.
- The Test Delivery Record is `sent`, has one provider message id, and has no rendered email
  content or provider payload.

The five messages must be sent to every required client row. A client row is one exact
client, browser, application, and operating-system combination.

## Required client matrix

Record the exact version for every row at the time of inspection.

- Gmail web in current Chrome on Windows.
- Gmail mobile in current iOS and current Android.
- Apple Mail in current iOS and current macOS.
- Outlook web in current Chrome on Windows.
- Classic Outlook for Windows in Microsoft 365 Current Channel.
- Classic Outlook for Windows in the oldest supported perpetual version.

Send `all-active` and all four rotating fixtures to each row. Inspect `all-active` with
images enabled, images blocked, and plain text. Inspect every rotation for state, order, and
complete content.

## Evidence checklist

Store the evidence outside the application database. Keep the evidence directory tied to the
immutable release SHA.

- [ ] Release commit SHA, package-lock checksum, test date, and operator.
- [ ] Exact client, browser, application, and operating-system versions for every row.
- [ ] Recipient and subject for all five messages in every row.
- [ ] Wide screenshot where the client supports a wide layout.
- [ ] Narrow screenshot where the client supports a narrow layout.
- [ ] `all-active` screenshot with images enabled.
- [ ] `all-active` screenshot with images blocked.
- [ ] Complete plain-text output for `all-active`.
- [ ] Visible Open Daily link target, with no tracking query or fragment.
- [ ] Exactly one `sent` Test Delivery Record for each sent message.
- [ ] Original message source or exported MIME where the client permits export.
- [ ] Verification-command output with fixture sizes and artifact digests.

Do not put rendered email content, Todo Task titles, Calendar Event content, Commute
locations, provider payloads, credentials, or tokens into Delivery Records or technical logs.

## Release rules

These are hard failures:

- a Summary Section is missing, duplicated, or out of order;
- a state is wrong or its explanation is missing;
- content is clipped, overlaps, becomes unreadable, or requires unexpected horizontal scroll;
- blocked images remove meaning;
- plain text is missing, incomplete, or in a different order;
- the Open Daily link is broken or contains an identifier or tracking value;
- the recipient, subject, provider result, or Delivery Record is wrong;
- the client cannot show long, non-ASCII, Calendar, Commute, or Todo content.

These differences are cosmetic and can pass when the hierarchy and meaning remain correct:

- font substitution, line wrapping, small spacing differences, and small color differences
  within the accepted palette;
- a classic Outlook desktop client retaining the 2 × 2 presentation table instead of
  stacking it;
- the accepted visible color-only Commute Traffic Level treatment. The HTML also contains
  hidden Light traffic, Moderate traffic, or Heavy traffic text, and plain text states the
  same description. The color-only visible treatment is an explicit accepted exception for
  sighted Users who cannot distinguish the colors.

Classic Outlook is accepted when the desktop 2 × 2 table remains readable and no content is
lost. Responsive stacking is not a hard requirement for classic Outlook.

Release only after every required row passes every hard rule. Keep the exact message source,
screenshots, versions, Delivery Record identifiers, and command output with the release
evidence.
