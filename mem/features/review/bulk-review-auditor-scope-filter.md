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

## Org-KPI coverage gap diagnostic (June 2026 RCA)

RCA case: "Adherence to Manning Norms" was propagated to 6+ employees but
the auditor only had `audit_kpi_level_assignments` rows for 5 of them
(Sindhu Raj Singh was missing). With "My scope only" ON the row for the
uncovered employee was silently hidden, looking like the KPI didn't exist.

- Pure helper: `src/lib/orgKpiAuditCoverage.ts::computeOrgKpiCoverageGaps`.
- Dashboard surfaces a non-blocking amber Alert above the grid when:
  `effectiveRole === 'auditor'` && `myScopeOnly` && at least one Org KPI has
  `covered < total`. Lists up to 4 KPIs with `K of N covered` badges.
- No new RPC — uses `rawRows`, `useBulkOrgKpiFlags`, and `useMyAuditScope`
  already on the client.
- Tests: `src/test/orgKpiAuditCoverage.test.ts` (5 cases) +
  `src/test/bulkReview/auditScopeAndCategoryFilters.test.ts` regression
  case "hides a row whose kpi_id and employee_id are both outside the
  assigned scope".