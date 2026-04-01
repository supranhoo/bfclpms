INSERT INTO menu_access_config (menu_key, menu_name, section, allowed_roles, display_order)
SELECT 'admin-incentive-data', 'Incentive Data Entry', 'admin', ARRAY['admin']::text[], 
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM menu_access_config WHERE section = 'admin')
WHERE NOT EXISTS (SELECT 1 FROM menu_access_config WHERE menu_key = 'admin-incentive-data');