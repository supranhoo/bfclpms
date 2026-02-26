

# Fix: Auditor Assignment Badge Not Displaying (v1.46.25)

## Root Cause

After investigating the database, RLS policies, and FK constraints, the data is correctly saved (the POST returns 200 and the row exists). The problem is in the **SELECT query** used by `useAuditKpiAssignments`.

The `audit_kpi_level_assignments` table has FKs that point to **both** `profiles` and `eligible_login_users` views for the same column (`auditor_id`). When the query uses:

```
profiles!audit_kpi_level_assignments_auditor_id_fkey(full_name)
```

PostgREST may fail with an ambiguity error because the same FK name resolves to two different targets. The `as any` TypeScript cast hides the error, and the `throw error` only fires if `error` is truthy -- but PostgREST sometimes returns empty data instead of an explicit error for ambiguous joins.

## Solution

Replace the FK-based join with a **two-step fetch** approach: first fetch the assignment rows, then fetch the auditor names separately. This completely avoids the ambiguous FK join issue.

## Changes

### 1. Update `src/hooks/useAuditKpiAssignments.ts` -- `useAuditKpiAssignments` function

Replace the single query with FK join:

```typescript
// Step 1: Fetch assignment rows (no join)
const { data, error } = await supabase
  .from('audit_kpi_level_assignments')
  .select('kpi_id, auditor_id')
  .in('kpi_id', kpiIds);

if (error) throw error;
if (!data?.length) return new Map();

// Step 2: Fetch auditor names from profiles
const auditorIds = [...new Set(data.map(r => r.auditor_id))];
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, full_name')
  .in('id', auditorIds);

const nameMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

// Step 3: Build result map
const map = new Map();
data.forEach(row => {
  map.set(row.kpi_id, {
    auditor_id: row.auditor_id,
    auditor_name: nameMap.get(row.auditor_id) || 'Unknown',
  });
});
return map;
```

### 2. Remove `as any` casts from mutation functions

Remove the `as any` casts on `useAssignKpiToAuditor` and `useRemoveKpiAuditAssignment` since `audit_kpi_level_assignments` is now in the generated types file.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only query refactor |
| Performance | Negligible | One extra query per load, but avoids join failures |
| Regression | None | Same data, different fetch strategy |

