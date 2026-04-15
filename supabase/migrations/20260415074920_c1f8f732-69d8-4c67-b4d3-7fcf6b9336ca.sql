
-- 1. Named access profiles
CREATE TABLE public.access_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.access_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage access profiles"
  ON public.access_profiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view access profiles"
  ON public.access_profiles FOR SELECT
  TO authenticated
  USING (true);

-- 2. Org-level scope per profile (AND logic, nulls = wildcard)
CREATE TABLE public.access_profile_org_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id),
  division_id uuid REFERENCES public.divisions(id),
  business_unit_id uuid REFERENCES public.business_units(id),
  department_id uuid REFERENCES public.departments(id),
  designation text,
  pms_grade text,
  level text,
  CONSTRAINT at_least_one_filter CHECK (
    company_id IS NOT NULL OR division_id IS NOT NULL OR
    business_unit_id IS NOT NULL OR department_id IS NOT NULL OR
    designation IS NOT NULL OR pms_grade IS NOT NULL OR level IS NOT NULL
  )
);

ALTER TABLE public.access_profile_org_scope ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage org scopes"
  ON public.access_profile_org_scope FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view org scopes"
  ON public.access_profile_org_scope FOR SELECT
  TO authenticated
  USING (true);

-- 3. Granular menu permissions per profile
CREATE TABLE public.access_profile_menu_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  menu_key text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_add boolean NOT NULL DEFAULT false,
  can_update boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  UNIQUE (profile_id, menu_key)
);

ALTER TABLE public.access_profile_menu_rights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage menu rights"
  ON public.access_profile_menu_rights FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view menu rights"
  ON public.access_profile_menu_rights FOR SELECT
  TO authenticated
  USING (true);

-- 4. Assign users to profiles
CREATE TABLE public.access_profile_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, user_id)
);

ALTER TABLE public.access_profile_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage profile assignments"
  ON public.access_profile_assignments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view profile assignments"
  ON public.access_profile_assignments FOR SELECT
  TO authenticated
  USING (true);

-- 5. Helper function: get all menu rights for a user via their profile assignments
CREATE OR REPLACE FUNCTION public.get_user_access_profile_rights(p_user_id uuid)
RETURNS TABLE(menu_key text, can_view boolean, can_add boolean, can_update boolean, can_delete boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (mr.menu_key)
    mr.menu_key,
    bool_or(mr.can_view) AS can_view,
    bool_or(mr.can_add) AS can_add,
    bool_or(mr.can_update) AS can_update,
    bool_or(mr.can_delete) AS can_delete
  FROM access_profile_assignments apa
  JOIN access_profiles ap ON ap.id = apa.profile_id AND ap.is_active = true
  JOIN access_profile_menu_rights mr ON mr.profile_id = ap.id
  WHERE apa.user_id = p_user_id
  GROUP BY mr.menu_key;
$$;
