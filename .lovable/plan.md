

## Fix: Team Vs Manager Score Report Shows No Data

### Root Cause
Two issues:

1. **1000-row default limit**: February 2026 has **1,534 KPIs** but the Supabase client returns at most 1,000 rows by default. The query silently truncates results, potentially returning an incomplete or empty-looking dataset.

2. **RLS restriction**: The report queries `kpis` via the client SDK. Unless the logged-in user's role has a matching SELECT policy (or a `report_access_override`), the query returns zero rows — hence "No data found."

### Fix

#### 1. Paginate the KPI query to bypass the 1000-row limit
Split the fetch into batches using `.range(offset, offset + 999)` in a loop until all rows are fetched. This is the same pattern used in `useEmployeeScoresForPeriod`.

#### 2. Ensure report-access-override RLS kicks in
The `has_report_access_override` function checks `report_access_user_overrides` and `report_access_config` to grant org-wide SELECT on `kpis`. Verify the current admin user's role is in `view_roles` for this report key. The config already has `admin` in `view_roles`, so admins should see data — but if the additive SELECT policy on `kpis` only checks `report_access_user_overrides` (not the role-based config), we need to confirm and potentially add user-level override or fix the policy.

### Files Changed
| File | Action |
|------|--------|
| `src/pages/reports/TeamVsManagerScoreReport.tsx` | Add batched fetching with `.range()` to retrieve all 1500+ KPIs; add error logging |

### Risk Assessment
- **Data**: Read-only, no schema changes
- **Regression**: Zero — only affects this report's data fetching
- **Security**: No change — uses existing RLS policies

