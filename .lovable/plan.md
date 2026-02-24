

# Fix: Propagate Org KPI Remarks to Self Review (v1.45.96)

## Problem

When a Data Owner enters an Org KPI value with remarks (e.g., "8674891/8868250") on the Org KPI Data Entry page and clicks "Propagate", the remarks are saved to `org_kpi_values.remarks` but are **never copied** into `review_submissions.self_remarks`. 

As a result, the Review Journey's "Self" stage card shows "No remarks" even though the data owner entered remarks alongside the achieved value.

## Root Cause

The propagation pipeline has two gaps:

1. **Client-side**: The `PropagateParams` interface in `usePropagateOrgKpiValue.ts` does not include a `remarks` field. The `handleCardSaveAndPropagate` function in `OrgKpiDataEntry.tsx` does not pass remarks to the propagation call.

2. **Server-side (RPC)**: The `propagate_org_kpi_value` database function only sets `achieved_value`, `self_score`, `self_rating`, `is_na`, and `na_marked_by_role` on `review_submissions`. It does not touch `self_remarks`.

## Solution

Thread the remarks through from the org KPI entry UI all the way into the `review_submissions.self_remarks` column during propagation.

## Technical Changes

### 1. Database: Update `propagate_org_kpi_value` RPC

Add a `p_remarks` parameter to the RPC function and use it to set `self_remarks` on upsert:

- New parameter: `p_remarks text DEFAULT NULL`
- In the INSERT/ON CONFLICT block, add `self_remarks = p_remarks` (only when `p_remarks IS NOT NULL`)
- The remarks from `org_kpi_values` will now flow into `review_submissions.self_remarks`

### 2. `src/hooks/usePropagateOrgKpiValue.ts`

- Add `remarks?: string` to the `PropagateParams` interface
- Pass remarks through to the RPC call: add `p_remarks: params.remarks || null` to the `supabase.rpc('propagate_org_kpi_value', ...)` call
- For employee-scoped entries, pass per-employee remarks from the scoped values

### 3. `src/pages/admin/OrgKpiDataEntry.tsx`

- In `handleCardSaveAndPropagate`, pass `remarks` from `values.remarks` to the propagation call for each scope type (organization, department, employee)
- For scoped values (department/employee), pass `sv.remarks` from the scoped row data

### 4. `DOCUMENTATION.md`

Bump to v1.45.96 and document the remarks propagation pipeline.

## Data Flow After Fix

```text
Org KPI Data Entry (remarks field)
  --> org_kpi_values.remarks (saved via bulk upsert)
  --> handleCardSaveAndPropagate passes remarks to propagate.mutateAsync()
  --> propagate_org_kpi_value RPC receives p_remarks
  --> review_submissions.self_remarks = p_remarks
  --> Review Journey "Self" card shows remarks
```

## Impact

- Org KPI remarks will appear under the "Self" stage in Review Journey for all reviewer panels
- Existing KPIs that were already propagated without remarks will NOT be retroactively updated (they stay as "No remarks" unless re-propagated)
- No schema changes needed -- the `self_remarks` column already exists on `review_submissions`

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | Low -- only sets self_remarks where it was previously NULL | Remarks are additive, no data overwritten |
| Regression | Low -- RPC has a default NULL parameter, so existing calls without remarks still work | Backward compatible |
| Workflow | None -- remarks don't affect scoring or status advancement | Read-only display field |

