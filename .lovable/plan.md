

# Fix: Unique Constraint on org_kpi_values Blocks Department-Scoped Saves

## Problem

The `org_kpi_values` table has this unique constraint:
```
UNIQUE (category_id, kra_name, kpi_name, review_period, review_year)
```

This means only **one value** can exist per KPI per period. But department-scoped Org KPIs need **one row per department** (e.g., "LTI" for TPD-E, TPD-Mech, TPD-Process). Saving the second department row fails with `duplicate key value violates unique constraint`.

## Fix

### Database Migration

1. **Drop** the existing unique constraint
2. **Create** a new unique index that includes `department_id` and `employee_id`, using `COALESCE` so that NULL values still participate correctly in uniqueness checks

```sql
ALTER TABLE org_kpi_values
  DROP CONSTRAINT org_kpi_values_category_id_kra_name_kpi_name_review_period__key;

CREATE UNIQUE INDEX org_kpi_values_scoped_unique
  ON org_kpi_values (
    category_id, kra_name, kpi_name, review_period, review_year,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(employee_id, '00000000-0000-0000-0000-000000000000')
  );
```

This allows:
- One org-wide row (both NULLs) per KPI per period
- One row per department per KPI per period
- One row per employee per KPI per period
- No duplicates within the same scope

### Code Change

The `useBulkUpsertOrgKpiValues` hook in `useOrgKpiValues.ts` already handles scoped upserts correctly (it checks for existing records including `department_id` and `employee_id`). No code changes needed — the database constraint is the only blocker.

### Documentation

Update `DOCUMENTATION.md` to note the scoped unique index.

### Files Changed

| File | Change |
|------|--------|
| Database (migration) | Replace simple unique constraint with scoped unique index |
| `DOCUMENTATION.md` | Document scoped uniqueness |

## Result

After this fix, saving department-scoped values (like LTI for TPD-E, TPD-Mech, TPD-Process) will work without errors. Each department gets its own row in `org_kpi_values`.

