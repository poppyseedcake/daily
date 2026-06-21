# Use Google Maps With Cost Guardrails

Daily starts with Google Maps Platform for map point selection and traffic-aware driving estimates. Because Maps APIs can generate variable cost on the application owner's account, the application must enforce a shared limit across paid or quota-consuming Google Maps calls, with high per-person daily limits intended only to prevent abuse and a configurable global cap tied to the free Google Maps allowance. When the global free allowance is exhausted, Daily suspends Google Maps functionality and shows a clear unavailable state instead of silently generating extra cost.

Daily tracks Google Maps usage in SQLite against configurable daily and monthly global caps, including monthly request totals for monitoring free-tier consumption. The monthly cap is the main free-tier guardrail, while the daily cap prevents burning too much of the monthly allowance in one day. The application also supports a manual kill switch that disables Google Maps calls regardless of current usage; an environment-level kill switch takes precedence over the Admin Panel kill switch stored in SQLite.

When a global Google Maps cap is reached, Daily sends a single operator alert for that cap period and exposes the suspended state in the Admin Panel.
