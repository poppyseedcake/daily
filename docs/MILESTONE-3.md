# Milestone 3: Email Delivery Foundation

Milestone 3 adds real test email delivery for signed-in Users and makes the Daily Summary renderer production-shaped.

## Scope

- Resend integration for test Daily Summary delivery
- Send test action available only to signed-in Users
- Delivery Records for scheduled and test delivery attempts, without storing full email content
- Delivery Record history visible to Users for the last 30 days
- Shared Daily Summary renderer used by preview and email delivery
- HTML and plain-text email output
- Light and dark Summary Theme support in delivered emails
- Unavailable Section rendering in email templates
- Resend provider message ID and delivery status metadata stored in Delivery Records
- Tests for email rendering, text fallback, test delivery flow, and Delivery Record creation

## Out of Scope

- Scheduled Daily Summary worker
- Delivery retry automation
- Google Calendar live data
- Open-Meteo live forecasts
- Google Maps live estimates
- Provider webhooks beyond metadata needed for the MVP
