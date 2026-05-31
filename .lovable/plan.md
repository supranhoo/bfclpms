## Issue

Reviewing the screenshot of Sujeet Kumar Singh / Jan-2026 / "Achieve organization's production target" after a Bulk-Approve correction:

1. **Header badge shows raw UUID** — `Data entered by: 4da4f2f7-37d9-4249-ae6e-85207d1b29aa` instead of the user's full name.
2. **Per-stage values still show pre-correction numbers** — Manager 35.32, HR PMS 35.32, Skip-Level 20.8, Self 16.66. The corrected achievement entered through Bulk-Approve (override) is not visible at any stage; only `final_score` / `management_score` were re-stamped.

## Root Cause Analysis

### Gap 1 — UUID in "Data entered by"

- `KpiHeaderSection` renders `orgKpiEnteredByName` as a plain string.
- In the **Bulk Review** flow the value is supplied by `src/components/review/BulkCellDrawer.tsx:252`:
  ```
  orgKpiEnteredByName={detail.data.org_kpi?.entered_by ?? null}
  ```
  This is the raw `org_kpi_values.entered_by` UUID — not the resolved name.
- The backing RPC `public.kpi_cell_detail` (migration `20260522180739…`) returns `to_jsonb(org_kpi_values.*)` with no profile join, so the client has nothing else to use.
- The non-bulk flow uses `useOrgKpiValues` which performs the `entered_by_profile:profiles!fk(full_name)` join — that path is correct.

### Gap 2 — Updated value not reflected at stage level

`bulk_management_approve` (latest body in migration `20260531094537…`, override branch) only does:
```
UPDATE review_submissions
   SET achieved_value = v_ach_num
 WHERE id = v_sub_id;
…
SET final_score = v_final,
    management_score = v_final,           -- ✱ rating, not achievement
    kpi_status = 'locked',
    …
```

For **Org-KPI rows**, the per-stage display in `UnifiedScorecard` reads the achievement from `getOrgKpiValue()` → `org_kpi_values.achieved_value` (the master Org-KPI value), **not** from `review_submissions.achieved_value`. The override never writes back to `org_kpi_values`, so:

- Self/Manager/Skip/HR-PMS panels keep showing pre-correction achievement.
- The header rating chip shows the new computed rating, while the per-stage Values still echo the old number — exactly the inconsistency the user reports.

Also, the older `manager_score`, `skip_level_score`, `hr_pms_score`, `auditor_score` fields are intentionally left untouched on override, so any stage-level "Value: X / Rating: Y" UI keeps showing the historical rating from the source stage.

### Audit/data-integrity gap

Cells that were already bulk-overridden between `2026-05-29` (ADR-066 deploy) and now have:
- `review_submissions.achieved_value` = corrected value
- `org_kpi_values.achieved_value` = old (stale) value
- `org_kpi_values.entered_by` = whatever it was before
- `kpi_status = 'locked'`, `final_score` correct

So the corrected number exists in the system, just in the wrong place for the Org-KPI scorecard to surface it. This is repairable, not lost.

## Risk & Impact

| Area | Impact |
|---|---|
| Data | One backfill UPDATE on `org_kpi_values`. Snapshots in `review_submissions` are not touched (POLICY §88 immutability preserved). |
| Workflow | None — only override (admin) and Org-KPI rows are affected. |
| RLS | RPC stays `SECURITY DEFINER`; admin-only override branch unchanged. |
| UI | `KpiHeaderSection` props unchanged; only the value passed in `BulkCellDrawer` changes. |
| Regression | None for non-Org KPIs (no `org_kpi_values` write attempted). |
| Mitigation | New unit tests + an explicit audit row (`ORG_KPI_VALUE_OVERWRITTEN`, source = `bulk_management_approve_override`) for every backfill mutation. |

## Plan

### A. Fix Gap 1 — surface `entered_by_name`

1. **Migration**: replace `public.kpi_cell_detail` so the `org_kpi` payload includes a resolved `entered_by_name` (LEFT JOIN `profiles` on `entered_by`). Body of `org_kpi_values.*` plus an extra `entered_by_name` key.
2. **Client**: `src/components/review/BulkCellDrawer.tsx` → change line 252 to
   ```
   orgKpiEnteredByName={detail.data.org_kpi?.entered_by_name ?? null}
   ```
3. **Type**: extend `KpiCellDetail.org_kpi` to include `entered_by_name: string | null` in `src/hooks/useBulkReview.ts`.

### B. Fix Gap 2 — propagate the override into the Org-KPI master

