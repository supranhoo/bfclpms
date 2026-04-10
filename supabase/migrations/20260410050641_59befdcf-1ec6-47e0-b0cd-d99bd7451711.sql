
-- =============================================
-- RLS Policies for admin-incentive-data menu override
-- Fixes: User 201091 cannot see employees on Incentive Data Entry
-- =============================================

-- 1. profiles: Allow incentive-data users to view all active profiles
CREATE POLICY "Incentive data entry users can view active profiles"
ON public.profiles FOR SELECT TO authenticated
USING (is_active = true AND has_menu_access_override(auth.uid(), 'admin-incentive-data'));

-- 2. employee_incentive_eligibility: SELECT / INSERT / UPDATE
CREATE POLICY "Incentive data users can view eligibility"
ON public.employee_incentive_eligibility FOR SELECT TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

CREATE POLICY "Incentive data users can insert eligibility"
ON public.employee_incentive_eligibility FOR INSERT TO authenticated
WITH CHECK (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

CREATE POLICY "Incentive data users can update eligibility"
ON public.employee_incentive_eligibility FOR UPDATE TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'))
WITH CHECK (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

-- 3. incentive_vessel_rates: SELECT / INSERT / UPDATE / DELETE
CREATE POLICY "Incentive data users can view vessel rates"
ON public.incentive_vessel_rates FOR SELECT TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

CREATE POLICY "Incentive data users can insert vessel rates"
ON public.incentive_vessel_rates FOR INSERT TO authenticated
WITH CHECK (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

CREATE POLICY "Incentive data users can update vessel rates"
ON public.incentive_vessel_rates FOR UPDATE TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'))
WITH CHECK (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

CREATE POLICY "Incentive data users can delete vessel rates"
ON public.incentive_vessel_rates FOR DELETE TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

-- 4. incentive_eligibility_fields: SELECT (read config)
CREATE POLICY "Incentive data users can view eligibility fields"
ON public.incentive_eligibility_fields FOR SELECT TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

-- 5. incentive_production_rates: SELECT / INSERT / UPDATE / DELETE
CREATE POLICY "Incentive data users can view production rates"
ON public.incentive_production_rates FOR SELECT TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

CREATE POLICY "Incentive data users can insert production rates"
ON public.incentive_production_rates FOR INSERT TO authenticated
WITH CHECK (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

CREATE POLICY "Incentive data users can update production rates"
ON public.incentive_production_rates FOR UPDATE TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'))
WITH CHECK (has_menu_access_override(auth.uid(), 'admin-incentive-data'));

CREATE POLICY "Incentive data users can delete production rates"
ON public.incentive_production_rates FOR DELETE TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'));
