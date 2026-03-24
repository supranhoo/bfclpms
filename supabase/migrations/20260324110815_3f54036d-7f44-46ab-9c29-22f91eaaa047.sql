ALTER TABLE public.incentive_program_mappings
  DROP CONSTRAINT incentive_program_mappings_mapping_type_check;

ALTER TABLE public.incentive_program_mappings
  ADD CONSTRAINT incentive_program_mappings_mapping_type_check
  CHECK (mapping_type IN ('division', 'department', 'business_unit', 'designation', 'pms_grade', 'employee'));