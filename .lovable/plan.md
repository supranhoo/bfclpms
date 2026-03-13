

# Plan: Fix Duplicate RPCs + Run Tests

## Critical Issue Found

The database has **duplicate RPCs** — the old versions (without period params) were not dropped when the new period-aware versions were created. This causes an "ambiguous function" error when calling without period params (e.g., `get_employee_workflow(uuid)` matches both signatures).

Affected RPCs:
- `get_employee_workflow(uuid)` — old
- `get_employee_workflow_info(uuid)` — old  
- `get_bulk_employee_workflows(uuid[])` — old

## Fix

### 1. Database Migration — Drop Old RPC Overloads

Create a migration to drop the 3 old function signatures:

```sql
DROP FUNCTION IF EXISTS public.get_employee_workflow(uuid);
DROP FUNCTION IF EXISTS public.get_employee_workflow_info(uuid);
DROP FUNCTION IF EXISTS public.get_bulk_employee_workflows(uuid[]);
```

The new versions with `DEFAULT NULL` params will handle both cases (with and without period args).

### 2. Run Existing Tests

Run the existing `workflowEngine.test.ts` and `bottleneckResolver.test.ts` to verify the pure engine logic still passes. These tests cover the core workflow resolution that the period-specific feature builds on.

### 3. Verify RPCs Post-Fix

After the migration, verify all 3 RPCs work:
- Without period params (global resolution)
- With period params (period-specific resolution)

## Files Modified
1. New SQL migration — drop 3 old function overloads

No frontend code changes needed — the hooks already call RPCs correctly.

