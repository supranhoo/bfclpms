

## Plan: Fix Empty-State Count + Scope Compute to Filters

### RCA — two distinct bugs

**Bug 1: "259 employees" is mis-stated.**
The empty-state text uses `mappedEmployeeCount` from `useIncentiveProgramMappingCount` which counts **all** mappings for the programme — it ignores the active Company filter (Saibal Kunar) and any other toolbar filter. So with one company selected the user still sees the global program total.

**Bug 2: Compute / Compute Now ignore filters.**
Both buttons invoke `compute-monthly-incentives` with only `{ review_period, review_year, program_id }`. The edge function then loops over **every** mapped employee for that programme, regardless of the Company multi-select, Period (1-10 / 11-20 / 21-end), or other UI filters. Result: filtered view shows narrow data, but Compute writes wide data.

### Fix

#### A. UI — accurate empty-state count (front-end only)

**File: `src/components/incentive/MonthlyIncentiveTable.tsx`**
- Replace the raw `mappedEmployeeCount` shown in the empty-state with a derived count that respects the Company filter:
  - Add `useIncentiveProgramMappedEmployeeIds(programId)` hook (new, returns `string[]` of mapped employee IDs) OR extend existing hook to return ids, not just count.
  - Compute `filteredMappedCount = mappedIds.filter(id => companyIdSet ? companyIdSet.has(employeeCompanyMap.get(id)) : true).length`.
  - Render: *"{filteredMappedCount} of {mappedEmployeeCount} employees match current filters. Click below to compute incentives for {scope-text}."*
  - Scope-text dynamically reflects the selected Company badge(s) and Period chip if any.

#### B. Compute — honour filters

**Front-end (same file, both `handleCompute` dry-run and `handleComputeNow`)**
Build a `scope` payload and forward it:
```ts
const scope = {
  employee_ids: filteredMappedEmployeeIds,         // [] = no scope (current behaviour)
  payment_period: periodFilter !== 'all' ? periodFilter : null,
};
computeIncentives.mutate({ review_period, review_year, program_id, scope });
```

**Edge function: `supabase/functions/compute-monthly-incentives/index.ts`**
- Accept new optional `scope.employee_ids: string[]` and `scope.payment_period: string | null`.
- After resolving `employeeFilter` from mappings, intersect with `scope.employee_ids` when provided. Empty intersection → return `{ computed: 0, message: 'No employees match selected filters' }`.
- For production-program range outputs, when `scope.payment_period` is set:
  - Skip writing the "Full Month" record and skip ranges that don't match.
  - Only upsert the matching range(s).
- For non-production programs `payment_period` is always 'Full Month' — ignore the filter (or warn no-op).
- Add a `dry_run` summary line: *"Scope: {N} employees, period {payment_period or all}"*.

#### C. Confirm-impact UX
- Update the dry-run preview dialog (`IncentiveDryRunDialog`) header to show the active scope so the user sees exactly which employees/periods will be (re)computed before confirming.
- Update the "Compute Now" CTA tooltip: *"Computes for {filteredMappedCount} employee(s) matching current Company / Period filters."*

### Files Touched
| File | Change |
|---|---|
| `src/hooks/useIncentiveProgramMappingCount.ts` | Add sibling hook returning mapped employee IDs |
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Filter-aware empty-state count, pass `scope` to compute, update CTA copy |
| `src/components/incentive/IncentiveDryRunDialog.tsx` | Show scope summary in preview header |
| `src/hooks/useIncentiveRecords.ts` (`useComputeIncentives`) | Forward `scope` field in body |
| `supabase/functions/compute-monthly-incentives/index.ts` | Accept `scope.employee_ids` + `scope.payment_period`; intersect filters; conditional range writes |

### Risk & Impact
| Area | Impact |
|---|---|
| Data | Safer — Compute now writes only what user is reviewing; no accidental over-write of unrelated companies |
| Workflow | Existing callers (no `scope`) keep current full-program behaviour — fully backward compatible |
| UI/UX | Empty-state count reflects reality; CTA states scope clearly |
| Regression | Low — `scope` is opt-in; range-skip logic guarded by `payment_period` presence |
| Mitigation | Edge function returns explicit "0 employees match" message if scope filters everything out, surfaced via toast |

### Out of Scope
- Multi-programme batch compute (single programme rule unchanged)
- Server-side row-count for the empty-state (client-side intersect is sufficient at current scale)
- Retroactive Adjustments tab (separate compute path; revisit if needed)

