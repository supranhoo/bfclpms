

# Fix: Enforce Frequency Locking on Self-Review for Quarterly and Bi-Monthly KPIs

## Problem

Quarterly and Bi-Monthly KPIs are not locked during non-active months in the Self Review. The `FrequencyLockedOverlay` component is **imported** in `SelfReviewSheet.tsx` but **never rendered** in the JSX. This means users can freely enter and submit values for Quarterly KPIs in January, when entry should only be allowed in March (the active Q1 month).

### How It Should Work

| Frequency | Locked Months (no entry) | Active Months (entry allowed) |
|---|---|---|
| Quarterly | Jan, Feb, Apr, May, Jul, Aug, Oct, Nov | Mar, Jun, Sep, Dec |
| Bi-Monthly (your config) | Feb, Apr, Jun, Aug, Oct, Dec | Mar, May, Jul, Sep, Nov, Jan |

### Where Locking Works Today
- Org KPI Data Entry page -- correctly hides locked KPIs

### Where Locking is Missing (the bug)
- Self Review Sheet -- overlay imported but never used
- My KPIs page -- no frequency lock check at all

## Fix

### 1. `src/components/review/SelfReviewSheet.tsx`

Wrap the "Your Assessment" card content with `FrequencyLockedOverlay` so that when a multi-month KPI is in a locked period, the input form is blurred and a lock message is shown directing the user to the active month.

Add the overlay inside the assessment Card (around line 487), wrapping the form inputs in a `relative` container with `FrequencyLockedOverlay` rendered on top when locked. Also disable the Submit button when the period is locked.

### 2. `src/pages/MyKpis.tsx`

Add a `FrequencyLockBadge` next to each KPI in the list so users get a visual indicator that a KPI is locked for the current month before even opening the review sheet. This provides immediate context without needing to click into each KPI.

### 3. `DOCUMENTATION.md`

Document that frequency locking is enforced at both the Self Review form level and the KPI list level.

## Technical Detail

**SelfReviewSheet changes:**

```text
<Card> (Your Assessment)
  <CardContent>
    <div className="relative">           <-- new wrapper
      <FrequencyLockedOverlay             <-- new: renders lock overlay when period is locked
        frequency={selectedKpi.frequency}
        reviewMonth={selectedPeriod}
        reviewYear={selectedYear}
        frequencyCycleStart={selectedKpi.frequency_cycle_start}
      />
      ... existing form inputs ...
    </div>
  </CardContent>
</Card>
```

The Submit button will also check `isKpiLockedForPeriod` and be disabled when locked.

**MyKpis changes:**

Add `FrequencyLockBadge` in each KPI card's metadata area to show "Review in March" etc. for locked KPIs.

## Files to Change

| File | Change |
|---|---|
| `src/components/review/SelfReviewSheet.tsx` | Render `FrequencyLockedOverlay` around assessment form; disable submit when locked |
| `src/pages/MyKpis.tsx` | Add `FrequencyLockBadge` to KPI cards for visual indicator |
| `DOCUMENTATION.md` | Document the locking enforcement |

