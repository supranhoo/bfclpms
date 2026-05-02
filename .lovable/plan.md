## Bug
The migration `20260502061046_*_scanner_alias_and_skip.sql` ships a `scan_kpi_duplicate_groups` whose `grouped` CTE references `s.kpi_name` (raw) inside an `EXISTS` subquery while the `GROUP BY` only contains `LOWER(TRIM(s.kpi_name))`. Postgres rejects it:

> subquery uses ungrouped column "s.kpi_name" from outer query

So **every** call to "Scan for Duplicates" fails — the Build Registry tab is unusable.

## Root cause
Inside an aggregate query, expressions in correlated subqueries must reference grouped columns or aggregates. `LOWER(TRIM(s.kpi_name))` is grouped; `s.kpi_name` itself is not.

## Fix
New migration that replaces `scan_kpi_duplicate_groups(boolean)` with a corrected version. Two safe options; we'll use **option A** because it keeps the structure identical and easiest to audit:

**A. Pre-compute `norm_kpi` in the `sub` CTE**, then group on it directly. The `EXISTS` subquery against `kpi_scanner_skips` then references `s.cat_id` / `s.norm_kpi`, both grouped.

```sql
WITH sub AS (
  SELECT
    k.category_id                AS cat_id,
    k.kra_name,
    k.kpi_name,
    LOWER(TRIM(k.kpi_name))      AS norm_kpi,
    COUNT(DISTINCT k.employee_id) AS emp_count,
    COUNT(*)                     AS row_count
  FROM public.kpis k
  WHERE NOT EXISTS ( ... alias filter unchanged ... )
  GROUP BY k.category_id, k.kra_name, k.kpi_name
),
grouped AS (
  SELECT
    s.norm_kpi,
    s.cat_id,
    COALESCE(c.name,'Unknown')   AS cat_name,
    jsonb_agg( jsonb_build_object(
      'kra_name',       s.kra_name,
      'kpi_name',       s.kpi_name,
      'employee_count', s.emp_count,
      'row_count',      s.row_count
    ) ORDER BY s.kra_name, s.kpi_name) AS variants,
    SUM(s.row_count) AS total_rows,
    EXISTS (
      SELECT 1 FROM public.kpi_scanner_skips sk
      WHERE sk.category_id = s.cat_id
        AND sk.normalized_kpi = s.norm_kpi
    ) AS is_skipped
  FROM sub s
  LEFT JOIN public.kra_categories c ON c.id = s.cat_id
  GROUP BY s.norm_kpi, s.cat_id, c.name
  HAVING COUNT(DISTINCT s.kra_name) > 1
)
SELECT jsonb_agg(
  jsonb_build_object(
    'normalized_kpi', norm_kpi,
    'category_id',    cat_id,
    'category_name',  cat_name,
    'variants',       variants,
    'is_skipped',     is_skipped
  ) ORDER BY total_rows DESC
)
INTO v_result
FROM grouped
WHERE (p_include_skipped OR NOT is_skipped);
```

All other contracts (alias-aware exclusion, skip filter, `is_skipped` tag, dedup invariant) are preserved.

## Risk & Impact
- **Data impact:** none — pure read function, no schema change.
- **Workflow impact:** restores the Scanner; no behavioural change vs. the intended spec.
- **UI impact:** none; existing client code (`useScanDuplicates`, `dedupeScannerGroups`, `BuildRegistryTab`) already expects this shape.
- **Regression risk:** low. Logic is equivalent to the prior version once the GROUP BY is satisfied. Existing tests in `scanGroupsDedup.test.ts` and `useScannerSkips.test.ts` continue to apply.

## Deliverables
1. **Migration:** `supabase/migrations/<ts>_fix_scanner_grouping.sql` — `DROP FUNCTION` + recreate as above.
2. **Doc/policy sync:**
   - `POLICY.md` §88I: append a note that the scanner pre-computes `norm_kpi` in the inner CTE so all correlated subqueries reference grouped columns.
   - `DOCUMENTATION.md`: same note in the standardization section.
   - `mem/features/admin/kpi-standardization-registry`: extend the "Scanner invariant" bullet to mention the grouped-column rule.
3. **Test:** add a thin SQL contract note + a Vitest case in `useStandardizationHistory.test.ts` (or a new pure helper test) that documents the expected JSON shape — pure logic, no DB. (The real protection is the migration itself; without DB-in-test we can't execute the function in unit tests.)

## Out of scope
- No changes to `kpi_scanner_skips` table, RLS, or `reverse_standardization_action`.
- No client-side changes — `BuildRegistryTab`, hooks, and dedup helper stay as-is.