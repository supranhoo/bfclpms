

## RCA: Prior Batch Warning Shows for Wrong Employee

### Root Cause

The prior-batch-warning query in `bulk-zero-score-non-submitters/index.ts` (lines 203-224) checks `kpi_audit_logs` for any `ADMIN_BULK_ZERO_SCORE` entry matching the period/year, but does **not** filter by `employee_id`. When Tanaaz was zero-scored for March 2026, an audit log was created. Now when scanning Avinash, the same audit log is found, triggering a false warning.

### Fix

When `employee_id` is provided in the request, add it as a filter to the prior-batch check so the warning only appears if that specific employee was already zero-scored.

| File | Change |
|------|--------|
| `supabase/functions/bulk-zero-score-non-submitters/index.ts` | In the prior-batch query (~line 203-224), when `employeeId` is set, add `.eq("employee_id", employeeId)` to the audit log query, and also check `meta?.employee_id === employeeId` in the in-memory filter |
| `DOCUMENTATION.md` | Log fix v2.33.5 |
| `POLICY.md` | Sync version |

### Technical Detail

```typescript
// Current (no employee filter):
const { data: priorLogs } = await supabase
  .from("kpi_audit_logs")
  .select("id")
  .eq("action", "ADMIN_BULK_ZERO_SCORE")
  .limit(1);

// Fixed (scope to employee when provided):
let priorQuery = supabase
  .from("kpi_audit_logs")
  .select("id, metadata")
  .eq("action", "ADMIN_BULK_ZERO_SCORE")
  .limit(10);
if (employeeId) {
  priorQuery = priorQuery.eq("employee_id", employeeId);
}
// Then in the in-memory check, also verify metadata matches period/year
```

### Risk Assessment
- **Data impact**: None
- **Regression risk**: Zero — only narrows the warning scope
- **UX improvement**: Warning only shows when the specific employee was already zero-scored

