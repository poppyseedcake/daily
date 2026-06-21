# Include a Minimal Admin Panel in the MVP

Daily includes a minimal Admin Panel in the MVP for operational visibility and control. The panel is limited to application health, Google Maps usage and kill switch state, delivery health, and technical logs that exclude private User content, so Administrators can operate the service without becoming a support interface for reading User data.

Administrator access is granted by a deployment-configured allowlist of verified Google email addresses rather than by database-managed roles in the MVP.

The Admin Panel can toggle the SQLite-backed Google Maps kill switch, while an environment-level kill switch remains the higher-priority override.
