

## Milestone 3: Incentive Module Maturity

### Current State
- `compute-monthly-incentives` edge function exists and works, but **no UI trigger** — the MonthlyIncentiveTable says "Run incentive computation first" with no button to do so
- `detect-retroactive-incentive-changes` edge function exists and writes revision records
- `RetroactiveAdjustmentTable` shows revisions but has no way to trigger detection
- No dry-run preview before computing final incentives
- Program-scoped eligibility data entry was just implemented

### Implementation

#### 1. Add Compute Button with Dry-Run Preview to MonthlyIncentiveTable
**`src/components/incentive/MonthlyIncentiveTable.tsx`**
- Add a "Compute Incentives" button in the toolbar
- Add program selector dropdown (required before computing)
- On click, first call the edge function with `dry_run: true` to get a preview
- Show a confirmation dialog with summary: X employees, Y eligible, Z disqualified
- On confirm, call with `dry_run: false` to write records
- Show toast with results

**`supabase/functions/compute-monthly-incentives/index.ts`**
- Add `dry_run` parameter support
- When `dry_run: true`, return computed records WITHOUT upserting to DB
- Return summary stats: total, eligible, disqualified, avg incentive %

#### 2. Add Detect Retroactive Changes Button
**`src/components/incentive/RetroactiveAdjustmentTable.tsx`**
- Add a "Detect Changes" button that invokes `detect-retroactive-incentive-changes`
- Add program selector (required)
- Add month/year selector for the trigger period
- Show toast with count of revisions created

#### 3. Wire edge function invocations via hooks
**`src/hooks/useIncentiveRecords.ts`**
- Add `useComputeIncentives` mutation hook
  - Calls `supabase.functions.invoke('compute-monthly-incentives', { body })`
  - Invalidates `incentive-records` query on success
- Add `useDetectRetroactiveChanges` mutation hook
  - Calls `supabase.functions.invoke('detect-retroactive-incentive-changes', { body })`
  - Invalidates `incentive-revisions` query on success

#### 4. Compute Dry-Run Preview Dialog
**`src/components/incentive/IncentiveDryRunDialog.tsx`** (new)
- Modal showing preview of computation results before committing
- Table with: Employee, PMS Score, Slab, Base %, DQ Reasons, Final %
- Summary cards: Total, Eligible, Disqualified, Avg %
- "Confirm & Compute" button to execute
- "Cancel" to abort

### Files Modified
- `supabase/functions/compute-monthly-incentives/index.ts` — add `dry_run` param
- `src/hooks/useIncentiveRecords.ts` — add compute + detect hooks
- `src/components/incentive/MonthlyIncentiveTable.tsx` — add compute button + program selector
- `src/components/incentive/IncentiveDryRunDialog.tsx` — new preview dialog
- `src/components/incentive/RetroactiveAdjustmentTable.tsx` — add detect button

### No database changes needed

