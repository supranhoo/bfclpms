

# Fix: Make "Assign to Auditor" Button Functional (v1.46.22)

## Root Cause

The "Assign to Auditor" popover renders but shows **no auditors** because the `useAuditorsList` query returns a **400 error** from the database API:

```
Could not find a relationship between 'user_roles' and 'profiles'
using the hint 'user_roles_user_id_fkey'
```

The `user_roles` table has **no foreign key** to `profiles`. The current code tries to do a PostgREST join (`profiles!user_roles_user_id_fkey(...)`) which fails silently -- the popover opens but the auditor list is empty, so nothing happens.

A secondary issue: the `useAuditKpiAssignments` fetch query uses `profiles!audit_kpi_level_assignments_auditor_id_fkey(full_name)`, which also needs verification since the FK references `auth.users`, not `profiles`.

## Changes Required

### 1. Database Migration -- Add FK from `user_roles` to `profiles`

Add a foreign key from `user_roles.user_id` to `profiles.id`. This enables PostgREST to resolve the join. The `profiles` table already mirrors `auth.users` IDs, so this is safe.

```sql
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);
```

### 2. Update Hook: `src/hooks/useAuditKpiAssignments.ts`

**`useAuditorsList`**: Change the FK hint to the new constraint name:
```typescript
.select('user_id, profiles!user_roles_user_id_profiles_fkey(id, full_name, employee_code)')
```

**`useAuditKpiAssignments`**: Verify and fix the FK hint for the auditor join to use the correct relationship name pointing to `profiles`.

### 3. No UI Changes Needed

The `AuditKpiAssignPopover` component is already correct. Once the query returns auditor data, the popover will populate and assignments will work.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Adding a FK constraint only; no data modification |
| Regression | Low | The FK is additive; existing queries unaffected |
| Integrity | Safe | All `user_roles.user_id` values already exist in `profiles` |

