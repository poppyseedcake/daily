# Milestone 7: Scheduled Daily Summaries

Milestone 7 turns manual preview and test delivery into automated Daily Summary delivery.

## Scope

- `next_summary_at` stored in UTC for each User
- Temporal-based calculation of next summary time from Summary Time and User Time Zone
- Cron or systemd timer that invokes the summary worker every minute
- Worker query for due Users
- Idempotent scheduled delivery through Delivery Record uniqueness
- Top-level, per-user, and per-section error handling
- Short bounded retry behavior for failed email delivery
- Submit all four Summary Sections for every due occurrence while Summary Delivery is enabled, including paused, unconfigured, empty, and unavailable states
- Unavailable Section behavior when one enabled section fails
- Scheduled Delivery Records without full email content
- User-visible delivery history for scheduled attempts
- Tests for scheduling, DST behavior, idempotency, all-state delivery, retry limits, and section-level degradation

## Out of Scope

- VPS deployment automation
- Production backup automation
- Advanced queue systems such as Redis or BullMQ
- Multi-region scheduling
- Sending stale summaries hours after Summary Time
