

## RCA: Rollover Creates Only Terminal-Month Record for Multi-Month KPIs

### Root Cause

In `auto-rollover-kpis/index.ts` (line 309-334), for each source KPI the function resolves a single terminal month via `resolveTerminalMonth()` and creates **one** record at that terminal month only.

For a Quarterly KPI rolling March → April:
- `resolveTerminalMonth(3, 'Quarterly')` → index 5 → **June**
- Only one KPI record is created for June
- **April and May get nothing** — they should also have KPI records (locked/non-scorable, eventually percolated via the trigger)

Same for Bi-Monthly: rolling to April → resolves to May (terminal), April gets no record.

This violates the architecture where every month in a cycle must have a KPI record so that:
1. The KPI appears in that month's scorecard (locked/blurred but visible)
2. The percolation trigger can propagate scores from terminal → siblings
3. Weighted average calculations include the KPI for all months

### Fix

**Modify `auto-rollover-kpis/index.ts`** to create records for ALL months in the cycle, not just the terminal month.

**1. Compute full cycle months for each multi-month KPI**

After resolving the terminal month, derive all cycle months using the same logic as `get_cycle_months` SQL function:

```text
Frequency    | Target: April        | Records created
-------------|----------------------|------------------
Monthly      | April                | April
Bi-Monthly   | Apr-May cycle        | April, May
Quarterly    | Apr-May-Jun (Q2)     | April, May, June
Half-Yearly  | Jan-Jun (H1)         | April, May, June (Jan-Mar already exist)
Yearly       | Jan-Dec              | April-Dec (Jan-Mar already exist)
```

For Half-Yearly and Yearly, only create records for months >= target month (earlier months already have records from prior rollover cycles).

**2. Dedup each sibling month independently**

The existing dedup logic checks `targetByEmployee[empId]` keyed by `review_period|||kra_name|||kpi_name`. Each sibling month is checked independently — if April already has the KPI, skip April but still create May and June.

**3. Mark non-terminal month records distinctly**

All records get `status: 'kra_set'`. The frequency lock trigger and UI lock logic already handle preventing scoring on non-terminal months. No special status needed.

**4. Add `getCycleMonthsForTarget` helper to edge function**

Port the cycle resolution logic (matching the SQL `get_cycle_months` function) into the edge function:

```typescript
function getCycleMonthsForTarget(targetMonthIdx: number, frequency: string): number[] {
  switch (frequency) {
    case 'Bi-Monthly':
      // Pairs starting from odd index: 0-1, 2-3, 4-5, ...
      const pairStart = targetMonthIdx % 2 === 0 ? targetMonthIdx : targetMonthIdx - 1;
      return [pairStart, pairStart + 1];
    case 'Quarterly':
      if (targetMonthIdx <= 2) return [0, 1, 2];
      if (targetMonthIdx <= 5) return [3, 4, 5];
      if (targetMonthIdx <= 8) return [6, 7, 8];
      return [9, 10, 11];
    case 'Half-Yearly':
      return targetMonthIdx <= 5 ? [0,1,2,3,4,5] : [6,7,8,9,10,11];
    case 'Yearly':
      return [0,1,2,3,4,5,6,7,8,9,10,11];
    default:
      return [targetMonthIdx];
  }
}
```

**5. Filter to only months >= target month**

For the rollover from March → April, we only create records for months that don't already have a prior cycle's record. Since the source is March and target is April, we create April onward within the cycle. Months before April (Jan, Feb, Mar) already have records from the previous cycle.

**6. Update review_periods upsert**

The existing code already upserts review periods for all resolved months (line 408-413). This will naturally cover all sibling months.

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/auto-rollover-kpis/index.ts` | Add `getCycleMonthsForTarget`; loop over all cycle months >= target; dedup each independently; create records for all |
| `DOCUMENTATION.md` | v2.15.44 — rollover creates full cycle records |
| `POLICY.md` | Update rollover section — all cycle months get records |

### Risk Assessment
- **Regression**: Low — Monthly/Daily/Weekly KPIs unaffected (cycle = single month). Multi-month KPIs get more records, which is correct behavior.
- **Dedup safety**: Each month is independently checked against existing records, preventing duplicates.
- **Percolation compatibility**: The percolation trigger already handles sibling months. Having all records present means percolation works correctly on approval.
- **Frequency lock**: The `enforce_frequency_lock_on_submission` trigger already blocks scoring on non-terminal months, so the new sibling records are naturally locked.
- **Data repair**: After deploying, a re-rollover for April 2026 (with `force: true`) will fill in the missing sibling records. Existing terminal records will be skipped by dedup.

