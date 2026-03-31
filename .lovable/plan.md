

## RCA: Disqualified Employee Still Shows as Eligible in Report

### Root Cause (Two Issues)

**Issue 1 — Stale records not cleaned on re-computation**

The edge function upserts records using `onConflict: 'employee_id,review_period,review_year,program_id,payment_period'`. It never **deletes** existing records for the employee+program+month before upserting. This means:
- Old records computed before the DQ fix still exist with `is_disqualified: false` and non-zero amounts
- Re-computing will only update records whose `payment_period` matches exactly; it won't remove orphaned ones

**Issue 2 — `payment_period: 'full'` vs `'Full Month'` mismatch**

The database currently has a record with `payment_period = 'full'` (old default) alongside period-split records (`1-10`, `21-31`). The new computation creates `'Full Month'` records, which don't match the old `'full'` unique key — so the stale record persists indefinitely.

**Evidence from database:**
```
employee ef74c606... has 3 Metal Sizing records for March 2026:
  - payment_period='full',     is_disqualified=false, amount=₹7,000  ← STALE
  - payment_period='1-10',     is_disqualified=false, amount=₹2,000  ← STALE  
  - payment_period='21-31',    is_disqualified=false, amount=₹5,000  ← STALE
```
Eligibility data confirms `has_warning_letter = true` — all should be disqualified.

### Fix

**1. Database Migration — Clean stale data**
- Update all `payment_period = 'full'` to `'Full Month'` for consistency
- Delete duplicate records where both `'full'`/`'Full Month'` and period-split records exist for the same employee+program+month

**2. Edge Function — Delete before upsert**
Before upserting computed records, delete all existing records for the same `employee_id + program_id + review_period + review_year` combination. This ensures:
- Period changes (full → split or vice versa) don't leave orphans
- Re-computation always reflects current DQ status cleanly

**3. Edge Function — Standardise `'Full Month'` everywhere**
Change the fallback/support program `payment_period` from `'full'` to `'Full Month'` (line 570) to match the production logic.

### Files Modified

| File | Change |
|------|--------|
| DB migration | Normalize `'full'` → `'Full Month'`; delete orphan duplicates |
| `supabase/functions/compute-monthly-incentives/index.ts` | Add delete-before-upsert; change `'full'` → `'Full Month'` at line 570 |
| `DOCUMENTATION.md` | v2.15.38 |
| `POLICY.md` | Update §44 note on recomputation cleanup |

### Risk Assessment
- **Regression**: Low — delete-before-upsert is scoped to exact employee+program+month; only affects records about to be recomputed
- **Data**: Migration is corrective only; normalizes existing inconsistency
- **Manual override preservation**: The delete-before-upsert will remove manually overridden statuses. To mitigate, the function should read existing overrides first (already done at line 276-281) and re-apply them after upsert (already done at line 532/582). No additional code needed.

