

## Fix: KPI-Employee Score Matrix not visible on Reports Hub

### Root Cause
The report card uses `reportKey: 'kpi-employee-matrix'` which is checked against `menu_access_config` via `useReportAccess`. Since no row exists in `menu_access_config` for this key, `canView()` returns `false` and the card is hidden.

### Solution

**Database Migration** — Insert the missing menu access config row:

```sql
INSERT INTO public.menu_access_config (menu_key, menu_name, section, default_roles)
VALUES (
  'reports-kpi-employee-matrix',
  'KPI-Employee Score Matrix',
  'Reports',
  ARRAY['admin', 'hr_manager']::app_role[]
)
ON CONFLICT (menu_key) DO NOTHING;
```

Also verify/fix the `reportKey` convention — existing reports use `reports-${key}` prefix in `menu_access_config` but the `ReportsHub` card uses just the key. Need to check how `useReportAccess.canView()` maps the key to the menu config to ensure consistency.

### Files to Update
- **Database**: Insert `menu_access_config` row (migration)
- **Possibly** `ReportsHub.tsx`: Align `reportKey` if the convention requires `reports-` prefix
- `DOCUMENTATION.md` / `POLICY.md`: Version bump

### Risk Assessment
- **Data Impact**: Additive INSERT only
- **Regression**: None — only enables visibility for a new report

