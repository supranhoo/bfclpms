

## Plan: Period-Based Incentive Records for Production Programs

### What Changes

The edge function currently sums all 31 days into one record. Instead, it will detect which day-ranges have data in `daily_values` JSONB and create separate records per period. The report and monthly table will show a "Period" column.

### 1. Database Migration

- Add `payment_period` column (text, default `'full'`) to `employee_incentive_records`
- Drop existing unique constraint `(employee_id, review_period, review_year, program_id)`
- Recreate as `(employee_id, review_period, review_year, program_id, payment_period)`
- Existing records get `'full'` by default

### 2. Edge Function (`compute-monthly-incentives`)

For production programs, instead of summing all days:
- Parse `daily_values` keys into 3 buckets: days 1-10, 11-20, 21-31
- Check which buckets have non-zero data
- If data exists in multiple distinct buckets → create one record per populated bucket with `payment_period` = `'1-10'`, `'11-20'`, or `'21-31'`
- If ALL buckets have data (user entered with "All" toggle) → create single record with `payment_period = 'Full Month'`
- For support programs → always `'full'`
- Update upsert `onConflict` to include `payment_period`

**Detection logic**: Check the distribution of populated day keys. If entries span across all three ranges, treat as "Full Month". If entries only exist in specific ranges (e.g., only days 1-10 filled), create per-range records.

### 3. Frontend — Production Daily Grid

**`src/components/incentive/ProductionDailyGrid.tsx`**:
- Rename toggle label `"All"` → `"Full Month"`

### 4. Frontend — Report Export

**`src/components/incentive/IncentiveReportExport.tsx`**:
- Add "Period" column in preview table (after Year, before Programme)
- Display `r.payment_period` (`1-10`, `11-20`, `21-31`, or `Full Month`)
- Add "Period" to Excel export
- Add Period filter dropdown (All, Full Month, 1-10, 11-20, 21-31)

### 5. Frontend — Monthly Incentive Table

**`src/components/incentive/MonthlyIncentiveTable.tsx`**:
- Add "Period" column displaying `payment_period`
- Include in export
- Each period row has independent status (draft/confirmed/paid)

### 6. Hook Update

**`src/hooks/useIncentiveRecords.ts`**:
- Include `payment_period` in select queries

### 7. Documentation

- `DOCUMENTATION.md` → v2.15.34
- `POLICY.md` → update §44

### Files Modified

| File | Change |
|------|--------|
| DB migration | Add `payment_period` column; update unique constraint |
| `supabase/functions/compute-monthly-incentives/index.ts` | Split production into period-based records; detect full vs partial |
| `src/components/incentive/ProductionDailyGrid.tsx` | Rename "All" → "Full Month" |
| `src/components/incentive/IncentiveReportExport.tsx` | Add Period column + filter |
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Add Period column |
| `src/hooks/useIncentiveRecords.ts` | Include `payment_period` in queries |
| `DOCUMENTATION.md` | v2.15.34 |
| `POLICY.md` | §44 update |

### Risk Assessment
- **Regression**: Unique constraint change needs careful migration; existing records default to `'full'`
- **Data**: Next computation for production programs will create period rows; support programs unaffected
- **Dashboard Safety**: No RLS changes

