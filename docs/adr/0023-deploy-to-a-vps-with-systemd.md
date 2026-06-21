# Deploy to a VPS With systemd

Daily deploys to a self-managed VPS using systemd for the SvelteKit Node server and the scheduled summary worker timer. This fits the SQLite database choice, keeps cron-like scheduling under direct control, and makes database file backups and operational configuration explicit.

The VPS deployment includes safe daily SQLite backups, pre-migration backups, and backup retention outside the application directory.
