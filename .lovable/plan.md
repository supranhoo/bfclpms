

## Round Amount Values in Incentive Report Table

### Problem
The Amount (₹) column displays decimal values (e.g., ₹2,152.575, ₹1,435.05) instead of whole numbers.

### Fix

**File: `src/components/incentive/MonthlyIncentiveTable.tsx`** — Apply `Math.round()` at all display and export points:

1. **Line 522** (table cell): Change `Number(r.incentive_amount).toLocaleString('en-IN')` to `Math.round(Number(r.incentive_amount)).toLocaleString('en-IN')`

2. **Line 101** (summary total): Change `s + (r.incentive_amount || 0)` to `s + Math.round(r.incentive_amount || 0)`

3. **Line 204** (export): Change `r.incentive_amount || 0` to `Math.round(r.incentive_amount || 0)`

4. **Line 629** (mark-paid dialog): Change `emp.amount.toLocaleString('en-IN')` to `Math.round(emp.amount).toLocaleString('en-IN')`

5. **Line 611** (mark-paid total): Change `markPaidImpact.totalAmount.toLocaleString('en-IN')` to `Math.round(markPaidImpact.totalAmount).toLocaleString('en-IN')`

6. **Documentation** — Version bump in `DOCUMENTATION.md` and `POLICY.md`

### Risk Assessment
- **Data impact**: None — display-only rounding, no DB changes
- **Regression risk**: Minimal — `Math.round` on computed display values

