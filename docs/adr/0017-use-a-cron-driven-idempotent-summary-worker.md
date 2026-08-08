# Use a Cron-Driven Idempotent Summary Worker

Daily generates scheduled summaries through a worker invoked every minute by cron or a systemd timer. The worker is idempotent through Delivery Record uniqueness, uses top-level, per-user, and per-section error handling, and logs unexpected failures without private User content so one failure does not stop other due summaries from being processed.

Each User stores the next scheduled summary time as `next_summary_at` in UTC. The application recalculates it after each scheduled attempt and whenever Summary Time, User Time Zone, or Summary Delivery changes. Summary Section pause changes do not move the pending occurrence.

When a User is due, the worker generates and submits one Daily Summary with the four fixed Summary Sections whenever Summary Delivery is enabled. Paused, unconfigured, empty, and unavailable sections remain in the message as status states. The worker creates the scheduled Delivery Record for the provider submission and recalculates the next scheduled summary time.
