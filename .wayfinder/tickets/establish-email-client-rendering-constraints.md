---
title: Establish the email-client rendering constraints
status: closed
github_url: https://github.com/poppyseedcake/daily/issues/176
assignee:
labels:
  - wayfinder:research
parent: ../map-production-daily-grid-email-redesign.md
blocked_by: []
---

## Question

Which table/layout, responsive fallback, typography, CSS, and icon/image techniques can reproduce the Daily Grid direction across Gmail web/mobile, Apple Mail on iOS/macOS, Outlook web, and classic Outlook for Windows, including image-blocked and plain-text fallbacks, and which visual compromises are unavoidable?

## Resolution

Use a 600–680 px presentation-table layout with critical inline CSS and opaque colors. A small max-width media query stacks cells where supported; classic Outlook may retain the desktop table. Keep a complete text/plain alternative and make all meaning survive blocked images. Real-client tests must settle remaining image transport and client-specific behavior.

Context: `research/email-client-rendering-constraints@daa26c4dba15e24685bf925f3b23d7229f86c2a6:docs/research/daily-grid-email-client-constraints.md`
