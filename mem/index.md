# Project Memory

## Core
Always sync DOCUMENTATION.md + POLICY.md in the same step as code changes; append to Version History.
Every bug fix needs a regression test in src/test/bugBountyFixes.test.ts.
Use semantic design tokens (HSL) — never raw colors in components, except inside isolated brand SVG art.
User-initiated refreshes on primary data views must show the centered RefreshOverlay, not just an inline spinner.

## Memories
- [Refresh overlay pattern](mem://design/refresh-overlay-pattern) — Centered RefreshOverlay, user-click gating, rocket+chart art
