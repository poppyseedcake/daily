# Daily Grid email-client rendering constraints

Research date: 2026-08-02

## Question

Which implementation constraints let the Daily Grid email retain its intended `2 x 2` desktop layout, single-column narrow layout, content, and accessibility in Gmail web/mobile, Apple Mail on iOS/macOS, Outlook on the web, and classic Outlook for Windows?

## Decision-ready conclusion

Build the email as a conservative, table-based document with a maximum width of roughly 600–680 px. Use nested layout tables with `role="presentation"`, inline critical styles, opaque background colors, explicit pixel dimensions, and system fonts. Put only the narrow-screen stacking rules in a small `<style>` block with a `max-width` media query. Classic Outlook may ignore the responsive enhancement but should retain the required desktop `2 x 2` table; Gmail supports the media query and the CSS properties needed to turn its two column cells into stacked blocks. This approach deliberately avoids CSS Grid, Flexbox, background images, transparency, and reliance on rounded corners.

The HTML must remain useful without downloaded images, and delivery must retain a complete plain-text alternative. Weather icons should therefore be fixed-size, remotely hosted raster images with meaningful alternative text (or empty alternative text only when the same condition is stated next to them); they must not carry unique information. The existing delivery boundary already sends both `html` and `text`, so this requirement fits the current architecture ([delivery source](../../src/lib/server/dailySummaryDelivery.ts), [renderer source](../../src/lib/dailySummaryRenderer.ts)).

One existing product decision needs explicit reconsideration: using green/yellow/red as the only *visible* traffic-level cue does not satisfy WCAG's use-of-color criterion. An `aria-label` or plain-text alternative helps screen-reader/plain-text users but does not help a sighted person who cannot distinguish the colors. W3C explicitly says that programmatically exposing color-coded information does not by itself satisfy this criterion. Either the duration must be understandable without the classification, making color truly supplementary, or the HTML needs another visible cue such as an icon, pattern, or short label ([W3C WCAG 1.4.1 explanation](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html)).

## Constraints by concern

### Layout and responsiveness

