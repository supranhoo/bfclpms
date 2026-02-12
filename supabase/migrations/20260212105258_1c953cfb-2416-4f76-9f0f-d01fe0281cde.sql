
-- Step 1: Create SECURITY DEFINER function to break circular RLS
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

-- Step 2: Drop and recreate the problematic policy
DROP POLICY IF EXISTS "Data owners can view org kpi employee profiles" ON profiles;

CREATE POLICY "Data owners can view org kpi employee profiles"
  ON profiles FOR SELECT TO authenticated
  USING (
    public.is_data_owner_for_employee(profiles.id, auth.uid())
  );
