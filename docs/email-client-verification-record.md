# Daily Grid Real-Client Verification Record

Template for [issue #194](https://github.com/poppyseedcake/daily/issues/194). Copy this
file into a private evidence directory for one immutable candidate before filling it in.
This unfilled template does not establish any delivery or client result.

Initial decision: **INCOMPLETE — release gate has not passed.**

## Candidate and prerequisites

- Full release commit SHA: PENDING
- Deployed release manifest / artifact identity: PENDING
- Package-lock SHA-256: PENDING
- Canonical production origin and expected Open Daily URL: PENDING
- Dedicated verification User and verified Summary Recipient: PENDING
- Inspection date/time with time zone and operator: PENDING
- Private evidence directory: PENDING
- Candidate CI, typecheck, full test suite, and build evidence: PENDING
- `DAILY_RELEASE_SHA=<candidate-sha> npm run verify:email-client-kit` output: PENDING
- Scheduled Delivery stopped; evidence of timer state: PENDING
- Deterministic fixture setup through production generation and Test Delivery: PENDING

Pin the deployed candidate before sending. If code changes, begin a new record and rerun
every required inspection for the new candidate. Local command output from a dirty working
tree is diagnostic only. Keep credentials, tokens, and rendered messages out of repository
commits, technical logs, and the application database. Retain message content only in the
private evidence bundle required by this manual gate.

Use the [verification kit](email-client-verification-kit.md) and
[production deployment procedure](production-deployment.md). The automated Test Delivery
test supplies generated fixture input directly and stubs Resend; it cannot establish that
production generation can reproduce these fixtures. Record how each deterministic fixture
was prepared on the verification deployment. Do not substitute a hand-rendered Resend
submission for the signed-in production Test Delivery action.

## Exact client versions

Record actual build numbers at inspection time. For “current” versions, retain the dated
vendor release reference used to establish currency. For perpetual Outlook, record the
version and vendor support reference establishing that it is the oldest supported version.

| Row | Client | Required OS | Required browser / application | Exact OS build | Exact browser / app build and channel | Version/support reference | Operator / inspected at |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gmail-web` | Gmail web | Windows | Current Chrome | PENDING | PENDING | PENDING | PENDING |
| `gmail-ios` | Gmail mobile | Current iOS | Gmail app | PENDING | PENDING | PENDING | PENDING |
| `gmail-android` | Gmail mobile | Current Android | Gmail app | PENDING | PENDING | PENDING | PENDING |
| `apple-ios` | Apple Mail | Current iOS | Apple Mail | PENDING | PENDING | PENDING | PENDING |
| `apple-macos` | Apple Mail | Current macOS | Apple Mail | PENDING | PENDING | PENDING | PENDING |
| `outlook-web` | Outlook web | Windows | Current Chrome | PENDING | PENDING | PENDING | PENDING |
| `outlook-current` | Classic Outlook | Windows | Microsoft 365 Current Channel | PENDING | PENDING | PENDING | PENDING |
| `outlook-perpetual` | Classic Outlook | Windows | Oldest supported perpetual version | PENDING | PENDING | PENDING | PENDING |

## Forty required inspections

Each cell points to a completed message inspection record and its evidence paths. Use
`PASS`, `FAIL`, or `NOT RUN`; never count a missing inspection as a pass. All cells start
as `NOT RUN`. Receipt in one client does not prove rendering in another client.

| Row | all-active | rotate-01 | rotate-02 | rotate-03 | rotate-04 |
| --- | --- | --- | --- | --- | --- |
| `gmail-web` | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| `gmail-ios` | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| `gmail-android` | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| `apple-ios` | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| `apple-macos` | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| `outlook-web` | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| `outlook-current` | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| `outlook-perpetual` | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |

## Message inspection record

Copy this block for each client/fixture cell. Evidence must identify the same actual Test
Delivery attempt by recipient, subject, Resend message id, and Delivery Record id.

- Client row and fixture id: PENDING
- Candidate SHA; inspected at; operator: PENDING
- Fixture setup evidence and expected Weather / Commute / Calendar / Todo states: PENDING
- Delivery requested/completed timestamps: PENDING
- Intended and actual recipient: PENDING
- Expected and actual subject (`Test · Your Daily Summary · <weekday, day month>`): PENDING
- Resend acceptance evidence and provider message id: PENDING
- Exactly one new `sent` Test Delivery Record; record id; metadata-only record evidence: PENDING
- Images-enabled screenshot and complete-content evidence: PENDING
- Wide and narrow screenshots where supported (or explicit unsupported reason): PENDING
- Blocked-image evidence and semantic result: PENDING
- Complete plain-text alternative evidence and semantic result: PENDING
- Visible Open Daily link; actual absolute target; successful navigation evidence: PENDING
- Other message links and successful navigation evidence, if present: PENDING
- Original source / MIME evidence path, or export unavailable with reason: PENDING
- Weather, Commute, Calendar, Todo each appear exactly once, in order and expected state: PENDING
- All content readable and complete; no clipping, overlap, or unexpected horizontal scroll: PENDING
- Weather facts, Commute routes/traffic, Calendar dates/events, Todo order/urgency, state
  explanations, and Open Daily meaning preserved: PENDING
- Cosmetic differences and applicable accepted exception: PENDING
- Result (`PASS` / `FAIL` / `NOT RUN`), failure description, and failing evidence paths: NOT RUN

Inspect `all-active` with images enabled, images blocked, and complete plain text on
every client row. Retain state, content, and link evidence for every rotating message.
Only the active fixture requires a separate blocked-image screenshot and plain-text
inspection; mark those fields “not required for rotation” where appropriate. MIME
unavailability needs an explicit reason; it must not silently remove other evidence.

## Decision

- Passed client/fixture inspections: 0 / 40
- Failed inspections and failing evidence: NONE RECORDED — no inspections performed
- Missing inspections or required evidence: ALL
- Accepted cosmetic differences: NONE RECORDED
- Decision (`PASS` / `REJECT` / `INCOMPLETE`): INCOMPLETE
- Decision date/time and operator: PENDING

Any semantic or operational failure rejects the candidate, even if the other cells pass.
Retain the failing evidence. Missing access or evidence leaves the gate incomplete.
Only forty passing inspections with all required evidence permit a passing decision.
Classic Outlook may retain a readable 2 × 2 layout. The visible color-only Commute Traffic
Level exception is accepted only with the specified hidden HTML and explicit plain-text
meaning. Apply all hard failure and cosmetic rules from the verification kit.
