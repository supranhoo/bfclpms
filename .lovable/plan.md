

## Fix: KPI Journey Report Access Denied

### Problem
The report redirects to `/dashboard` because the `kpi-journey` report key has no entry in:
1. The `DEFAULT_CONFIGS` fallback map in `useReportAccess.ts`
2. The `report_access_config` database table

### Changes

**File: `src/hooks/useReportAccess.ts`**
- Add `'kpi-journey'` to the `DEFAULT_CONFIGS` map with view roles `['admin', 'auditor', 'management']` and download roles `['admin']` (matching similar report patterns like `bottleneck`)

**Database: `report_access_config` table**
- Insert a row for `kpi-journey` with appropriate role-based access so it persists beyond the fallback

Both changes ensure the report is accessible to admin users immediately.

