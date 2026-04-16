

## Add Individual Report-Level Access in Menu Access Rights

### Problem
The Menu Access Rights grid under "Reports" section only shows 6 entries (View Reports, Performance Report, KRA Issuance, TNI Report, Incentive Report, Manager Team KPI). However, the Reports Hub contains 19 individual reports. The remaining 13 reports have no rows in `menu_access_config`, so admins cannot configure profile-based access for them.

### Target UI

```text
Menu Access Rights (Profile Mapping tab)
┌──────────┬──────────────────────────────────┬──────┬─────┬────────┬────────┐
│ Section  │ Menu Item                        │ View │ Add │ Update │ Delete │
├──────────┼──────────────────────────────────┼──────┼─────┼────────┼────────┤
│ Reports  │ View Reports                     │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Employee Performance Summary     │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Performance Report               │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Monthly Scorecard                │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ KRA Issuance                     │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Query Report                     │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Unified Issues Report            │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Completion Rate Report           │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Department Summary               │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Audit Trail Report               │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ TNI Report                       │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ KPI Detail Report                │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Workflow Bottleneck Report       │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ KPI Status Tracker               │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ KPI Journey Timeline             │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Variance Report                  │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Same KPI — Manager vs Team       │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Team Vs Manager Monthly Score    │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ KPI Scorecard Detail             │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ KPI-Employee Score Matrix        │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Incentive Report                 │ [ ]  │ [ ] │  [ ]   │  [ ]   │
│          │ Manager Team KPI                 │ [ ]  │ [ ] │  [ ]   │  [ ]   │
└──────────┴──────────────────────────────────┴──────┴─────┴────────┴────────┘
```

### Solution
Insert the 13 missing report entries into `menu_access_config` with section `'reports'` and appropriate `display_order` values. Wire the `ReportRoute` to also check `canAccess()` for the matching `reports-{reportKey}` menu key (already done). No code changes needed — only a DB migration.

### Changes

**Database Migration** — Insert 13 missing report rows into `menu_access_config`:

| menu_key | menu_name | display_order |
|---|---|---|
| `reports-employee-summary` | Employee Performance Summary | 101 |
| `reports-monthly-scorecard` | Monthly Scorecard | 103 |
| `reports-queries` | Query Report | 106 |
| `reports-issues` | Unified Issues Report | 107 |
| `reports-completion` | Completion Rate Report | 108 |
| `reports-department` | Department Summary | 109 |
| `reports-audit-trail` | Audit Trail Report | 110 |
| `reports-kpi-detail` | KPI Detail Report | 111 |
| `reports-bottleneck` | Workflow Bottleneck Report | 112 |
| `reports-kpi-status-tracker` | KPI Status Tracker | 113 |
| `reports-kpi-journey` | KPI Journey Timeline | 114 |
| `reports-variance` | Variance Report | 115 |
| `reports-team-vs-manager-score` | Team Vs Manager Monthly Score | 116 |
| `reports-kpi-scorecard-detail` | KPI Scorecard Detail | 117 |
| `reports-kpi-employee-matrix` | KPI-Employee Score Matrix | 118 |

All rows use `section = 'reports'` and `allowed_roles = '{admin}'` (default — admins configure profile-based access from there).

**File: `src/components/layout/ReportRoute.tsx`** — Already checks `canAccess('reports-{reportKey}')`, so no changes needed.

**File: `src/pages/reports/ReportsHub.tsx`** — Update `visibleReports` filter to also check `canAccess('reports-{reportKey}')` via `useMenuAccess`, so profile-based report visibility works on the hub page too.

**Files: `DOCUMENTATION.md`, `POLICY.md`** — Version bump.

### Risk Assessment
- **Data impact**: Additive INSERT only, no existing data affected
- **Regression risk**: None — existing 6 report entries remain unchanged; new rows use `ON CONFLICT DO NOTHING`
- **UX improvement**: All 19+ reports individually configurable in Menu Access Rights grid

