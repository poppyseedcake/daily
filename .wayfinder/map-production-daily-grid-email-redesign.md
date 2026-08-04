---
title: Map the production Daily Grid email redesign
status: open
github_url: https://github.com/poppyseedcake/daily/issues/172
labels:
  - wayfinder:map
---

## Destination

Produce an implementation-ready specification for replacing the production Daily Summary email with the single-palette Daily Grid direction, including its real data contracts, fixed section states, email-client behavior, migration path, and verification criteria.

## Notes

- Domain language: [`CONTEXT.md`](../CONTEXT.md); every session should consult `wayfinder` and `domain-modeling`.
- Visual reference: local prototype `http://localhost:5174/prototype/daily-summary?variant=b` in `src/routes/prototype/daily-summary/+page.svelte`.
- The confirmed baseline is one color palette; four fixed sections in Weather, Commute, Calendar, Todo order; English copy; a 2 × 2 wide layout that stacks on narrow screens; and graceful plain-text/image-blocked output.
- Required clients: Gmail web/mobile, Apple Mail on iOS/macOS, Outlook web, and classic Outlook for Windows.
- This map plans the work. It does not implement the production redesign.

## Decisions so far

- [Establish the email-client rendering constraints](https://github.com/poppyseedcake/daily/issues/176) — Use a table-based 2 × 2 email with inline critical styles, responsive stacking where supported, complete text/plain output, and content that survives blocked images.
- [Establish the Weather and Luna provider contracts](https://github.com/poppyseedcake/daily/issues/173) — Use one normalized Open-Meteo forecast, a deterministic WMO icon, and a privacy-minimized structured Luna call whose failure removes only the optional sentence.
- [Establish the Commute traffic contract](https://github.com/poppyseedcake/daily/issues/175) — Request `duration` and `staticDuration` in one traffic-aware call per route and derive Daily's traffic level from their unrounded relative difference.

## Not yet specified

- The exact production-fidelity state matrix and content extremes the next prototype must demonstrate.
- The final rollout and cross-client verification procedure after the renderer and migration contracts are known.

## Out of scope

- Implementing or deploying the redesign while this map is being resolved.
- User-selectable themes, templates, section ordering, or per-section delivery schedules.
- Localization beyond the agreed English Daily Summary.
- Persisting rendered email content or raw Weather, Calendar, Commute, OpenAI, or delivery-provider payloads.
