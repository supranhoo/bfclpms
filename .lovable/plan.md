

## RCA & Fix Plan: Sent-Back Indicator Not Visible + Value History Incomplete

### Issue 1: Sent-Back Indicator Not Showing

**Root Cause**: The `useSentBackOrgKpiEmployees` hook queries `kpi_queries` filtering by `status = 'open'`. However, **all send-back query records have `status = 'resolved'`** — they get auto-resolved when the KPI status changes (employee re-submits or admin intervenes). This means the map is always empty, so the amber highlight and Undo2 icon never appear.

**Fix approach**: Instead of relying on open queries, detect sent-back state from the **KPI's current status**. An employee's org KPI that was sent back will have `status = 'kra_set'` (or another earlier stage). Cross-reference with the `kpi_queries` table to find the most recent `send_back` query (regardless of status) for each employee KPI, and check if the KPI hasn't progressed past the sent-back stage since then.

**Concrete logic change in `useSentBackOrgKpiEmployees.ts`**:
1. Find matching org-level KPIs (same as now)
2. For each KPI, check if `status` is at or before the stage it was sent back to — i.e., KPI status is `kra_set` AND there exists a `send_back` query record (any status, most recent)
3. Also include KPIs where `kpi_queries.status = 'open'` (original logic, for safety)
4. This means: show the indicator when the employee **hasn't yet re-progressed past the sent-back stage**

| File | Change |
|------|--------|
| `src/hooks/useSentBackOrgKpiEmployees.ts` | Remove the `status = 'open'` filter. Instead, fetch the latest send-back query per KPI, then check if the KPI's current status matches the sent-back target (typically `kra_set`). Only show the indicator if the KPI hasn't progressed past it. |

---

### Issue 2: Value History Shows Very Limited Data

**Root Cause**: The "Value History" popover reads from `org_kpi_data_entry_logs`. This table only has entries for:
- `created` (initial data entry)
- `unlocked` (admin unlock)

Missing entries:
- **`updated`**: The audit log write at line 507 compares `sv.achievedValue !== oldVal`, but the auto-save mechanism and React Query refetch pattern means the `existingValuesMap` often already has the latest value, so the comparison evaluates as equal and skips the log entry.
- **`propagated`**: Propagation never writes to `org_kpi_data_entry_logs` at all.
- **`rollback`**: Rollbacks don't write to this table either.

**Fix approach** (multi-part):

1. **Write audit log on propagation**: After successful propagation in `handleCardSaveAndPropagate`, insert an audit entry with `action: 'propagated'` including the propagated count.

2. **Fix the update comparison**: The `oldVal` lookup uses `existingValuesMap` which may be stale or already refreshed. Instead, capture the old value **before** the upsert call, not from the reactive map. The simplest fix: always write an audit log when saving (if value is non-null), and de-duplicate by comparing against the **last audit log entry** rather than the reactive map. Alternatively, use a `ref` to track the "value at load time" per scoped row.

3. **Write audit log on rollback and unlock**: These already log `unlocked` but not value changes. Add `rollback` entries when rollback is performed.

4. **Add `propagated` and `rollback` to the action labels** in `OrgKpiAuditLog.tsx` so they render correctly.

| File | Change |
|------|--------|
| `src/pages/admin/OrgKpiDataEntry.tsx` | (a) Write `propagated` audit entry after each successful propagation call with old/new values. (b) Write `rollback` audit entry on rollback. (c) Fix `updated` comparison — track initial values at data load time via a ref, compare against that instead of reactive `existingValuesMap`. |
| `src/components/admin/OrgKpiAuditLog.tsx` | Add `propagated`, `rollback`, `unlocked` to `actionLabels` map with appropriate labels and badge variants. |
| `DOCUMENTATION.md` | Version history v2.14.2 |
| `POLICY.md` | Add invariant: every org KPI value mutation must write an audit log entry |

### Risk Assessment
- **Regression**: Zero for Issue 1 (relaxes filter). Low for Issue 2 (additive audit writes).
- **Performance**: Issue 1 adds KPI status check (already fetched). Issue 2 adds more audit log inserts (fire-and-forget, non-blocking).
- **Data**: Existing history gaps cannot be backfilled — only new operations will be logged going forward.

