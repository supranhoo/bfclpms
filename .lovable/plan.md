
## RCA — Multi-Month KPI score not percolating for employee 100017

### Root cause
This is not a data-entry mistake; the percolation logic is simply not implemented.

What I verified in the codebase:
- `DOCUMENTATION.md` says terminal-month scores for Bi-Monthly / Quarterly / Half-Yearly / Yearly KPIs should propagate to locked months in the same cycle.
- `src/lib/frequencyUtils.ts` already has the cycle helpers needed for this (`getCycleMonths`, `getActiveMonthForCycle`, lock logic), but they are only used for visibility/locking/assignment behavior.
- Approval flows in:
  - `src/components/review/UnifiedScorecard.tsx`
  - `src/components/review/ManagementScorecard.tsx`
  - `src/hooks/useAdminDataEntry.ts`
  - `src/hooks/usePendingSelfReviews.ts`
  only update the single approved KPI row + its own `review_submissions` row.
- I found no DB trigger/function/action for sibling-month propagation:
  - no `percolate...` function
  - no `SCORE_PERCOLATED` audit action
  - no trigger on `kpis` approval that copies scores to same-cycle months

So for employee `100017`, March can become approved with `final_score`, but January and February remain untouched because no code ever updates sibling KPI records.

### Why this happens
Current architecture supports:
1. terminal-month resolution for assignment/import/rollover
2. lock/blur behavior for non-terminal months

But it does **not** support:
3. score/status synchronization from terminal month back to prior months in the same cycle

That missing step is the gap.

## Fix approach
Implement percolation at the database layer so it works for every approval path, not just one UI.

### Changes to build
1. **New database function + trigger**
   - Add `percolate_multimonth_score()` as an `AFTER UPDATE OF status ON public.kpis` trigger
   - Fire only when:
     - `NEW.status = 'approved'`
     - `OLD.status IS DISTINCT FROM 'approved'`
     - frequency is one of `Bi-Monthly`, `Quarterly`, `Half-Yearly`, `Yearly`

2. **Sibling detection**
   - Find same-cycle sibling KPIs using:
     - same employee
     - same KRA + KPI
     - same review year / cycle logic
     - same frequency / cycle override
     - different `review_period`
   - Use frequency config / cycle grouping logic rather than hardcoding quarter pairs

3. **Percolation behavior**
   - Copy terminal KPI review data into sibling `review_submissions`
   - Sync `final_score`, `final_rating`, relevant stage scores, `is_na`, and achieved value fields
   - Set sibling KPI status to `approved` if not already approved
   - Skip overwriting siblings that were already independently finalized unless policy says terminal month is authoritative

4. **Audit trail**
   - Insert `kpi_audit_logs` rows with a dedicated action such as `SCORE_PERCOLATED`
   - Store source terminal KPI id and source month in metadata

5. **Backfill**
   - Add a one-time corrective script/migration-safe data operation for already-approved terminal KPIs from Jan 2026 onward so cases like this March test case get repaired

## Risk & Impact Report
### Data impact
- No new business table required
- Existing `kpis`, `review_submissions`, and `kpi_audit_logs` will be updated for sibling months
- Historical integrity risk is moderate, so backfill should be limited to approved periods covered by current policy

### Workflow impact
- Multi-month KPIs will now auto-close sibling months when the terminal month is approved
- Single-month KPIs remain unchanged

### UI/UX impact
- Jan/Feb scorecards, reports, and weighted summaries will now show the same approved score as March for the same quarterly cycle
- No navigation changes required

### Regression risk
- Medium if implemented only in UI, because multiple approval paths exist
- Low if implemented as a DB trigger with clear guards

### Mitigation
- Make terminal-month approval the only trigger condition
- Only affect same-cycle sibling KPIs
- Add audit logs for every propagated update
- Add tests for Quarterly, Bi-Monthly, Half-Yearly, and Yearly cases

## Files to change
- `supabase/migrations/...sql` — new percolation trigger/function
- `DOCUMENTATION.md` — document actual implemented percolation behavior
- `POLICY.md` — formalize sibling-month approval/score propagation rule
- Tests:
  - DB/function test coverage if available
  - `src/lib/frequencyUtils.test.ts` expand cycle coverage
  - add mock scenarios for quarterly Jan-Feb-Mar propagation

## Expected outcome after fix
For employee `100017`:
- March remains the terminal reviewed KPI
- March approval automatically propagates the approved score/status to January and February
- Reports for Jan and Feb stop showing blank/unreviewed state for that KPI

## Recommendation
Implement this server-side, not in React components. The bug exists because approval can happen through several paths, and all of them currently act on only one KPI row.
