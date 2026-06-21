# Milestone 8: Production Hardening

Milestone 8 prepares Daily for operating on the target VPS with observability, backups, CI, and operational controls.

## Scope

- VPS deployment documentation and scripts for the SvelteKit Node server
- systemd service for the web application
- systemd timer for the scheduled summary worker
- Safe daily SQLite backups
- Pre-migration SQLite backups
- Backup retention outside the application directory
- GitHub Actions CI for install, Svelte checks, tests, and production build
- Technical logs that exclude private User content
- Admin Panel delivery health view
- Admin Panel technical log view without private content
- Admin Panel Google Maps usage and kill switch controls
- Operator alerts for Google Maps cap suspension
- Account deletion flow that removes User data and stops future delivery
- Tests or deployment checks for backup commands, worker service configuration, and critical admin actions

## Out of Scope

- Paid plans or subscriptions
- Database migration to PostgreSQL
- Dedicated mobile app or PWA install flow
- Multi-language localization
- Admin support tools for reading private User content
