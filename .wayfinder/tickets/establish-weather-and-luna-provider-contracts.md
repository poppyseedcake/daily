---
title: Establish the Weather and Luna provider contracts
status: closed
github_url: https://github.com/poppyseedcake/daily/issues/173
assignee:
labels:
  - wayfinder:research
parent: ../map-production-daily-grid-email-redesign.md
blocked_by: []
---

## Question

What exact Open-Meteo variables and OpenAI Responses API contract should supply current temperature, representative daily condition, daily minimum and maximum, maximum precipitation probability, maximum wind speed, hourly context, and one validated English sentence from `gpt-5.6-luna`, while meeting the agreed privacy and graceful-degradation boundaries?

## Resolution

Use one Open-Meteo request for current, daily, and remaining-hour inputs; map the daily WMO code to the icon deterministically. Send Luna only normalized weather facts without identity or location, request a strict structured response, and locally validate the single English sentence and 15-word limit. A Luna failure omits only the sentence; missing required Open-Meteo data makes Weather temporarily unavailable.

Context: `research/weather-luna-provider-contracts@57a7bb255c020045a0fcb7ca46a8afcdde030a17:docs/research/weather-luna-provider-contracts.md`
