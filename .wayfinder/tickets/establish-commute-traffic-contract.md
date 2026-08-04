---
title: Establish the Commute traffic contract
status: closed
github_url: https://github.com/poppyseedcake/daily/issues/175
assignee:
labels:
  - wayfinder:research
parent: ../map-production-daily-grid-email-redesign.md
blocked_by: []
---

## Question

What exact Google Routes request fields, response fields, billing tier, availability rules, and validation contract should provide `duration` and `staticDuration` for every scheduled Commute Route so Daily can derive the agreed green, yellow, or red Commute Traffic Level without retaining raw route responses?

## Resolution

Keep one `DRIVE` plus `TRAFFIC_AWARE` ComputeRoutes call per qualifying route and request the narrow field mask `routes.duration,routes.staticDuration`. Classify unrounded values as green below 10% delay, yellow from 10% to below 25%, and red at 25% or more. Preserve route order and section-level degradation, and never retain or log raw route data.

Context: `research/commute-traffic-contract@6ae03e28ae3e66b56dc1cdb0d4d3904b33cdc389:docs/research/commute-traffic-contract.md`
