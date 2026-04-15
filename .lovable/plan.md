

## Add Missing Audit Sub-Menu to Menu Access Config

### Problem
The "Org KPI Audit Review" menu item (key: `admin-org-kpi-audit`) exists in the sidebar under the Audit section but was never inserted into the `menu_access_config` database table. Since the Menu Access Rights grid renders rows from that table, this item is invisible in the profile mapping UI.

### Solution
Run a database migration to insert the missing row into `menu_access_config`.

### Changes

**Database Migration**
```sql
INSERT INTO menu_access_config (menu_key, menu_name, section, allowed_roles, display_order)
SELECT 'admin-org-kpi-audit', 'Org KPI Audit Review', 'audit', ARRAY['auditor','admin']::text[], 41
WHERE NOT EXISTS (SELECT 1 FROM menu_access_config WHERE menu_key = 'admin-org-kpi-audit');
```

**`DOCUMENTATION.md`** — Version bump  
**`POLICY.md`** — Version bump

### Risk Assessment
- **Data impact**: Single INSERT, no existing data affected
- **Regression risk**: None — additive change only
- **UX improvement**: Both audit sub-menus (Audit Panel + Org KPI Audit Review) will appear in the Menu Access Rights grid for profile mapping

