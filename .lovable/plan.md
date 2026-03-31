

## Plan: Update Incentive Report Preview Table — Remove BU, Add Incentive Amount

### Changes

**`src/components/incentive/IncentiveReportExport.tsx`**:

1. **Remove BU column** from the preview table (header + body). Keep BU in the Excel export for completeness.
2. **Add "Amount (₹)" column** after "Final %" column, displaying `r.incentive_amount` formatted with Indian locale.
3. **Update summary card** — change "Total Incentive %" to "Total Incentive Amount" summing `incentive_amount` instead of `final_incentive_percent`.

### Files Modified

| File | Change |
|------|--------|
| `src/components/incentive/IncentiveReportExport.tsx` | Remove BU column from table; add Amount column after Final %; fix summary to show total amount |

No database or RLS changes. Excel export retains all columns including BU.

