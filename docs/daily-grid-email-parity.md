# Daily Grid email parity

The shared delivery renderer follows the email surface in
`/prototype/daily-summary?variant=b`: a 790px fluid sheet, Daily branding,
centered greeting, local date/time, four connected sections, prominent Weather
and Commute values, a seven-date Calendar strip, and grouped Todo rows.

The renderer uses inline critical styles, PNG versions of the prototype's Lucide
icons, and a column-width fallback that stacks sections even without head styles.
The row owns its horizontal border and full-height column rule, so unequal content
lengths cannot leave floating separators. The column CSS properties are listed in
[Gmail’s supported CSS](https://developers.google.com/workspace/gmail/design/css).
Classic Outlook receives conditional presentation tables. Responsive clients use
equal-height table cells on desktop and full-width sections on narrow screens.
The PNG assets are generated with `node scripts/generate-email-icons.mjs`.

Live content takes precedence over synthetic prototype copy. The greeting uses the same time-of-day and first-name rules as the workspace,
based on generation time in the User Time Zone. Weather includes the configured city, precipitation and forecast
summary; Calendar includes all events and their Selected Calendar names; Todo
includes all tasks without the prototype's JavaScript pagination. Plain text
retains the full section content and urgency/traffic descriptions.

Generate synthetic review artifacts (no messages are sent):

```sh
npx vite-node --config vite.worker.config.ts scripts/render-email-verification.ts /tmp/daily-email-review
cp -r static/email-icons /tmp/daily-email-review/
python3 -m http.server 4176 --directory /tmp/daily-email-review
```

`prototype-b.html` has the prototype's content density. `all-active.html`,
`extreme.html`, and four rotations cover long content and section states. Each
has a `-without-head-css.html` counterpart and complete plain-text output.

Validation:

- Renderer tests cover all 400 supported section-state combinations and local
  date/ISO week rollover.
- The Test Delivery integration test checks the exact HTML/text submitted to
  Resend and metadata-only Delivery Records.
- `tests/e2e/daily-summary-email.spec.ts` checks widths 1280, 390, and 320px,
  with/without head styles and temperatures 18°, 20.7°, and −20.7°.
  It also verifies dense-grid separators and accessible urgency, traffic and units
  after removing head styles and all ARIA attributes. Hidden descriptions use inline
  zero-sized spans and stay in the accessibility tree; they do not use `display:none`.
- Independent visual review passed for desktop, narrow, and stripped-style HTML.

These checks establish renderer parity, not real Gmail delivery. After deployment,
send a Test Delivery through Daily and inspect its received Gmail HTML and appearance.
Real email-client verification is recorded separately using
`docs/email-client-verification-record.md`.


## Gmail follow-up

Repeated Test Deliveries previously used the same dated subject. Gmail grouped
those messages and hid unchanged Commute, Calendar and Todo content as quoted
text behind “Show trimmed content”. Test subjects now include the local generation
time through seconds and the unique Delivery Record ID to create separate
conversations even for simultaneous tests, following
[Google’s guidance](https://support.google.com/mail/answer/5900?hl=en).
Scheduled subjects already vary by local date.

Gmail’s supported selector subset does not retain the previous `:first-child`
border rule. The desktop center divider now uses an explicit left-cell class;
classic Outlook uses an inline cell border. The browser regression removes
pseudo-class selector rules before checking the actual borders. Column rules remain
the stripped-head fallback; they do not substitute for a border in table layout.

Weather shows `Precip. <percent>% (<intensity>)` under wind and condition text.
Intensity is derived from the daily forecast’s
[WMO weather code](https://open-meteo.com/en/docs#weathervariables),
independently of probability. The labels are None, Light, Moderate, Heavy or
Unknown when the code does not establish one intensity.

Received Gmail acceptance must inspect the initial message before clicking any
ellipsis: all four section headings and contents have positive geometry, no
Gmail-added hidden quoted-content ancestor, and a real border on both left cells.
The previous received-message assessment inspected expanded content and missed
these two Gmail-specific failures; it does not establish this follow-up’s acceptance.