- Use tables for the structural grid. Microsoft documents that classic Outlook uses a Word-based HTML engine with limited CSS margin and padding support, and recommends applying spacing to table cells. It also recommends a message maximum width between 600 and 800 px ([Microsoft email-rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering)). A 600–680 px container is a conservative fit for the prototype's two-column cards.
- Use one outer presentation table with two rows and two columns in this source order: Weather, Commute, Calendar, Todo. Each card should be its own nested presentation table. This preserves the intended desktop result when advanced CSS is ignored.
- Add `role="presentation"` to every table used only for layout, and do not add data-table headers or captions to those tables. W3C recommends `role="presentation"` when a layout table is unavoidable so assistive technology does not expose false table semantics ([W3C layout-table guidance](https://www.w3.org/WAI/tutorials/tables/tips/)).
- Put width, padding, border, background, font, and text styling inline. Microsoft explicitly recommends inline CSS for custom emails and `td` padding for classic Outlook ([Microsoft email-rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering)).
- Put only progressive responsive rules in `<style>`, for example a `max-width` query that makes the two column cells `display:block`, `width:100%`, and gives them mobile spacing. Google officially supports `<style>` blocks, class selectors, `display`, `width`, `max-width`, padding, borders, and `max-width` media queries in Gmail ([Gmail CSS support](https://developers.google.com/workspace/gmail/design/css)).
- Do not use CSS Grid as the production layout. `grid-template-*` is absent from Gmail's official supported-property list, and classic Outlook's Word engine is the stricter baseline ([Gmail CSS support](https://developers.google.com/workspace/gmail/design/css), [Microsoft email-rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering)).
- Avoid structural dependence on Flexbox, absolute positioning, transparency, background images, or border radius. Solid colors and square corners are acceptable fallbacks. Microsoft states that classic Outlook does not natively support CSS background images on sections/columns, treats transparent background colors like background images, and can alter rounded treatments ([Microsoft email-rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering)).
- Use explicit percentage or pixel `line-height` on block text elements, not unitless values or line-height on spans. Microsoft documents larger line-height in classic Outlook and recommends percentages on `<p>` elements ([Microsoft email-rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering)).
- Use a system font stack and treat any custom/web font as nonessential. Microsoft documents unreliable custom-font fallback in classic Outlook ([Microsoft email-rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering)).
- Allow long user text to wrap and test unusually long unbroken route/task/event names. Microsoft warns that long words and non-breaking spaces can widen classic Outlook sections ([Microsoft email-rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering)). Avoid inserting `&nbsp;` into dynamic content.

### Images and weather symbols

- Treat external images as unavailable by default in acceptance tests. Classic Outlook blocks automatic Internet picture downloads by default; Gmail can be configured to ask before showing external images and may withhold them for suspicious messages; Apple Mail can block all remote content or fail to load it privately ([Microsoft picture-download behavior](https://support.microsoft.com/en-us/outlook/block-or-unblock-automatic-picture-downloads-in-classic-outlook-email-messages), [Gmail image settings](https://support.google.com/mail/answer/145919), [Apple Mail privacy settings](https://support.apple.com/en-gb/guide/mail/mlhlp1205/mac)).
- Do not put text, temperatures, traffic state, urgency, or status messages inside images. All four section states and all numerical data must remain ordinary HTML text.
- If the weather symbol is an `<img>`, set explicit HTML `width` and `height`, use a stable HTTPS asset URL, and include concise `alt` text such as `Sunny` when the condition is not otherwise present. When adjacent text already says the same thing, use `alt=""` so it is decorative. Verify both cases with images disabled.
- Prefer a small PNG asset set over CSS background images or inline SVG for the first implementation. This is an implementation inference from the documented classic Outlook background-image limitations; official client documentation does not provide a complete, current cross-client SVG support contract.
- Tracking/open analytics based on image loads should not be interpreted as reliable user-open times. Apple may privately fetch remote content on receipt, while blocked-image modes may not fetch it at all ([Apple Mail Privacy Protection](https://support.apple.com/en-gb/guide/mail/mlhlp1205/mac), [Microsoft picture-download behavior](https://support.microsoft.com/en-us/outlook/block-or-unblock-automatic-picture-downloads-in-classic-outlook-email-messages)).

### Color and dark appearance

- Use fully opaque background and text colors at every important container/text boundary. Do not assume transparent layers will composite consistently in classic Outlook ([Microsoft email-rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering)).
- Although Daily offers only one authored palette, test that palette with each client's/OS's dark appearance enabled. Microsoft says clients may automatically alter email colors and that this behavior varies by client; Apple Mail on macOS also has a user setting to display messages on dark backgrounds ([Microsoft email-rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering), [Apple Mail viewing settings](https://support.apple.com/en-gb/guide/mail/cpmlprefview/mac)). A single product theme does not guarantee a single rendered appearance.
- Do not use color as the only visible carrier of meaning. In particular, the agreed traffic colors require either a visible secondary cue or a documented decision that traffic classification is decorative and only the duration is required information ([W3C WCAG 1.4.1 explanation](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html)). The same rule applies to calendar colors and Todo urgency dots unless their meanings are present in nearby visible text or another distinguishable shape.

### Semantics and plain text

- Preserve a real text alternative rather than deriving it by stripping tags. The current renderer and Resend request already provide independent `text` and `html` fields ([delivery source](../../src/lib/server/dailySummaryDelivery.ts)). The MIME standard defines `multipart/alternative` for interchangeable representations of the same content ([RFC 2046 section 5.1.4](https://www.rfc-editor.org/rfc/rfc2046.html#section-5.1.4)). Delivery verification should inspect a received `.eml` and confirm both MIME alternatives exist.
- Keep the HTML reading order identical to the text version: header; Weather; Commute; Calendar; Todo; footer. Responsive styling may change columns into blocks but must not reorder nodes.
- Include section headings as real heading elements where clients preserve them, with informative text for every empty, paused, not-configured, or unavailable state. Do not rely on icons or colored borders to identify those states.
- Treat visually hidden accessibility text and ARIA as progressive enhancements, not the only fallback. No first-party source found in this research publishes a complete ARIA/visually-hidden support matrix for all four target clients. Confirm the generated HTML with VoiceOver in Apple Mail and at least one Windows screen reader in classic Outlook. The plain-text alternative does not by itself make the HTML view accessible.

### Size and content growth

- Keep markup deliberately small: shared structural helpers, minimal nesting, no base64 images, and no repeated large style blocks. Microsoft documents that Gmail truncates sufficiently large emails and advises simpler layout, smaller images, and text-based content, but the primary source does not state a stable byte threshold ([Microsoft email-rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering)).
- Because Calendar and Todo are intentionally unbounded, measure the encoded HTML size in renderer tests with worst-case fixtures. If the size budget cannot be met while showing all items, that is a product decision rather than a client-specific CSS workaround.

## Acceptance matrix

The implementation should not be accepted from browser preview or renderer snapshots alone. Send the exact production MIME through the production provider to accounts opened in the real target clients.

| Client | Required widths/modes | Required checks |
| --- | --- | --- |
| Gmail web | wide and narrow browser viewport; images on and `Ask before displaying` | `2 x 2` wide, one column narrow, source order, all text with images off, no clipping |
| Gmail iOS/Android | representative narrow phone; images on/off where available | one column, no horizontal scroll, readable tap target/footer link, long-content scroll |
| Apple Mail macOS | light and dark message backgrounds; remote content on and blocked | `2 x 2`, palette legibility after client treatment, image fallback, VoiceOver reading order |
| Apple Mail iOS | representative narrow phone; light/dark appearance; remote content on/off | one column, no horizontal scroll, image fallback, VoiceOver labels/order |
| Outlook on the web | wide and narrow browser viewport; light/dark appearance | `2 x 2` wide, one column narrow, borders/backgrounds/links, long strings |
| Classic Outlook Windows | reading pane and opened message; external images blocked and enabled; light/dark if offered | stable `2 x 2`, `td` spacing, line-height, system-font fallback, no overflow, all information with images blocked |

For every client, exercise at least these payloads:

1. full realistic data in every section;
2. paused, not configured, empty, and temporarily unavailable states;
3. multiple commute routes, seven calendar days with dense events, and many Todo groups/tasks;
4. very long names/addresses/titles and non-ASCII text;
5. Luna summary present and absent;
6. external images loaded and blocked;
7. HTML view plus the received plain-text part.

Store dated screenshots (or screen recordings for screen-reader checks), client/version, OS/version, viewport, and the received `.eml` as acceptance evidence. Re-run the matrix after structural template changes because Microsoft explicitly notes that client behavior evolves and requires cross-client validation ([Microsoft email-rendering guidance](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering)).

## Unresolved uncertainties

1. Microsoft and Apple do not publish a complete, versioned CSS/ARIA support matrix for Outlook on the web or Apple Mail. The exact behavior of the stacking rule, `aria-label`, visually hidden text, and client-driven dark recoloring must be established empirically on the target versions.
2. The official sources consulted do not state a stable Gmail clipping threshold. A conservative internal HTML-size budget should be selected after measuring the new template and confirming delivery in Gmail with the largest supported dataset.
3. The best weather-icon transport (remote PNG versus content-ID attachment) remains a delivery-size and client-test question. The product does not need the icon to survive image blocking if the condition remains available as text.
4. The agreed color-only visible traffic classification conflicts with WCAG 1.4.1 if that classification is meaningful information. This needs an explicit product/accessibility decision before the final template specification is complete.
