# Use Temporal for Time Zone Calculations

Daily uses the Temporal polyfill for Summary Time, User Time Zone, Week Ahead, and `next_summary_at` calculations. Temporal's explicit `Instant`, `PlainTime`, and time-zone-aware types reduce ambiguity around local calendar dates and daylight saving transitions compared with plain JavaScript `Date` arithmetic.
