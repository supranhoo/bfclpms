

## Fix: RLS Policy Blocks Non-Admin Users from Managing Vessel Rates

### Root Cause
The `incentive_vessel_rates` table has RLS policies that only allow users with the `admin` role to insert/update/delete. Employee 101715 has a **menu access override** granting UI access to Incentive Config, but the database-level RLS still requires the `admin` role — so the insert fails.

### Fix
Add RLS policies that also permit users who have a menu access override for `admin-incentive`. This mirrors the pattern used for report access overrides (`has_report_access_override`).

### Implementation

#### 1. Database Migration
Create a `SECURITY DEFINER` function to check menu access overrides, then add alternative INSERT/UPDATE/DELETE policies:

```sql
-- Function to check if user has a menu access override
CREATE OR REPLACE FUNCTION public.has_menu_access_override(_user_id uuid, _menu_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.menu_access_user_overrides
    WHERE user_id = _user_id AND menu_key = _menu_key AND is_granted = true
  )
$$;

-- Add override-based policies for incentive_vessel_rates
CREATE POLICY "Menu override users can insert vessel rates"
  ON public.incentive_vessel_rates FOR INSERT
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update vessel rates"
  ON public.incentive_vessel_rates FOR UPDATE
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete vessel rates"
  ON public.incentive_vessel_rates FOR DELETE
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));
```

#### 2. Also fix related incentive tables
The same issue will apply to all incentive-related tables. Check and add override policies for: `incentive_programs`, `incentive_slabs`, `incentive_program_mappings`, `incentive_records`, `incentive_eligibility_fields`, `incentive_eligibility_data`, `incentive_dq_rules`, `incentive_allocation_rules`, `production_targets`, `business_unit_sub_units`, `incentive_program_types`, `incentive_score_revisions`.

### Files Changed
| File | Action |
|------|--------|
| Database migration | Add `has_menu_access_override` function + additive RLS policies on incentive tables |

### Risk Assessment
- **Regression**: Zero — additive policies; existing admin access unchanged
- **Security**: Scoped to users explicitly granted `admin-incentive` override by an admin
- **Data**: No schema changes, only new RLS policies

