
-- Add missing FK so PostgREST can resolve employee:profiles!increment_run_items_employee_id_fkey
ALTER TABLE public.increment_run_items
  ADD CONSTRAINT increment_run_items_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.increment_run_items VALIDATE CONSTRAINT increment_run_items_employee_id_fkey;

-- Ensure Data API grants are in place (project standard)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_run_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.confirmation_increment_adjustments TO authenticated;
GRANT ALL ON public.increment_runs TO service_role;
GRANT ALL ON public.increment_run_items TO service_role;
GRANT ALL ON public.confirmation_increment_adjustments TO service_role;

-- Reload PostgREST schema cache so the new FK is picked up immediately
NOTIFY pgrst, 'reload schema';
