

## Fix: Incentive Report Not Accessible

### Root Cause
The `ReportRoute` wrapping `/reports/incentive` checks `canView('incentive')`. This checks:
1. DB table `report_access_config` for key `'incentive'` — **empty**
2. Fallback `DEFAULT_CONFIGS` in `useReportAccess.ts` — **missing `'incentive'` entry**

Result: `canView('incentive')` always returns `false`, redirecting to `/dashboard`.

### Fix

#### 1. `src/hooks/useReportAccess.ts` — Add default config entry

Add to `DEFAULT_CONFIGS`:
```typescript
'incentive': { view_roles: ['admin', 'management', 'hr_pms'], download_roles: ['admin'] },
```

#### 2. Database migration — Seed `report_access_config`

Insert a row so the DB-based config takes over:
```sql
INSERT INTO report_access_config (report_key, report_name, view_roles, download_roles)
VALUES ('incentive', 'Incentive Report', ARRAY['admin','management','hr_pms']::app_role[], ARRAY['admin']::app_role[])
ON CONFLICT DO NOTHING;
```

### Files Modified
- `src/hooks/useReportAccess.ts` — add `'incentive'` to `DEFAULT_CONFIGS`
- DB migration — seed `report_access_config` row

