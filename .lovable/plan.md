## Root Cause Analysis — KPI Journey Timeline: "Month" column shows status

### Bug
In the exported "KPI Journey Timeline" Excel, the **Month** column displays workflow status values (`self_review`, `kra_set`, `manager_check`, `approved`, …) instead of the assessment month (e.g., `April`).

### RCA — exact source

The RPC `get_kpi_journey_report` (migration `20260425051150_f6fa5e76-f4ff-4e8d-9eb3-50ed4f4204a0.sql`) builds each row as JSONB. At line **197**:

```sql
'reviewPeriod', pg.status,        -- ❌ wrong: aliases status into the Month field
'status',       COALESCE(pg.status, 'kra_set'),
```

Both `reviewPeriod` and `status` are wired to the same column (`pg.status`). The frontend export then writes `r.reviewPeriod` into the **Month** Excel column (`src/pages/reports/KpiJourneyReport.tsx:148`), so the Month column inherits status text.

Compounding issue: the upstream `filtered_kpis` CTE (lines 22–49) never selects `k.review_period` or `k.review_year`, so even if the JSON key were corrected, the column would not be available — it must be added to the CTE first.

This is a pure SQL field-mapping defect introduced when this RPC was last refactored. UI/export code is correct.

### Fix Plan

1. **New migration** redefining `get_kpi_journey_report`:
   - In `filtered_kpis` CTE, add `k.review_period` and `k.review_year` to the SELECT list.
   - In the `rows_data` JSONB builder, change:
     ```sql
     'reviewPeriod', pg.review_period,
     'reviewYear',   pg.review_year,
     'status',       COALESCE(pg.status, 'kra_set'),
     ```
   - Keep all other fields, filters, summary, and pagination logic identical (no behavior change elsewhere).

2. **Frontend (no logic change, optional polish)** in `src/pages/reports/KpiJourneyReport.tsx`:
   - Confirm `'Month': r.reviewPeriod` now renders the period name (e.g., `April`).
   - Filename already uses `selectedPeriod` — unchanged.

3. **Regression test** — add `BUG-028` to `src/test/bugBountyFixes.test.ts`:
   - Pin the canonical mapping: `reviewPeriod` must come from `k.review_period`, NOT from `k.status`. Test reads the latest migration file and asserts the substring `'reviewPeriod', pg.review_period` exists and `'reviewPeriod', pg.status` does NOT.

4. **Docs / Policy sync (SSOT)**:
   - `DOCUMENTATION.md` → bump version, add note under KPI Journey Report describing the field mapping contract.
   - `POLICY.md` → add a clause requiring JSONB row builders in report RPCs to map each frontend field to its semantically correct DB column (no shared aliases between `reviewPeriod`, `status`, etc.).

### Risk & Impact

| Area | Impact |
|---|---|
| Data | Read-only RPC change. No schema migration, no row mutation. |
| Workflow | None — only the exported Month cell value changes (status column already shows the same value and remains correct). |
| UI | The on-screen KPI Journey table (if it surfaces `reviewPeriod`) will start showing the proper month. Verified table currently relies on the same hook field, so the UI also benefits. |
| Regression | Very low. The change is isolated to two JSON keys and one CTE SELECT list; all other CTEs, filters, and aggregations are untouched. |
| Mitigation | New BUG-028 regression test pins the mapping; existing journey-report tests continue to validate row counts and structure. |

### Files to be edited (next step, after approval)

- **new** `supabase/migrations/<timestamp>_fix_kpi_journey_review_period.sql`
- `src/test/bugBountyFixes.test.ts` (add BUG-028)
- `DOCUMENTATION.md` (version bump + section update)
- `POLICY.md` (new clause on report RPC field mapping)