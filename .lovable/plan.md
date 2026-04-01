

## RCA: Rollover Fails — "Quarterly KPI cannot have review_period = April"

### Root Cause (Two Issues)

**Issue 1 — Rollover copies multi-month KPIs to non-terminal months**

The rollover function blindly sets `review_period: targetMonth` (line 453) for ALL KPIs, regardless of frequency. When rolling March → April:
- Monthly KPIs → April ✓
- Quarterly KPIs → April ✗ (April is locked; terminal month is June)

The function should resolve the target period to the correct terminal month for multi-month frequencies (e.g., Quarterly March → June, not April).

**Issue 2 — Service role bypassed by trigger's admin check**

The `enforce_frequency_lock_on_submission` trigger checks `has_role(auth.uid(), 'admin')`. When the edge function uses `SUPABASE_SERVICE_ROLE_KEY`, `auth.uid()` is NULL, so the admin bypass fails. Even if Issue 1 is fixed, the trigger should also allow service-role callers to pass.

### Fix

**1. Edge function: resolve target period for multi-month frequencies**

In `auto-rollover-kpis/index.ts`, before building the cloned KPI record, resolve the target month based on frequency:

- Fetch `frequency_config` rows (already available via the locked_months data)
- For each source KPI with a multi-month frequency (Quarterly, Bi-Monthly, Half-Yearly, Yearly):
  - Find which cycle the target month falls into
  - Set `review_period` to that cycle's terminal month instead of the raw target month
  - E.g., Quarterly + April → June (Q2 terminal)

```text
Frequency    | Target April resolves to
-------------|-------------------------
Monthly      | April (unchanged)
Bi-Monthly   | April (terminal of Mar-Apr cycle)
Quarterly    | June (terminal of Q2: Apr-May-Jun)
Half-Yearly  | June (terminal of H1: Jan-Jun)
Yearly       | June (terminal of FY: Jul-Jun)
```

**2. Trigger: allow service-role bypass**

Update `enforce_frequency_lock_on_submission()` to also check if the caller is using the service role (no JWT = service role context), adding:
```sql
IF current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;
```

**3. Deduplication guard**

After resolving the terminal month, the existing dedup check (line 202-206) already prevents duplicates since it matches on `employee_id + kra_name + kpi_name + target_period + target_year`. No additional change needed — the resolved terminal month will correctly match existing records.

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/auto-rollover-kpis/index.ts` | Fetch frequency_config; resolve target period per frequency before cloning |
| DB migration | Add `service_role` bypass to `enforce_frequency_lock_on_submission` trigger |
| `DOCUMENTATION.md` | v2.15.41 |
| `POLICY.md` | Update rollover section |

### Risk Assessment
- **Regression**: None — Monthly KPIs unaffected; multi-month KPIs get correct terminal month
- **Data**: No schema change; trigger update is additive (new bypass path)
- **Edge case**: If a Quarterly KPI was already rolled to the terminal month by a previous successful run, the dedup guard prevents duplicates

