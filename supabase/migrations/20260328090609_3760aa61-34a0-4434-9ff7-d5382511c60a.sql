
-- Function to check if user has a menu access override
CREATE OR REPLACE FUNCTION public.has_menu_access_override(_user_id uuid, _menu_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.menu_access_user_overrides
    WHERE user_id = _user_id AND menu_key = _menu_key
  )
$$;

-- incentive_vessel_rates
CREATE POLICY "Menu override users can insert vessel rates"
  ON public.incentive_vessel_rates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update vessel rates"
  ON public.incentive_vessel_rates FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete vessel rates"
  ON public.incentive_vessel_rates FOR DELETE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- incentive_programs
CREATE POLICY "Menu override users can read incentive programs"
  ON public.incentive_programs FOR SELECT
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can insert incentive programs"
  ON public.incentive_programs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update incentive programs"
  ON public.incentive_programs FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete incentive programs"
  ON public.incentive_programs FOR DELETE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- incentive_slabs
CREATE POLICY "Menu override users can insert incentive slabs"
  ON public.incentive_slabs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update incentive slabs"
  ON public.incentive_slabs FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete incentive slabs"
  ON public.incentive_slabs FOR DELETE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- incentive_program_mappings
CREATE POLICY "Menu override users can insert incentive mappings"
  ON public.incentive_program_mappings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update incentive mappings"
  ON public.incentive_program_mappings FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete incentive mappings"
  ON public.incentive_program_mappings FOR DELETE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- employee_incentive_records
CREATE POLICY "Menu override users can read incentive records"
  ON public.employee_incentive_records FOR SELECT
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can insert incentive records"
  ON public.employee_incentive_records FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update incentive records"
  ON public.employee_incentive_records FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- incentive_eligibility_fields
CREATE POLICY "Menu override users can insert eligibility fields"
  ON public.incentive_eligibility_fields FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update eligibility fields"
  ON public.incentive_eligibility_fields FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete eligibility fields"
  ON public.incentive_eligibility_fields FOR DELETE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- employee_incentive_eligibility
CREATE POLICY "Menu override users can insert eligibility data"
  ON public.employee_incentive_eligibility FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update eligibility data"
  ON public.employee_incentive_eligibility FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- incentive_disqualification_rules
CREATE POLICY "Menu override users can insert dq rules"
  ON public.incentive_disqualification_rules FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update dq rules"
  ON public.incentive_disqualification_rules FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete dq rules"
  ON public.incentive_disqualification_rules FOR DELETE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- incentive_allocation_rules
CREATE POLICY "Menu override users can insert allocation rules"
  ON public.incentive_allocation_rules FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update allocation rules"
  ON public.incentive_allocation_rules FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete allocation rules"
  ON public.incentive_allocation_rules FOR DELETE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- incentive_program_types
CREATE POLICY "Menu override users can insert program types"
  ON public.incentive_program_types FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update program types"
  ON public.incentive_program_types FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete program types"
  ON public.incentive_program_types FOR DELETE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- incentive_score_revisions
CREATE POLICY "Menu override users can read score revisions"
  ON public.incentive_score_revisions FOR SELECT
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update score revisions"
  ON public.incentive_score_revisions FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- production_targets
CREATE POLICY "Menu override users can insert production targets"
  ON public.production_targets FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update production targets"
  ON public.production_targets FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete production targets"
  ON public.production_targets FOR DELETE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- business_unit_sub_units
CREATE POLICY "Menu override users can insert sub units"
  ON public.business_unit_sub_units FOR INSERT
  TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update sub units"
  ON public.business_unit_sub_units FOR UPDATE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete sub units"
  ON public.business_unit_sub_units FOR DELETE
  TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));
