

# Fix: Show Auditor Assignment Badge After KPI Assignment (v1.46.24)

## Root Cause

The `audit_kpi_level_assignments` table has **two foreign keys** pointing to `profiles`:
- `auditor_id` -> `profiles(id)`
- `assigned_by` -> `profiles(id)`

The `useAuditKpiAssignments` hook fetches data with:
```typescript
.select('kpi_id, auditor_id, profiles(full_name)')
```

PostgREST cannot determine which FK to use for the `profiles` join, so it returns an **ambiguity error**. The query fails silently, `auditKpiAssignments` map is empty, and the badge never renders -- even though the assignment data exists in the database.

## Fix

### 1. Update `src/hooks/useAuditKpiAssignments.ts`

Change the `useAuditKpiAssignments` fetch query to use an explicit FK hint:

```typescript
// Before (ambiguous)
.select('kpi_id, auditor_id, profiles(full_name)')

// After (explicit)
.select('kpi_id, auditor_id, profiles!audit_kpi_level_assignments_auditor_id_fkey(full_name)')
```

### 2. No Other Changes Needed

- No database migration required -- FKs are already correct.
- No UI changes needed -- the `AuditKpiAssignPopover` already renders the badge when `currentAssignment` is non-null.
- RLS policies are correct (admin and auditor can SELECT).

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only query fix |
| Regression | None | Only disambiguates an already-failing query |
| Scope | Single line change | Minimal surface area |

