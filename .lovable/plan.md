

# Fix: "All future months" label clarity in Admin KPI Edit Dialog

## Issue

The second radio option in the "Apply Changes To" section currently reads:

> **All future months** (fiscal year, after March)

This is misleading because it implies the current month (March) is excluded. In reality, the primary KPI save already handles the current month, so the overall effect IS "this month + all following months." The WeightageCellEditor uses the clearer label "This & all following months" for the same behavior.

The user expects the label to read **"This month and all following months"** for clarity and consistency.

## Fix (1 file)

**`src/components/admin/AdminKpiEditDialog.tsx`** — Update the label for the `future_months` radio option:

```tsx
// Before (line 902-904):
All future months (fiscal year, after {kpi?.review_period})

// After:
This month and all following months (fiscal year, after {kpi?.review_period})
```

This is a label-only change. The underlying logic already correctly updates the current month via the primary save and all subsequent fiscal-year siblings via the bulk apply path.

