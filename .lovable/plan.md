

## Plan: Keep Incentive Amount Visible for Disqualified Records

### Problem
When an employee is disqualified, the edge function zeroes out `incentiveAmount` and `finalPercent`. The user wants the **earned amount to remain visible** so stakeholders can see what was forfeited, while the status shows "Disqualified".

### Changes

**File: `supabase/functions/compute-monthly-incentives/index.ts`**

1. **Remove the zeroing of `incentiveAmount`** at line 432-434 — keep the calculated production amount intact
2. **Remove zeroing of `vesselAmount`** at line 445 — keep vessel amount intact when DQ'd
3. **Keep `finalPercent = 0` for DQ** (line 429) — this is correct since the percentage-based incentive should show 0% final
4. Actually, re-reading: `finalPercent` is also used for slab-based (support) programs. For production programs the amount comes from `incentiveAmount`. So:
   - Remove `incentiveAmount = 0` on DQ (line 432-434)
   - Remove `vesselAmount = 0` on DQ (line 445)
   - The `finalPercent` zeroing at line 429 stays — it correctly shows 0% for slab-based programs, but the base % and amount remain visible

**Net effect**: DQ records will show `is_disqualified: true`, `disqualification_reasons: [...]`, `final_incentive_percent: 0`, but `incentive_amount` will retain the calculated value so users can see the forfeited amount.

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/compute-monthly-incentives/index.ts` | Remove amount-zeroing for DQ records (lines 432-434, 445) |
| `DOCUMENTATION.md` | v2.15.40 — DQ records retain calculated amount |
| `POLICY.md` | Update §44 — DQ status preserves amount for audit visibility |

### Risk Assessment
- **Regression**: None — only removes zeroing; DQ status and reasons unchanged
- **Downstream**: Payroll/finance teams must use `is_disqualified` flag (not amount=0) to determine actual payout
- **Report**: Amount column will show values for DQ rows; the DQ badge already distinguishes them

