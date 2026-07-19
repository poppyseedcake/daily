# Commute address search research

## Question

Can the existing place search be extended to find precise Commute endpoints, including a street and house number, while keeping the city-level search used by Weather?

## Findings

### Existing Open-Meteo search is intentionally city/postal-code oriented

The current implementation uses Open-Meteo's Geocoding API. Its documentation describes the endpoint as a search for cities or postal codes. The `name` parameter accepts a location name or postal code, and the documented result fields are a location name, coordinates, administrative areas, country, population, and related metadata. The response model does not expose street or house-number components.

Sources:

- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api), especially the search parameter and result-field documentation.
- Current implementation: `src/lib/server/weatherLocationGeocoding.ts`.

Conclusion: Open-Meteo should remain the Weather provider, but it is not a suitable source for precise Commute address suggestions.

### Google Places Autocomplete (New) matches the Commute interaction

Google documents Places Autocomplete (New) as a type-ahead service: it accepts full words and substrings while the user types and returns place predictions. Predictions can include addresses, and the request can be constrained by country, location bias/restriction, language, and place type. A prediction contains a Place ID and display text intended to be shown to the user.

For Commute, the UI should request address-like predictions, show the formatted suggestion, and only accept a point after the user selects a prediction. The selected Place ID is the stable identity to resolve into coordinates; the UI should not ask the user to enter latitude and longitude manually.

Sources:

- [Places Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete).
- [Places API (New) place types](https://developers.google.com/maps/documentation/places/web-service/place-types), including address types and the `street_number` address component.
- [Google's Place Autocomplete Data API](https://developers.google.com/maps/documentation/javascript/place-autocomplete-data), which describes type-ahead requests and session tokens.

### Selection should be followed by a minimal geocoding/details request

Google's address best-practices guidance recommends Places Autocomplete for incomplete or latency-sensitive user input, followed by geocoding the selected Place ID into a latitude/longitude. It also states that complete, unambiguous addresses are appropriate for the Geocoding API, while interactive input should use Autocomplete because it handles ambiguity and returns selectable alternatives.

For this product, the response stored in a Commute point should contain at least:

- the human-readable formatted address shown in the form;
- latitude and longitude used by the route estimator;
- optionally the Place ID, if the data model and provider terms allow retaining it.

The server should request only the fields needed for the selection and coordinates. Google documents field masks as a way to reduce response size, latency, and billing exposure.

Sources:

- [Geocoding API address best practices](https://developers.google.com/maps/documentation/geocoding/best-practices).
- [Geocoding API overview](https://developers.google.com/maps/documentation/geocoding/overview).
- [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details).
- [Choose fields to return](https://developers.google.com/maps/documentation/places/web-service/choose-fields).

## Recommended design

Use two separate search providers:

1. Weather continues using Open-Meteo city/postal-code search.
2. Commute uses a server-side Google Places Autocomplete (New) adapter with a short debounce, country restriction (initially likely `PL`), and address-focused filtering.
3. Selecting a suggestion resolves the Place ID to a formatted address and coordinates, then stores the resulting `CommutePoint`.
4. The Commute endpoint must reject saving a route when the text has not been matched to a selected suggestion. This prevents a merely typed or ambiguous address from silently becoming an approximate route endpoint.

The existing Google Maps usage guardrails should cover these calls. Autocomplete requests should use a session token per user search session, and the server should request a small field mask. The existing global cap must account for address-search calls separately from route-estimate calls so operators can see which feature consumes the allowance.

## Cost and product implications

- Google requires billing/API credentials for production use; Places Autocomplete has session-based billing guidance, so session-token handling is part of the implementation rather than an optional optimization.
- The UI must include the required Google attribution when displaying predictions without a map. This requirement is called out in the Autocomplete (New) documentation.
- A server-side adapter protects the API key and makes it possible to reuse the existing global quota gate, validation, error mapping, and deterministic test provider.
- Restricting to Poland improves relevance and reduces accidental cross-country matches, but it should be configurable if the app is expected to support other countries.
- Exact rooftop accuracy cannot be guaranteed for every address; the UI should display the returned formatted address and require explicit selection so the user can verify the endpoint.

## Implementation recommendation

Introduce a dedicated `commuteAddressSearch` provider rather than changing the shared weather geocoder. Keep the public UI shape compatible with the existing `CommutePoint` (`label`, `latitude`, `longitude`), but add an internal provider result with `placeId` and a two-step flow:

```text
typed address
  -> Places Autocomplete (New) suggestions
  -> user selects one suggestion
  -> Place ID geocode/details lookup
  -> formatted address + latitude/longitude
  -> CommutePoint
```

Before implementation, confirm which Google Maps credential/environment is available and whether the application wants Poland-only results or a configurable country list. No code change is included in this research note.
