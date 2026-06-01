INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'employee_master_field_requirements',
  '{"full_name":true,"email":false,"employee_code":true,"group_doj":false,"doj":false,"confirmation_date":false,"company_id":false,"division_id":false,"department_id":false,"designation":false,"pms_grade":false,"employee_category":false,"employment_status":false,"location_id":false,"reporting_manager_id":false,"role":false,"portal_access":false,"is_dummy_employee":false}'::jsonb,
  'Per-field mandatory flag for the Add New User page'
)
ON CONFLICT (setting_key) DO NOTHING;