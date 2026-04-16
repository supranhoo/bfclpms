
INSERT INTO public.system_settings (setting_key, setting_value, description) VALUES
  ('evidence_max_size_mb', '5', 'Maximum file size in MB for evidence uploads'),
  ('import_max_size_mb', '10', 'Maximum file size in MB for data import files'),
  ('branding_max_size_mb', '5', 'Maximum file size in MB for branding assets (logos, wallpapers)'),
  ('evidence_allowed_types', '["pdf","doc","docx","xls","xlsx","png","jpg","jpeg"]', 'Allowed file extensions for evidence uploads'),
  ('import_allowed_types', '["xlsx","xls"]', 'Allowed file extensions for import files'),
  ('import_max_rows', '10000', 'Maximum number of rows allowed per import file'),
  ('import_duplicate_handling', '"skip"', 'How to handle duplicates during import: skip, update, or reject'),
  ('import_background_threshold', '100', 'Row count above which import runs in background mode'),
  ('kpi_import_mandatory_fields', '["target","uom","weightage"]', 'Configurable mandatory fields for KPI imports (beyond always-required fields)'),
  ('employee_import_mandatory_fields', '["designation"]', 'Configurable mandatory fields for employee imports (beyond always-required fields)'),
  ('evidence_max_files_per_kpi', '5', 'Maximum number of evidence files per KPI'),
  ('evidence_allow_paste', 'true', 'Whether Ctrl+V paste upload is enabled for evidence'),
  ('kpi_import_column_order', '["employeeCode","fullName","category","kra","kpi","target","uom","frequency","kpiWeightage","criteria","r5","r4","r3","r2","r1","r0"]', 'Column ordering for KPI import template'),
  ('employee_import_column_order', '["employeeCode","fullName","email","designation","division","businessUnit","department","pmsGrade","managerEmployeeId","role"]', 'Column ordering for employee import template')
ON CONFLICT (setting_key) DO NOTHING;
