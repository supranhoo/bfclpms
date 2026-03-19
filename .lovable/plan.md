

## Fix: KPI Journey Report Slow Loading

### Root Cause
The `kpi_audit_logs` table (16,738 rows) has **no index on `kpi_id`**. The report fires 12 parallel queries with `.in('kpi_id', batch)` filters, each doing a **full table scan**. This is the primary bottleneck.

`review_submissions` already has a `kpi_id` index, so those queries are fast.

### Fix

**Database migration** -- Add an index on `kpi_audit_logs.kpi_id`:

```sql
CREATE INDEX idx_kpi_audit_logs_kpi_id ON public.kpi_audit_logs USING btree (kpi_id);
```

That's it. No code changes needed. This single index will make all 12 audit log batch queries use an index scan instead of a full table scan, reducing load time from ~11 seconds to under 2 seconds.

### Files Changed
| Change | Detail |
|--------|--------|
| Database migration | Add `kpi_id` index on `kpi_audit_logs` |

