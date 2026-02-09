-- Add 'level' column to all organization structure tables
ALTER TABLE public.divisions ADD COLUMN level text DEFAULT NULL;
ALTER TABLE public.business_units ADD COLUMN level text DEFAULT NULL;
ALTER TABLE public.departments ADD COLUMN level text DEFAULT NULL;
ALTER TABLE public.sub_branches ADD COLUMN level text DEFAULT NULL;
ALTER TABLE public.designations ADD COLUMN level text DEFAULT NULL;
ALTER TABLE public.pms_grades ADD COLUMN level text DEFAULT NULL;