-- Seed RPT-WFR-001 (Workflow Resolution Report) into report registry tables.
-- Idempotent: skips if already present. Defaults are mirrored from src/lib/reports/catalog.ts.

INSERT INTO public.report_registry
  (report_id, report_key, module_prefix, display_name, canonical_route, menu_key, description, is_active, sort_order)
VALUES
  ('RPT-WFR-001', 'workflow-resolution', 'WFR', 'Workflow Resolution Report',
   '/reports/workflow-resolution', NULL, NULL, true, 210)
ON CONFLICT (report_id) DO NOTHING;

INSERT INTO public.report_field_registry
  (report_id, field_key, default_label, default_sort, is_required, is_renamable, data_type)
VALUES
  ('RPT-WFR-001', 'employee',   'Employee',   10, true,  true,  'string'),
  ('RPT-WFR-001', 'department', 'Department', 20, false, true,  'string'),
  ('RPT-WFR-001', 'template',   'Template',   30, false, true,  'string'),
  ('RPT-WFR-001', 'source',     'Source',     40, false, true,  'string')
ON CONFLICT (report_id, field_key) DO NOTHING;