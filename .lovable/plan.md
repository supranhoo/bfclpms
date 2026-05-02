# Fix: "Build Registry" shows the same variant repeated many times

## Problem (confirmed root cause)

In your screenshot the group shows **16 variants**, but every row has the same KRA name, the same KPI text, "1 employees", and "8 rows". In reality there are likely just **2 true variants**, each multiplied by its own row count (2 × 8 = 16).

The bug is in the database function `scan_kpi_duplicate_groups`:

```text
sub  = SELECT category_id, kra_name, kpi_name, COUNT(DISTINCT employee_id), COUNT(*)
       FROM kpis GROUP BY category_id, kra_name, kpi_name      -- correct: 1 row per variant
JOIN  kpis k ON (category_id, kra_name, kpi_name)              -- BUG: re-explodes by row_count
jsonb_agg(... per k row ...)                                   -- → 8× duplication
```

The join back to `kpis` re-multiplies each variant by its own `row_count`, then `jsonb_agg` emits that many copies inside the group's `variants` array.

## Fix

### 1. Database — `scan_kpi_duplicate_groups` (new migration)

Drop the unnecessary self-join. Build the `variants` array directly from the aggregated `sub`, and look up `category_name` once:

```text
WITH sub AS (
  SELECT category_id, kra_name, kpi_name,
         COUNT(DISTINCT employee_id) AS emp_count,
         COUNT(*) AS row_count
  FROM kpis
  GROUP BY category_id, kra_name, kpi_name
)
SELECT jsonb_build_object(
  'normalized_kpi', LOWER(TRIM(kpi_name)),
  'category_id',    category_id,
  'category_name',  COALESCE(c.name, 'Unknown'),
  'variants', jsonb_agg(jsonb_build_object(
                'kra_name', kra_name,
                'kpi_name', kpi_name,
                'employee_count', emp_count,
                'row_count', row_count))
)
FROM sub
LEFT JOIN kra_categories c ON c.id = sub.category_id
GROUP BY LOWER(TRIM(kpi_name)), category_id, c.name
HAVING COUNT(DISTINCT kra_name) > 1
```

This guarantees **one entry per distinct (kra_name, kpi_name)** in `variants`.

### 2. Client-side defensive de-duplication

Even after the DB fix, add a safety net in `useScanDuplicates` (and/or in `BuildRegistryTab`'s render) that de-duplicates `group.variants` by `(kra_name, kpi_name)` before display, so any stale cache or future regression cannot show duplicate rows again. Sum `employee_count` and `row_count` if duplicates collide.

### 3. Tests

Add `src/lib/scanGroupsDedup.test.ts`:
- Given a group whose `variants` array contains the same `(kra,kpi)` 8 times, the de-dup helper returns one entry with the highest/sum counts.
- Given two distinct variants, both are preserved.

### 4. Doc/policy sync

- `DOCUMENTATION.md` → note the scanner now returns one row per distinct variant.
- `POLICY.md` (§ standardization) → "Variants list MUST be unique by (category_id, kra_name, kpi_name)."
- `mem/features/admin/kpi-standardization-registry` → add the dedup invariant.

## Risk & Impact

- **Data**: read-only function change; no schema or data writes. Existing `kpi_definitions`/`kpi_name_aliases` untouched.
- **Workflow**: none. Approving as Canonical already de-duplicates aliases (`diffAliasInserts`) so previously-approved groups are unaffected.
- **UI**: Build Registry list will shrink to true unique variants. The "X variants" badge will now show the real count.
- **Regression risk**: low — the join was the sole source of inflation; the rewrite uses the same aggregate columns.
- **Mitigation**: client-side de-dup safety net + unit test.

## Files to change

- `supabase/migrations/<new>.sql` — replace `scan_kpi_duplicate_groups`
- `src/hooks/useKpiRegistry.ts` — add de-dup pass in `useScanDuplicates`
- `src/lib/scanGroupsDedup.ts` (new) + `src/lib/scanGroupsDedup.test.ts` (new)
- `DOCUMENTATION.md`, `POLICY.md`, `mem/features/admin/kpi-standardization-registry`
