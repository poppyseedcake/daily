# Use a Cron-Driven Idempotent Summary Worker

Daily generates scheduled summaries through a worker invoked every minute by cron or a systemd timer. The worker is idempotent through Delivery Record uniqueness, uses top-level, per-user, and per-section error handling, and logs unexpected failures without private User content so one failure does not stop other due summaries from being processed.

Each User stores the next scheduled summary time as `next_summary_at` in UTC. The application recalculates it after each scheduled attempt and whenever Summary Time, User Time Zone, Summary Delivery, or enabled content changes.

When a User is due but has no content that qualifies for sending, the worker skips email delivery, does not create a Delivery Record, logs only non-private technical metadata, and recalculates the next scheduled summary time.
