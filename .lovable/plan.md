
## Plan: Detailed RCA + Fix for “Compute Now → 0 records processed”

### What the issue actually is
This is not just a toast/message problem. The current production compute logic and the period filter are structurally mismatched.

### RCA
1. **Hybrid record model is the main defect**
   - In `supabase/functions/compute-monthly-incentives/index.ts`, production employees are handled in two modes:
     - if data exists in only some ranges, records are created for `1-10` / `11-20` / `21-31`
     - if data exists in all 3 ranges, the function creates **one `Full Month` record**
   - After that, the new scope filter runs:
     - `scopedRecords = records.filter(r => r.payment_period === scopePaymentPeriod)`
   - Result: if an employee has valid data in all three ranges, they become a `Full Month` record and get dropped entirely when the user computes only `1-10`.
   - So valid production data exists, but the scoped compute can still end at **0 written rows**.

2. **The “69 employees” number is not a compute-ready count**
   - `useIncentiveProgramMappedEmployeeIds()` counts mapped employees.
   - It does **not** verify:
     - daily entries exist for the selected month
     - data exists in the selected period
     - a usable production rate resolves
   - So the empty-state count is currently a **mapping count**, not a “will compute” count.

3. **Current UI feedback is too shallow**
   - `Compute Now` goes straight to mutation + toast.
   - It does not surface enough server diagnostics to explain whether employees were:
     - mapped but had no production rows
     - had production rows only outside the selected sub-period
     - converted to `Full Month` and then filtered out

### Fix approach

#### 1) Canonicalize production compute output
**File:** `supabase/functions/compute-monthly-incentives/index.ts`

Change production computation so it always builds canonical sub-period rows first:
- `1-10`
- `11-20`
- `21-31`

Then:
- if `scope.payment_period` is one sub-period, write only that period’s rows
- if no sub-period scope, write all populated sub-period rows
- do **not** rely on stored `Full Month` production rows as the authoritative model

For reporting/UI:
- `Full Month` should become a **derived aggregation**, not a stored production record

This removes the core bug where valid employees disappear during scope filtering.

#### 2) Clean up legacy `Full Month` production rows during recompute
**File:** `supabase/functions/compute-monthly-incentives/index.ts`

During production recompute for affected employees:
- delete old production rows for that employee/program/month/year
- include legacy `payment_period = 'Full Month'` cleanup so old mixed data cannot survive beside new split-period rows

This prevents stale/full-month rows from corrupting later filtered computes.

#### 3) Make the report UI align with the new canonical model
**File:** `src/components/incentive/MonthlyIncentiveTable.tsx`

Update the report table/filter behavior:
- `period = 1-10 / 11-20 / 21-31` → show only those rows
- `period = Full Month` → aggregate all sub-period rows per employee into one derived monthly row in the UI
- `period = all` → keep current broad view, but make the displayed period label deterministic (`Mixed` or derived summary instead of first row)

Also replace the empty-state copy:
- keep mapped employee count if useful
- add a compute-ready count/diagnostic from the server or a pre-check helper
- avoid implying that all mapped employees will necessarily produce rows in the selected period

#### 4) Improve server diagnostics
**Files:**  
- `supabase/functions/compute-monthly-incentives/index.ts`
- `src/hooks/useIncentiveRecords.ts`
- `src/components/incentive/IncentiveDryRunDialog.tsx`

Return richer diagnostics such as:
- employees_in_scope
- employees_with_daily_entries
- employees_with_selected_period_data
- employees_written
- legacy_rows_deleted
- message/reason buckets

Use that in:
- destructive/info toast on `Compute Now`
- dry-run dialog header
- empty-state helper text

So the user sees **why** rows were skipped, not just “0 processed”.

#### 5) Regression protection
Add tests and mocks for the exact failing case.

**Tests to add**
- employee has data in all 3 ranges, compute scoped to `1-10` → writes `1-10`, not 0
- mixed employee set (some all-3, some partial) → scoped count is correct
- unscoped production compute → writes split rows for all populated periods
- legacy `Full Month` production row exists → recompute removes/replaces it correctly
- company scope + period scope intersection still works

**Likely files**
- `supabase/functions/compute-monthly-incentives/*_test.ts`
- frontend test for derived `Full Month` aggregation in the report table
- updated mock data fixtures

#### 6) Documentation + policy sync
Per project rules, implementation must update:
- `DOCUMENTATION.md`
- `POLICY.md`

Specifically:
- production incentive records become canonically **sub-period based**
- `Full Month` becomes a **derived reporting view**
- scoped compute semantics are documented clearly
- version history updated

### Files likely touched
- `supabase/functions/compute-monthly-incentives/index.ts`
- `src/components/incentive/MonthlyIncentiveTable.tsx`
- `src/components/incentive/IncentiveDryRunDialog.tsx`
- `src/hooks/useIncentiveRecords.ts`
- `DOCUMENTATION.md`
- `POLICY.md`
- edge-function tests + mock fixtures

### Risk & Impact Report
| Area | Impact |
|---|---|
| Data impact | No new schema required, but recompute logic will intentionally replace legacy production `Full Month` rows with canonical split rows for affected employees |
| Workflow impact | Compute becomes consistent with the user’s active period filter |
| UI/UX consistency | Report stays visually similar, but `Full Month` becomes a derived view instead of a stored row |
| Regression risk | Medium — touches core production compute + report aggregation |
| Mitigation | Edge-function tests, derived-row UI tests, legacy-row cleanup, documentation/policy sync |

### Out of scope
- Reworking non-production programs
- Changing programme mappings or employee eligibility rules
- Retroactive adjustments flow unless it is later found to depend on stored `Full Month` production rows
