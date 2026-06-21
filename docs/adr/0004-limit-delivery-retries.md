# Limit Delivery Retries

Daily retries failed email delivery only for a short period after the configured Summary Time. The summary is time-sensitive, so bounded retries improve resilience to temporary provider failures without sending stale day-planning email hours after it was expected.
