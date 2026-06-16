---
name: Bulk Review Auditor Scope Filter
description: "My audit scope only" toggle (auditor-only, default ON) + multi-category client filter on Bulk Review
type: feature
---

## Bulk Review — Auditor scope toggle

- Toggle label: **"My scope only"** — visible for every reviewer role
  (auditor, manager, hr_pms, skip_level, management). Hidden for employee/admin.
- **Default ON.** Persisted in `localStorage` as `bulkReview.myScopeOnly`.
- Scope source = `useMyReviewScope(period, year, viewerStage)` → calls RPC
  `public.my_review_scope(p_period, p_year, p_stage)` which returns the
  exact `(kpi_id, employee_id)` pairs where `auth.uid()` is the **resolved
  reviewer** at the active stage for that period. Stage → resolution rule:
  - `auditor` → `audit_kpi_assignments` ∪ `audit_kpi_level_assignments`,
    intersected with KPIs whose resolved workflow contains `auditor_check`.
  - `manager` → `profiles.reporting_manager_id = uid`.
  - `functional_manager` → `is_functional_manager_of(employee_id)`.
  - `skip_level` → `get_skip_level_manager(employee_id) = uid`.
  - `hr_pms` / `management` → role-bearer (workflow gates the KPI list).
- Filter predicate: `src/lib/bulkAuditScopeFilter.ts::isRowInMyReviewScope`
  matches the exact `${kpi_id}|${employee_id}` pair — no employee-wide bleed.
- Header chip `<N> in my scope` is shown for any reviewer role once the
  snapshot is loaded, even with the toggle OFF.
- Legacy `useMyAuditScope` + `isRowInAuditorScope` remain exported for
  backward-compat but are deprecated; do not use them in new code.

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
- Dashboard surfaces a compact ⓘ icon next to the "X in my scope" chip when:
  `effectiveRole === 'auditor'` && `myScopeOnly` && at least one Org KPI has
  `covered < total`. Click → Popover listing up to 6 KPIs with `K of N
  covered` badges. The wide amber banner above the grid was removed
  (June 2026 UX feedback — "should be just an (i) icon").
- No new RPC — uses `rawRows`, `useBulkOrgKpiFlags`, and `useMyAuditScope`
  already on the client.
- Tests: `src/test/orgKpiAuditCoverage.test.ts` (5 cases) +
  `src/test/bulkReview/auditScopeAndCategoryFilters.test.ts` regression
  case "hides a row whose kpi_id and employee_id are both outside the
  assigned scope".

## Reviewer Achieved entry parity (June 2026 — POLICY §111.7.a.7)

In sign-off mode `BulkSignoffPreview.isRowEditable` is just `editable`
(handler present). Every active-stage reviewer (Manager / Skip-Level /
HR PMS / Auditor / Management) can type Achvd, pick a Yes-No / tier
option, or tick N/A on any row in their selection — empty Achvd carries
the previous stage forward (unchanged default). Admin "Override" keeps
its exclusive bypass of prior-stage gates / row-version conflicts /
already-scored rows / final-unlock. Regression:
`src/test/bulkReview/bulkSignoffPreviewEditable.test.tsx`.