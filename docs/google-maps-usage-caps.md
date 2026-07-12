# Google Maps Usage Caps

Daily reserves one unit of shared Google Maps usage before each protected provider call. Configure the limits with `GOOGLE_MAPS_GLOBAL_DAILY_CAP` and `GOOGLE_MAPS_GLOBAL_MONTHLY_CAP`; both values must be positive integers.

All accounting uses UTC. Daily periods start at `00:00:00 UTC`, and monthly periods start at `00:00:00 UTC` on the first calendar day. The same UTC period keys are used for stored counters, operational usage snapshots, rollover, and future alerts. User Time Zone does not affect these global periods.

Point-selection and Commute Estimate calls contribute to the same daily and monthly totals. Their category counts remain separately available in the privacy-safe usage snapshot. Once either total reaches its configured cap, the gate rejects further calls without invoking Google Maps. A reserved call remains counted if Google Maps later fails because it may already have consumed provider quota.
