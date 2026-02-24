

# Bulk Update Org KPI Scope to Employee (v1.45.99)

## What This Does

Updates the `org_level_scope` column on all organization-level KPIs from:
- **Department** (395 KPIs) --> **Employee**
- **Organization** (574 KPIs) --> **Employee**

After this change, all 1,532 org-level KPIs will have scope = `employee`, meaning data entry will happen at the individual employee level.

## Technical Change

A single database migration that runs:

```sql
UPDATE kpis
SET org_level_scope = 'employee', updated_at = now()
WHERE is_org_level = true
  AND org_level_scope IN ('department', 'organization');
```

This updates 969 records in one atomic operation.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data integrity | Low | Only changes the scope column; no KPI definitions, scores, or values are altered |
| Existing org_kpi_values | Medium | Any previously entered values at dept/org scope will still exist in `org_kpi_values` but the UI will now expect employee-scoped entries. Existing dept/org values will need re-entry at employee level |
| Reversibility | Easy | Can revert by running a reverse UPDATE if needed |
| RLS | None | No policy changes needed |

## Important Note

After this migration, the Org KPI Data Entry page will show employee-level rows for all KPIs. Any values previously entered at department or organization scope will no longer display in the entry cards (since the scope has changed). Those values still exist in the database but won't match the new scope filter. New values will need to be entered per employee.

## Documentation

Bump `DOCUMENTATION.md` to v1.45.99 noting the bulk scope migration.
