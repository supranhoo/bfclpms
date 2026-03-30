

## RCA: PostgREST "Could not choose best candidate function" Error

### Root Cause
There are **two overloads** of `reconcile_workflow_statuses` in the database:

1. `(p_dry_run boolean, p_review_period text, p_review_year integer, p_kpi_ids uuid[], p_performed_by uuid)` — all params have defaults
2. `(p_review_period text, p_review_year integer, p_dry_run boolean, p_performed_by uuid, p_kpi_ids uuid[])` — first two params required

The rogue overload (#1) was created by migration `20260325182832` which reordered params with `p_dry_run` first. Subsequent migrations used `DROP FUNCTION IF EXISTS` with the canonical signature `(text, integer, boolean, uuid, uuid[])` before recreating — but that DROP never matched overload #1's signature `(boolean, text, integer, uuid[], uuid)` because the param order differs. So overload #1 was never actually dropped.

When PostgREST receives an RPC call, it sees two candidate functions with overlapping defaulted params and cannot disambiguate → error.

### CAPA (Corrective and Preventive Action)

**Corrective**: New migration that:
1. `DROP FUNCTION IF EXISTS public.reconcile_workflow_statuses(boolean, text, integer, uuid[], uuid);` — kills the rogue overload
2. `DROP FUNCTION IF EXISTS public.reconcile_workflow_statuses(text, integer, boolean, uuid, uuid[]);` — drops canonical
3. Recreate the single canonical function with signature `(p_review_period text, p_review_year integer, p_dry_run boolean DEFAULT true, p_performed_by uuid DEFAULT NULL, p_kpi_ids uuid[] DEFAULT NULL)`

**Preventive**: Add a comment block at the top of the function documenting the canonical signature. Future migrations must always drop ALL known historical signatures before recreating.

### Files Changed
| File | Change |
|------|--------|
| New SQL migration | Drop both overloads, recreate single canonical function |
| `DOCUMENTATION.md` | Version history v2.13.5 |
| `POLICY.md` | Add invariant: "reconcile_workflow_statuses must exist as exactly one function — migrations must drop all historical signatures" |

### Risk Assessment
- **Regression**: Zero — drops the duplicate, preserves the canonical function body unchanged
- **Scope**: Function signature cleanup only; no logic changes

