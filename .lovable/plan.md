

## Plan: Connect Production Data Pipeline to Incentive Computation

### Problem
The `compute-monthly-incentives` edge function never reads from `production_daily_entries` or `incentive_production_rates`. It only checks `employee_incentive_eligibility.production_value` (which is unpopulated for production programs). Result: incentive shows 0% even though production data tab correctly calculates amounts like ₹2,000.

### Root Cause Flow
```text
UI (Production Data tab)
  → reads production_daily_entries (JSONB daily_values)
  → reads incentive_production_rates (rate_per_ton)
  → calculates: totalTons × rate = ₹2,000 (client-side only)

Edge Function (compute-monthly-incentives)
  → reads employee_incentive_eligibility.production_value (NULL)
  → scoreForSlab = null → no slab match → basePercent = 0
  → final_incentive_percent = 0
  → incentive_amount column doesn't exist
```

### Database Changes

**Add `incentive_amount` column** to `employee_incentive_records`:
```sql
ALTER TABLE public.employee_incentive_records
ADD COLUMN IF NOT EXISTS incentive_amount numeric DEFAULT 0;
```

### Edge Function Changes — `compute-monthly-incentives/index.ts`

After existing employee/eligibility fetching (around line 240), add:

1. **Fetch `production_daily_entries`** for the program/month/year
2. **Fetch `incentive_production_rates`** for the program
3. **Build aggregation maps**:
   - For each employee, sum all daily JSONB values → `totalTons`
   - Resolve rate using priority cascade: employee (`rate_type='employee'` + `employee_id`) > department (`rate_type='department'` + `entity_id` matching dept) > BU (`rate_type='business_unit'`) > common (`rate_type='common'`)
4. **In the per-employee loop** (line 254+):
   - If production entries exist for this employee: `incentiveAmount = totalTons × resolvedRate`
   - Use `totalTons` as `production_value` for slab matching (replacing the null `elig?.production_value`)
   - Store `incentive_amount` in the record
5. **Update incentive_status logic** (line 413-416): use production daily entries existence instead of `elig?.production_value`

### UI Changes

**`MonthlyIncentiveTable.tsx`**:
- Add "Amount (₹)" column after "Final %" showing `r.incentive_amount` formatted with locale
- Add amount to export data
- Add total incentive amount to summary stats

**`IncentiveDryRunDialog.tsx`**:
- Add "Amount" column in preview table
- Show total amount in summary cards

### Files Modified

| File | Change |
|------|--------|
| DB migration | Add `incentive_amount` column |
| `supabase/functions/compute-monthly-incentives/index.ts` | Fetch production_daily_entries + production_rates; aggregate tons × rate; populate incentive_amount and production_value |
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Add Amount column, update export & summary |
| `src/components/incentive/IncentiveDryRunDialog.tsx` | Add Amount column in preview |
| `DOCUMENTATION.md` | v2.15.31 |
| `POLICY.md` | Update §44 — production computation pipeline |

### Risk Assessment
- **Regression**: Low — additive column; existing support-program flow untouched (incentive_amount defaults to 0)
- **Dashboard Safety**: No RLS changes, no cross-table policy references
- **Data**: New column with default 0; existing records unaffected
- **Performance**: Two additional queries per compute (production_daily_entries + production_rates) — small dataset

