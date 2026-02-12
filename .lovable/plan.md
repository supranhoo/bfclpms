

# Fix: Circular RLS Dependency Breaking All Data for Jaspal

## Root Cause Analysis (RCA)

The profiles RLS policy we added in the last migration creates a **circular dependency**:

```text
profiles policy "Data owners can view org kpi employee profiles"
  --> queries kpis table (subject to kpis RLS)
    --> kpis policy "Managers can view their reports' KPIs"
      --> queries profiles table (subject to profiles RLS)
        --> back to step 1... infinite loop
```

PostgreSQL detects this recursion and silently returns **zero rows** for all queries touching either table. This is why:
- Profile shows "User" (profile query returns null)
- No data appears anywhere (KPI queries also fail)

## Corrective Action (CAPA)

Replace the direct table reference in the `profiles` policy with a **SECURITY DEFINER function** that bypasses RLS when checking the `kpis` table, breaking the circular chain.

### Step 1: Create a SECURITY DEFINER helper function

```sql
CREATE OR REPLACE FUNCTION public.is_data_owner_for_employee(p_employee_id uuid, p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM kpis k
    JOIN org_kpi_data_owners o
      ON o.category_id = k.category_id
      AND o.kra_name = k.kra_name
      AND o.kpi_name = k.kpi_name
    WHERE k.employee_id = p_employee_id
      AND k.is_org_level = true
      AND o.owner_id = p_owner_id
  );
$$;
```

`SECURITY DEFINER` means this function runs as the DB owner, bypassing RLS on `kpis` -- which breaks the circular chain.

### Step 2: Replace the problematic profiles policy

```sql
DROP POLICY "Data owners can view org kpi employee profiles" ON profiles;

CREATE POLICY "Data owners can view org kpi employee profiles"
  ON profiles FOR SELECT TO authenticated
  USING (
    public.is_data_owner_for_employee(profiles.id, auth.uid())
  );
```

Now the `profiles` policy calls a function instead of directly querying `kpis`, so PostgreSQL does not detect a circular RLS dependency.

### Step 3: Update documentation

Update `DOCUMENTATION.md` to note the SECURITY DEFINER function pattern used to avoid circular RLS.

## Files Changed

| File | Change |
|------|--------|
| Database (migration) | Create `is_data_owner_for_employee` function; drop and recreate profiles policy |
| `DOCUMENTATION.md` | Document the SECURITY DEFINER pattern |

## Expected Result

After this fix:
- Jaspal's profile loads correctly (name, designation visible)
- Dashboard, KPIs, and all other pages return data normally
- Impact Analysis continues to show all affected employees
- No circular RLS dependency exists

