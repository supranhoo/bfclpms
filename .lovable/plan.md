

## RCA & Fix: Disqualified Employee Still Shows Incentive Amount in Report

### Root Cause (Two Issues)

**1. Edge Function — Production incentive amount not zeroed on DQ**

In `compute-monthly-incentives/index.ts`, the production incentive amount is calculated at lines 342-344 **before** DQ evaluation at lines 363-427. When an employee is disqualified (e.g., warning letter), `isDQ` is set to `true` and `finalPercent` becomes 0 (line 429), but `incentiveAmount` (tons × rate) is never zeroed. The period-based records at lines 509 and 534 use this non-zero `incentiveAmount` directly.

**2. Report UI — No DQ/incentive_status visibility**

The Incentive Report preview table (`IncentiveReportExport.tsx`, line 237) only shows `r.status` (draft/confirmed/paid). It does not display `is_disqualified` or `incentive_status`. A disqualified employee appears identical to an eligible one in the report.

### Fix

#### Edge Function (`compute-monthly-incentives/index.ts`)
After DQ evaluation completes (after line 427), add:
```typescript
if (isDQ && program.program_type === 'production') {
  incentiveAmount = 0;
}
```
This ensures production period records get `incentive_amount: 0` when disqualified.

#### Report UI (`IncentiveReportExport.tsx`)
- Replace the "Status" column with a combined status display:
  - If `is_disqualified` → show **"Disqualified"** badge in red with DQ reason tooltip
  - Else → show `incentive_status` (hold/finalised/forfeited/released)
- Keep `status` (draft/confirmed/paid) as a secondary indicator or merge both

#### Monthly Table (`MonthlyIncentiveTable.tsx`)
Already shows DQ info — no changes needed.

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/compute-monthly-incentives/index.ts` | Zero `incentiveAmount` when `isDQ` for production programs |
| `src/components/incentive/IncentiveReportExport.tsx` | Show DQ status and incentive_status in preview table; add DQ badge |
| `DOCUMENTATION.md` | v2.15.36 |

### Risk Assessment
- **Regression**: None — only zeroes amount for already-disqualified records; eligible records unaffected
- **Data**: Existing records need re-computation to correct amounts. No schema change.
- **Dashboard Safety**: No RLS changes

