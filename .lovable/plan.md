

## RCA: "new row violates row-level security" on `production_daily_entries`

### Root Cause

The `production_daily_entries` table has a single write policy (`Admins and menu-override users can manage daily entries`) that checks for:
- `has_role(auth.uid(), 'admin')` OR
- `has_menu_access_override(auth.uid(), 'incentive-config')`

User 201091 (Jitendra Bharti, Manager) has the `admin-incentive-data` override — **neither condition matches**, so all INSERT/UPDATE operations are rejected by RLS.

This is the same class of bug fixed in the previous migration for `employee_incentive_eligibility` — the `admin-incentive-data` key was not added to this table's policies.

### Fix

**Single database migration** to add an INSERT/UPDATE policy on `production_daily_entries` for users with `admin-incentive-data` menu override.

```sql
CREATE POLICY "Incentive data entry users can manage daily entries"
ON public.production_daily_entries FOR ALL TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'))
WITH CHECK (has_menu_access_override(auth.uid(), 'admin-incentive-data'));
```

**Documentation updates**: POLICY.md §72 and DOCUMENTATION.md to note that `production_daily_entries` was missed in the prior fix.

### Files to Change

| File | Change |
|------|--------|
| Database migration | Add ALL policy on `production_daily_entries` for `admin-incentive-data` |
| `POLICY.md` | Update §72 to include `production_daily_entries` |
| `DOCUMENTATION.md` | Record this RCA |

### Risk Assessment
- **Data Impact**: None — additive policy only
- **Security**: Controlled via `has_menu_access_override` (SECURITY DEFINER)
- **Regression Risk**: None — no existing policies modified

