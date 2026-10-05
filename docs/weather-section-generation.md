# Weather Section generation

Candidate 3 from the architecture review concentrates Weather Section policy
inside the existing Daily Summary generation module. Daily Summary generation,
scheduled delivery, test delivery, and HTML/text rendering remain its callers.

The Weather Section generation interface returns one section result. It owns
paused, unconfigured, and unavailable states; selection of the generation date in
the User Time Zone; one mapping of forecast facts; optional sentence fallback;
and diagnostic correlation. A missing or rejected sentence never discards valid
forecast facts. Failed diagnostics never prevent generation.

Open-Meteo and the sentence provider remain transport adapters. Open-Meteo keeps
request timeouts, unit validation, and normalized hourly input. The sentence
adapter keeps its prompt, validation, retry, and timeout rules. Production
composition supplies these adapters and a diagnostic sink without inspecting
forecast contents. Diagnostic events include technical classifications, elapsed
time, attempts, HTTP status when available, and an opaque generation trace ID;
they exclude location labels, coordinates, forecast payloads, sentence text,
provider error contents, and User identity.

Daily-only forecasts remain supported for existing adapters. Modern forecasts
require current temperature, the selected day's required facts, wind, and an
observation time before requesting a sentence. A paused section performs no
forecast or sentence work.

Verification crosses the Weather Section generation interface for missing hourly
context, rejected or failed sentences, forecast failure, paused Weather, local
date selection, diagnostic correlation, and failed diagnostics. Existing Daily
Summary and HTML/text rendering checks protect integration and presentation
parity. Transport contract tests remain with their adapters; orchestration tests
move to the deeper interface.

No persistence, schema, delivery scheduling, UI, external telemetry integration,
or provider prompt change is required. This preserves ADR-0002, ADR-0005,
ADR-0014, ADR-0019, and ADR-0024.
