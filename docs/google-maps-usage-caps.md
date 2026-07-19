# Google Maps Usage Caps

Daily reserves one unit of shared Google Maps usage before each protected provider call. Configure the limits with `GOOGLE_MAPS_GLOBAL_DAILY_CAP` and `GOOGLE_MAPS_GLOBAL_MONTHLY_CAP`; both values must be positive integers.

Google Places address lookup has an additional fixed monthly cap of 10,000 provider calls. Every Autocomplete request and every selected-address Place Details request consumes one unit. The Admin Panel reports these two categories separately. Reaching this cap blocks further address lookup until the next UTC month without blocking already-saved Commute Route estimates, unless a shared Google Maps cap has also been reached.

Configure the high per-person abuse limit with `GOOGLE_MAPS_PER_PERSON_DAILY_LIMIT` and provide an independent secret of at least 32 bytes in `GOOGLE_MAPS_ATTRIBUTION_SECRET`. Signed-in Users are attributed from trusted session identity. Visitors are attributed from the trusted client address and normalized User-Agent at the server request boundary, so clearing cookies or opening a fresh browser profile does not reset their usage bucket. Both modes are converted to keyed SHA-256 identities before accounting; raw User IDs, client addresses, User-Agent values, and the attribution secret must not be included in logs, diagnostics, or Admin Panel output.

All accounting uses UTC. Daily periods start at `00:00:00 UTC`, and monthly periods start at `00:00:00 UTC` on the first calendar day. The same UTC period keys are used for stored counters, operational usage snapshots, rollover, and future alerts. User Time Zone does not affect these global periods.

Per-person daily limits reset at the same `00:00:00 UTC` boundary. Reaching one person's limit blocks only that identity for the remainder of the UTC day and does not change global suspension state.

Point-selection and Commute Estimate calls contribute to the same daily and monthly totals. Their category counts remain separately available in the privacy-safe usage snapshot. Once either total reaches its configured cap, the gate rejects further calls without invoking Google Maps. A reserved call remains counted if Google Maps later fails because it may already have consumed provider quota.

Configure `GOOGLE_MAPS_OPERATOR_ALERT_EMAIL` to send one operator email through the existing Resend configuration when a daily or monthly global cap is reached. The alert includes the UTC periods, aggregate counters by call category, cap type, and suspension reason. Its delivery claim and outcome are stored in SQLite by cap type and period, so concurrent requests and restarts cannot duplicate it. A failed alert remains marked failed and is reported with privacy-safe diagnostics; it never changes Maps suspension and is not retried by later blocked requests.

Authorized Administrators can view the current UTC daily and monthly totals, category totals, configured caps, and effective Maps state in the Admin Panel. The panel stores its kill switch in SQLite, so the setting survives restarts. `GOOGLE_MAPS_KILL_SWITCH` remains owned by deployment configuration, takes precedence over the Admin Panel control, and cannot be cleared from the UI. Operational output contains aggregate counts and control state only; it never includes person attribution, Commute Route configuration, provider payloads, or rendered summaries.
