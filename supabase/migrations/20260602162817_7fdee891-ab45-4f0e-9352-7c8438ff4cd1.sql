ALTER TABLE public.menu_override_audit
  DROP CONSTRAINT IF EXISTS menu_override_audit_field_check;
ALTER TABLE public.menu_override_audit
  ADD CONSTRAINT menu_override_audit_field_check
  CHECK (field IN ('label','parent','sort_order','reset','is_active','menu_level','module_key','delete_custom_menu_item'));