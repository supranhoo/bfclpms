CREATE POLICY "Incentive data entry users can manage daily entries"
ON public.production_daily_entries FOR ALL TO authenticated
USING (has_menu_access_override(auth.uid(), 'admin-incentive-data'))
WITH CHECK (has_menu_access_override(auth.uid(), 'admin-incentive-data'));