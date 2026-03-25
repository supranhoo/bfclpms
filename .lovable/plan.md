

## Fix: Drop Duplicate `reconcile_workflow_statuses` Overload

### Root Cause

Migration `20260325182832` accidentally created a second overload of `reconcile_workflow_statuses` with a different parameter order:

- **Rogue overload**: `(p_dry_run boolean, p_review_period text, p_review_year integer, p_kpi_ids uuid[])`
- **Canonical signature**: `(p_review_period text, p_review_year integer, p_dry_run boolean, p_performed_by uuid, p_kpi_ids uuid[])`

PostgreSQL treats different parameter orders as separate function overloads. PostgREST cannot choose between them when called with named parameters, producing the "Could not choose the best candidate function" error.

### Fix

**1 file: DB migration**

1. `DROP FUNCTION` the rogue 4-parameter overload: `(boolean, text, integer, uuid[])`
2. Re-create the canonical 5-parameter function with the latest Branch 2b logic (including `audit` in the normal resting state exclusion)

This ensures only one function signature exists, eliminating the PostgREST ambiguity error.

### Files Changed
1. **DB migration** — Drop rogue overload, re-create canonical function

