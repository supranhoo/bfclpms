

## Fix: "Team Vs Manager Score" Missing from Report Access Settings

### Root Cause
The `report_access_config` database table doesn't have a row for `team-vs-manager-score`. The `ReportAccessTab` UI only displays rows from this table. The fallback in `useReportAccess.ts` handles runtime permission checks but doesn't populate the admin settings UI.

### Fix
Run a migration to insert the missing row into `report_access_config`:

```sql
INSERT INTO report_access_config (report_key, report_name, view_roles, download_roles)
VALUES ('team-vs-manager-score', 'Team Vs Manager Monthly Score Summary', 
        ARRAY['admin','manager','management','hr_pms']::text[], 
        ARRAY['admin']::text[])
ON CONFLICT (report_key) DO NOTHING;
```

### Files Changed
| File | Action |
|------|--------|
| Migration SQL | Insert `team-vs-manager-score` row into `report_access_config` |

### Risk Assessment
- **Data**: Additive — single row insert, no existing data affected
- **Regression**: Zero
- **Security**: No change — matches existing default permissions

