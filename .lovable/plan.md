

# Fix: Duplicate Key Constraint Error on Org KPI Save

## Root Cause

The `useBulkUpsertOrgKpiValues` hook in `src/hooks/useOrgKpiValues.ts` uses a fragile "SELECT existing, then INSERT or UPDATE" pattern. If the SELECT somehow does not find the record (race condition from concurrent saves, auto-save firing alongside manual save, etc.), it attempts an INSERT which fails with:

> duplicate key value violates unique constraint "org_kpi_values_scope_unique_idx"

Additionally, the database has **two identical unique indexes** on `org_kpi_values`:
- `org_kpi_values_scope_unique_idx` (created in migration 20260127)
- `org_kpi_values_scoped_unique` (created in migration 20260212)

Both are functionally identical. This is redundant and should be cleaned up.

## Fix

### 1. Make upsert resilient to unique violations (`src/hooks/useOrgKpiValues.ts`)

Wrap the INSERT in a try-catch: if a unique violation (code `23505`) occurs, fall back to an UPDATE using the same match criteria. This mirrors the proven "Update-First-then-Insert" pattern already used in propagation.

```ts
// Instead of only trying INSERT on !existing:
try {
  const { data, error } = await supabase.from('org_kpi_values').insert(value)...;
  if (error) {
    if (error.code === '23505') {
      // Race condition: record was created between SELECT and INSERT
      // Retry as UPDATE using match criteria
      ...
    } else {
      throw error;
    }
  }
} 
```

### 2. Drop duplicate unique index (Database Migration)

```sql
DROP INDEX IF EXISTS org_kpi_values_scoped_unique;
```

Keeps `org_kpi_values_scope_unique_idx` (the original) and removes the duplicate.

### 3. Update DOCUMENTATION.md

- Version bump to 1.45.44
- Note: Fixed duplicate key error on Org KPI data entry save

## Impact

- Saves from data owners (like Biswajit) will no longer fail when a record already exists
- Removes a redundant database index
- No UI changes needed

