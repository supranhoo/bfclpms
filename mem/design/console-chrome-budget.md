---
name: console-chrome-budget
description: Performance Console chrome above the first data row stays under ~220px; stat strip, merged header, collapsing filter bar (ADR-283)
type: design
---
Performance Console layout invariants:
- Header bar = title + Beta badge (subtitle lives in its tooltip) + tabs, one row.
- Scope metrics render through `ConsoleStatBand` `variant="strip"` (one line of chips) inside the header block. `variant="tiles"` is only for the pre-scope placeholder. Employees value must stay the server distinct total (ADR-281).
- Drill breadcrumb is passed to `BuConsoleTree` via the `breadcrumb` slot and renders on the category strip row — never its own line.
- `ScopeToolbar` collapses to a summary chip via an IntersectionObserver sentinel, and must NOT collapse while `isDirty` so "Apply filters" stays visible. Filter labels live in placeholders + `title`.
- Page rhythm: `p-3 sm:p-4`, `space-y-2`. Never buy density from data-row height.
Tests: `consoleLayout.test.tsx`, `scopeToolbar.test.tsx`.
