---
name: Bulk Review Auditor Scope Filter
description: "My audit scope only" toggle (auditor-only, default ON) + multi-category client filter on Bulk Review
type: feature
---

## Bulk Review — Auditor scope toggle

- Toggle label: **"My scope only"** (auditor role only, hidden for others).
- **Default ON.** Persisted in `localStorage` as `bulkReview.myScopeOnly`.
- Scope source = `useMyAuditScope()` → union of
  - `audit_kpi_assignments` (employee-level, all KPIs of the employee)
  - `audit_kpi_level_assignments` (single KPI)
- Filter predicate lives in `src/lib/bulkAuditScopeFilter.ts::isRowInAuditorScope`.
- Header chip `<N> in my scope` is shown whenever the role is auditor and the
  snapshot is loaded — even when the toggle is OFF — so the auditor always
  sees how much of the snapshot is theirs.

## Bulk Review — Multi-category filter

- Server RPC `bulk_review_snapshot` only honours a **single** `category_id`
  (via `oneOrNull` in the dashboard). With 2+ categories the server gets
  `null` and the client must finish the filter.
- Predicate: `src/lib/bulkAuditScopeFilter.ts::matchesCategoryFilter`.
- Requires `category_id` on each row → added to the snapshot SELECT in the
  June 2026 migration. NULL `category_id` rows are excluded when any
  category is selected.

## Tests
- `src/test/bulkReview/auditScopeAndCategoryFilters.test.ts` (7 cases).