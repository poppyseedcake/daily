# Google Maps Usage Caps

Daily reserves one unit of shared Google Maps usage before each protected provider call. Configure the limits with `GOOGLE_MAPS_GLOBAL_DAILY_CAP` and `GOOGLE_MAPS_GLOBAL_MONTHLY_CAP`; both values must be positive integers.

Configure the high per-person abuse limit with `GOOGLE_MAPS_PER_PERSON_DAILY_LIMIT` and provide an independent secret of at least 32 bytes in `GOOGLE_MAPS_ATTRIBUTION_SECRET`. Signed-in Users are attributed from trusted session identity. Visitors receive a random, first-party HttpOnly cookie. Both values are converted at the server boundary to keyed SHA-256 identities before accounting; raw User IDs, Visitor tokens, and the attribution secret must not be included in logs, diagnostics, or Admin Panel output.

All accounting uses UTC. Daily periods start at `00:00:00 UTC`, and monthly periods start at `00:00:00 UTC` on the first calendar day. The same UTC period keys are used for stored counters, operational usage snapshots, rollover, and future alerts. User Time Zone does not affect these global periods.

Per-person daily limits reset at the same `00:00:00 UTC` boundary. Reaching one person's limit blocks only that identity for the remainder of the UTC day and does not change global suspension state.

Point-selection and Commute Estimate calls contribute to the same daily and monthly totals. Their category counts remain separately available in the privacy-safe usage snapshot. Once either total reaches its configured cap, the gate rejects further calls without invoking Google Maps. A reserved call remains counted if Google Maps later fails because it may already have consumed provider quota.
