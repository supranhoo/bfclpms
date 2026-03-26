

## Fix: Variance Report Not Visible in Reports Hub

### Root Cause
The Variance Report card exists in `ReportsHub.tsx` (line 151-157) and the route exists in `App.tsx`, but it's **hidden by the Report Access Control system**. Line 164 filters: `reports.filter(r => canView(r.reportKey))`.

The `canView('variance')` returns `false` because no row with `report_key = 'variance'` exists in the `report_access_config` table. Without a config entry, the hook denies access by default.

### Fix — Database Migration

Insert a default access config row for the `variance` report key, granting visibility to the same roles as other reports (admin, auditor, management, manager, hr_pms):

```sql
INSERT INTO report_access_config (report_key, allowed_roles, download_roles)
VALUES (
  'variance',
  ARRAY['admin', 'auditor', 'management', 'manager', 'hr_pms']::text[],
  ARRAY['admin', 'auditor', 'management']::text[]
)
ON CONFLICT (report_key) DO NOTHING;
```

### Risk Assessment
- **Data Impact**: Additive — one new row in config table
- **Workflow Impact**: None — makes existing report visible
- **Regression Risk**: Zero — `ON CONFLICT DO NOTHING` prevents duplicates

### Files Changed
1. **Database migration** — Insert `variance` report access config row