1. **Migration**: `CREATE OR REPLACE FUNCTION public.bulk_management_approve(...)`. Inside the override branch, after `review_submissions.achieved_value` is written, when `v_kpi.is_org_level = true`:
   - Resolve scope (employee / department / organization) from `v_kpi.org_level_scope`.
   - `UPDATE public.org_kpi_values` row for `(kpi_id, period, year, scope-key)`:
     - `achieved_value = v_ach_num`
     - `entered_by = v_actor`
     - `entered_at = now()`
     - `status = 'approved'`
   - Emit `ORG_KPI_VALUE_OVERWRITTEN` audit row with `prior_achieved_value`, `prior_entered_by`, `source = 'bulk_management_approve_override'`.
   - No call to `propagate_org_kpi_value` — already-frozen `review_submissions` snapshots stay immutable (POLICY §88). Only the master row is corrected so future reads and Org-KPI scorecard render the right number.

2. Standard (non-override) cascade branch is untouched — it only promotes existing stage scores.

### C. Data repair (already-corrected rows)

One-shot migration that runs the same backfill for historical overrides:

```
WITH affected AS (
  SELECT rs.id            AS submission_id,
         rs.kpi_id, rs.employee_id,
         rs.achieved_value AS corrected_value,
         k.is_org_level, k.org_level_scope,
         k.review_period, k.review_year,
         k.department_id, k.organization_id
    FROM review_submissions rs
    JOIN kpis k ON k.id = rs.kpi_id
   WHERE rs.skipped_by_management ->> 'override' = 'true'
     AND k.is_org_level = true
     AND rs.achieved_value IS NOT NULL
)
UPDATE org_kpi_values o
   SET achieved_value = a.corrected_value,
       entered_by     = '<the management approver who ran the override>',
       updated_at     = now(),
       status         = 'approved'
  FROM affected a
 WHERE o.kpi_id   = a.kpi_id
   AND o.period   = a.review_period
   AND o.year     = a.review_year
   AND o.scope_matches(a);   -- scope key by org/department/employee
```

Plus a matching `ORG_KPI_VALUE_OVERWRITTEN` audit row per update with `source = 'data_repair_2026_05_31'` and the prior values, so the existing audit timeline tells the story.

### D. Tests / regression guards

1. `src/test/bulkManagementApproveOrgKpiOverride.test.ts` (vitest contract test on the migration body):
   - asserts the override branch references `public.org_kpi_values` and writes `entered_by = v_actor`.
   - asserts an `ORG_KPI_VALUE_OVERWRITTEN` audit row with `source = 'bulk_management_approve_override'`.
2. Extend `src/test/bulkManagementApproveEnumGuard.test.ts` (or add a new file) to lock the contract: latest definition keeps `'locked'::kpi_status` and `'approved'::public.review_status`.
3. New `src/test/kpiCellDetailEnteredByName.test.ts` to assert the latest `kpi_cell_detail` migration body contains `entered_by_name` in its `jsonb_build_object` and joins `profiles`.
4. UI smoke test (`@testing-library/react`) on `BulkCellDrawer` confirming the `Data entered by:` badge does **not** render a UUID-shaped string.

### E. Docs / policy sync

- `DOCUMENTATION.md` → "Bulk Review · Override" section: note that override now back-writes to `org_kpi_values` for Org-level KPIs.
- `POLICY.md` (Org-KPI Snapshot Immutability §88): clarify that admin override is allowed to correct the *master* `org_kpi_values` row while existing `review_submissions` snapshots stay frozen.
- ADR-067 — "Bulk override propagates to Org KPI master + entered_by resolution".

### Technical details (reference)

Files to edit / add:

```text
supabase/migrations/2026053114xxxx_kpi_cell_detail_entered_by_name.sql        (A.1)
supabase/migrations/2026053114xxxx_bulk_management_approve_org_master_sync.sql (B.1)
supabase/migrations/2026053114xxxx_repair_org_kpi_value_after_override.sql    (C)
src/components/review/BulkCellDrawer.tsx                                       (A.2)
src/hooks/useBulkReview.ts                                                     (A.3 type)
src/test/kpiCellDetailEnteredByName.test.ts                                    (D.3)
src/test/bulkManagementApproveOrgKpiOverride.test.ts                          (D.1)
docs/adr/ADR-067.md                                                            (E)
DOCUMENTATION.md, POLICY.md                                                    (E)
```

## UI changes

- Cell drawer header badge: **`Data entered by:`** now shows the full name (e.g. `V.A.V.S.S. Ganapathi Varma`) instead of a UUID. Same position, same styling.
- After the repair migration, the same KPI screen will show the corrected Self/Manager/Skip/HR-PMS Values for previously bulk-approved Org KPIs (numbers update; layout unchanged).

No other layout, navigation, permission, or workflow changes.
