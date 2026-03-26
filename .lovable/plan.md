

## Fix: Type Mismatch `text = review_status` in Reconciliation Function

### Root Cause

The `kpis.status` column is of type `review_status` (an enum), but the function stores it as `v_kpi.current_status` without casting to text. When comparing with text values from `v_stage_keys` (a `TEXT[]` array), PostgreSQL throws "operator does not exist: text = review_status".

**Specific failing lines:**
- Line 77: `v_stage_keys[i] = v_kpi.current_status` (text = review_status)
- Line 144: `v_kpi.current_status IN ('self_review', ...)` (review_status = text — works in some contexts but not all)
- Line 236: `SET status = v_next_status` (review_status = text, needs cast)

### Fix (1 DB migration)

Cast `k.status` to text in the SELECT at line 40:

```sql
k.status::text AS current_status
```

And cast `v_next_status` when updating kpis at line 236:

```sql
UPDATE kpis SET status = v_next_status::review_status WHERE id = v_kpi.kpi_id;
```

These two changes eliminate all enum/text comparison mismatches. No other logic changes needed.

### Files Changed
1. **DB migration** — Re-create `reconcile_workflow_statuses` with `::text` cast on status SELECT and `::review_status` cast on UPDATE

