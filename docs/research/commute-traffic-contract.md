# Commute traffic contract

Research date: 2026-08-02

## Decision

Keep the existing Google Routes `ComputeRoutes` request per qualifying Commute Route and continue using `DRIVE` with `TRAFFIC_AWARE`. Extend the response field mask from `routes.duration` to `routes.duration,routes.staticDuration`, parse both values from the same returned route, and carry both through the provider/gateway boundary in seconds (or another lossless duration unit) until traffic classification is complete.

Google defines `duration` for `TRAFFIC_AWARE` as an ETA that considers real-time traffic and `staticDuration` as an ETA based only on historical traffic information. With no explicit `departureTime`, the request time is used, which matches a summary generated while the User is preparing to leave. `TRAFFIC_AWARE` intentionally trades some route-search quality for lower latency; `TRAFFIC_AWARE_OPTIMAL` is the mode Google documents as equivalent to Google Maps, but it has the highest latency. The agreed contract does not require that upgrade because Daily derives its own route-level color instead of claiming to reproduce Google Maps' UI classification. [Google: traffic-aware routing and departure time](https://developers.google.com/maps/documentation/routes/config_trade_offs) [Google: routing preference reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RoutingPreference)

For each route, classify traffic from the two unrounded values in the same response:

```text
delayRatio = max(0, duration - staticDuration) / staticDuration

green  when delayRatio < 0.10
yellow when 0.10 <= delayRatio < 0.25
red    when delayRatio >= 0.25
```

Compute the ratio before rounding. Round only the traffic-aware `duration` for the visible `N min` value. A duration below the static duration is therefore green rather than presented as "negative congestion." If `staticDuration` is zero, use green when both durations are zero and red when `duration` is positive (an effectively unbounded increase); reject negative, non-finite, missing, or malformed values as an unavailable result.

The visible email communicates the traffic level only through the color of the duration. The same classification must also produce an accessible/plain-text label:

| Traffic level | Visible color | Screen-reader and plain-text label |
| --- | --- | --- |
| `< 10%` | green | `Light traffic` |
| `10%` to `< 25%` | yellow | `Moderate traffic` |
| `>= 25%` | red | `Heavy traffic` |

These are Daily-defined thresholds. Google documents traffic flow categories, but it does not return a single green/yellow/red status for a route from the two duration fields. The ratio is a useful user-facing proxy, not Google's consumer Maps color and not a measurement of congestion on every segment. `staticDuration` also describes the selected returned route; it is not a separately optimized traffic-unaware route. [Google: traffic conditions and duration semantics](https://developers.google.com/maps/documentation/routes/config_trade_offs) [Google: `Route.duration` and `Route.staticDuration`](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)

## Route and failure behavior

The generation layer should preserve all qualifying routes, in their saved order, with no pagination or truncation. A route qualifies when the Commute Section is active, the route is enabled, and today in the User Time Zone is included in that route's configured days. No Routes request should be made for a paused/not-configured section or for a day with no qualifying route.

For each available route, the email contract needs:

- a fixed origin heading `Home` and the saved origin label below it;
- the User's route name as the destination heading and the saved destination label below it;
- rounded traffic-aware minutes;
- the derived traffic level/color and its accessible/plain-text label.

Preserve the existing failure split: a genuine no-route result can remain unavailable for that one route while the other route rows render; a provider failure, usage-gate suspension, schema failure, or other non-route-specific failure makes the Commute Section `Temporarily unavailable`. The current `Promise.all` behavior already fetches every qualifying route concurrently, but the output model must be widened so successful results are not reduced to only `routeName` and `durationMinutes`.

## Privacy and retention

The provider request already sends only endpoint coordinates, not saved route names or address labels. Continue that boundary. Google necessarily receives the origin and destination coordinates needed to calculate the route, while Daily should expose only the parsed durations outside the provider and must not retain the raw response. Live values should be fetched at generation time and remain ephemeral; technical logs must not include coordinates, route/address labels, duration pairs, raw provider payloads, or rendered email content. This is consistent with the repository's existing live-fetch and privacy ADRs (`docs/adr/0002-fetch-weather-and-commute-live.md` and `docs/adr/0005-keep-technical-logs-free-of-private-content.md`).

The field mask should remain narrow. Google requires a response field mask and recommends selecting only needed fields for stable latency and smaller responses. Adding `routes.staticDuration` is sufficient; no polyline, speed-reading intervals, route token, instructions, or travel advisory is needed. [Google: Compute Routes field masks](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)

## Existing implementation gap

The current implementation in `src/lib/server/googleRoutesProvider.ts`:

- requests `routes.duration` only;
- parses only `{ duration }`;
- returns only `{ durationMinutes }`;
- already sends `DRIVE`, `TRAFFIC_AWARE`, endpoint coordinates, and no labels;
- already avoids retaining the raw response.

`src/lib/server/googleMapsRequestGateway.ts` validates only `durationMinutes`, and `src/lib/dailySummaryPreview.ts` reduces each available estimate to a rounded duration plus route name. `src/lib/dailySummaryRenderer.ts` consequently cannot show endpoint labels, a traffic color, or the non-visual traffic label. The implementation plan must widen each of these contracts and their deterministic fakes/tests.

The existing use of `TRAFFIC_AWARE` already triggers the Routes Compute Routes Pro SKU. Adding `staticDuration` to the field mask does not introduce a different routing modifier; Google bills Compute Routes per request and identifies `TRAFFIC_AWARE`/`TRAFFIC_AWARE_OPTIMAL` as Pro features. The app still makes one billed request per qualifying route, up to its existing maximum of five. [Google: Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing)

## Verification targets

- Provider test: exact field mask contains both fields; both protobuf-duration strings accept fractional seconds; malformed/missing values fail closed; raw payload does not escape.
- Gateway test: validates two finite nonnegative durations and preserves existing unavailable reasons.
- Generation test: every qualifying route appears in stable order; thresholds cover just below/at 10% and 25%; classification uses unrounded values; one `route-unavailable` does not remove successful routes; systemic/provider failure yields `Temporarily unavailable`.
- Renderer tests: destination uses route name plus saved destination label, origin uses `Home` plus saved origin label, visible minutes have the correct color, accessible/plain text contains the traffic label, and all routes render without truncation.
- Privacy test: provider request body excludes route names/address labels and diagnostics contain no route content or raw responses.

## Unresolved uncertainty

The 10%/25% thresholds are product decisions rather than Google-defined route-color boundaries. They should ship as named constants with boundary tests and be revisited using aggregate, privacy-safe product feedback; there is no primary Google source that validates them as equivalent to the colors shown in Google Maps.
