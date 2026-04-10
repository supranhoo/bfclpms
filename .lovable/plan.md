

## RCA: User 201091 Cannot See Employees on Incentive Data Entry

### Root Cause (Two Layers)

**Layer 1 (PRIMARY): `profiles` table RLS blocks visibility**

User 201091 (Upendra Singh) has role `manager`. The `profiles` table SELECT policies only allow managers to see:
- Their own profile
- Their direct reports (4 employees)
- Skip-level reports of their direct reports

The `useResolvedProgramEmployees` hook fetches ALL active profiles (`profiles` table with `is_active = true`) to resolve program mappings. RLS silently filters this down to only the ~5 profiles 201091 can see. Since most incentive-mapped employees are NOT his reports, the table appears empty.

**There is no `profiles` SELECT policy for users with `admin-incentive-data` menu access override.** Admins, HR PMS, Auditors, and Management can see all profiles — but a `manager` with only a menu override cannot.

**Layer 2 (SECONDARY): `employee_incentive_eligibility` RLS menu key mismatch**

The INSERT/UPDATE policies on `employee_incentive_eligibility` check for menu key `'admin-incentive'`, but user 201091's override is for `'admin-incentive-data'`. Even if he could see employees, his writes would be rejected by RLS.

| Table | Policy Check | User's Override | Match? |
|-------|-------------|-----------------|--------|
| `employee_incentive_eligibility` INSERT | `admin-incentive` | `admin-incentive-data` | NO |
| `employee_incentive_eligibility` UPDATE | `admin-incentive` | `admin-incentive-data` | NO |
| `incentive_vessel_rates` INSERT/UPDATE/DELETE | `admin-incentive` | `admin-incentive-data` | NO |
| `incentive_eligibility_fields` INSERT/UPDATE/DELETE | `admin-incentive` | `admin-incentive-data` | NO |

### Fix

**Migration with two changes:**

1. **Add `profiles` SELECT policy for incentive-data users**: Allow users with `admin-incentive-data` menu override to read all active profiles (needed to populate the employee table).

```sql
CREATE POLICY "Incentive data entry users can view active profiles"
ON public.profiles FOR SELECT TO authenticated
USING (is_active = true AND has_menu_access_override(auth.uid(), 'admin-incentive-data'));
```

2. **Add `employee_incentive_eligibility` INSERT/UPDATE/SELECT policies for `admin-incentive-data`**: The existing policies only check `admin-incentive`. Add parallel policies for the `-data` key, or update the existing ones to check EITHER key.

```sql
-- SELECT so they can read existing eligibility data
CREATE POLICY "Incentive data users can view eligibility"
ON public.employee_incentive_eligibility FOR SELECT TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

-- INSERT
CREATE POLICY "Incentive data users can insert eligibility"
ON public.employee_incentive_eligibility FOR INSERT TO authenticated
WITH CHECK (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

-- UPDATE
CREATE POLICY "Incentive data users can update eligibility"
ON public.employee_incentive_eligibility FOR UPDATE TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'))
WITH CHECK (has_menu_access_override(auth.uid(), 'admin-incentive-data'));
```

3. **Add production data table policies** for `admin-incentive-data` on `incentive_vessel_rates` and `incentive_eligibility_fields` (same pattern — these also only check `admin-incentive`).

### Files to Change

| File | Change |
|------|--------|
| Database migration | Add 6 RLS policies across `profiles`, `employee_incentive_eligibility`, `incentive_vessel_rates`, `incentive_eligibility_fields` |
| `POLICY.md` | Document that `admin-incentive-data` menu override grants read access to all active profiles and CRUD on eligibility/production data |
| `DOCUMENTATION.md` | Record the RCA and fix |

### Risk Assessment
- **Data Impact**: None — read-only profile access scoped to active employees only
- **Security**: Controlled — access gated by `has_menu_access_override` (SECURITY DEFINER function), not open to all authenticated users
- **Regression Risk**: None — additive policies only, no existing policies modified

