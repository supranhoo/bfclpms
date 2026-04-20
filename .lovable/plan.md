

## Add Active/Inactive Filter Toggle to All Excel Reports

### Goal
Give users a per-report runtime control to choose whether the Excel export (and the on-screen data) includes inactive employees, in addition to the v2.64.6 default of "active only".

### UI Design

A compact 3-option segmented toggle placed in the report header, immediately to the left of the "Export to Excel" button. Consistent across all ~20 reports.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Employee Performance Summary                                            │
│  Period: Jan 2026   Department: All                                      │
│                                                                          │
│  ┌────────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │ Employees:                     │  │  [⬇ Export to Excel]            │ │
│  │ ( • Active ) ( Inactive ) ( All ) │  │                              │ │
│  └────────────────────────────────┘  └─────────────────────────────────┘ │
│                                                                          │
│  Showing 2,533 active employees · 47 inactive hidden                     │
│  ──────────────────────────────────────────────────────────────────────  │
│  [ table … ]                                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

**Behavior:**
- **Active** (default, pre-selected) — current v2.64.6 behavior
- **Inactive** — only ex-employees / `is_active=false`
- **All** — both, with an "Inactive" badge on each ex-employee row

The footer hint live-updates: `"Showing N active · M inactive"` (or the equivalent for the chosen mode).

The same selection drives both the on-screen table AND the Excel download. The Excel file gets a header cell `"Filter: Active employees only"` so the export is self-describing.

**Mobile (<640px):** The segmented control collapses to a `Select` dropdown labelled "Employees" with the same three choices, sitting above the export button.

### Files Touched

| File | Change |
|---|---|
| `src/components/reports/EmployeeStatusFilter.tsx` (new) | Reusable segmented toggle (Active / Inactive / All). Returns `'active' \| 'inactive' \| 'all'`. Persists to URL via `useUrlFilterState('emp_status', 'active')` so refresh keeps the choice. |
| `src/lib/reportEmployeeFilter.ts` (new) | Tiny pure helper `applyEmployeeStatusFilter(rows, mode, getIsActive)` used by every report's data prep + export builder. Single source of filtering logic. |
| `src/pages/reports/EmployeePerformanceSummary.tsx` | Mount filter, swap hardcoded `is_active=true` query filter for dynamic mode, use helper before export |
| `src/pages/reports/KpiDetailReport.tsx` | Same |
| `src/pages/reports/KpiStatusTracker.tsx` | Same |
| `src/pages/reports/KpiScorecardDetail.tsx` | Same |
| `src/pages/reports/AuditTrailReport.tsx` | Same |
| `src/pages/reports/KpiJourneyReport.tsx` | Same |
| `src/pages/reports/ManagerTeamKpiReport.tsx` | Same |
| `src/pages/reports/VarianceReport.tsx` | Same |
| `src/pages/reports/CompletionReport.tsx` | Same |
| `src/pages/reports/DepartmentReport.tsx` | Same |
| `src/pages/reports/PerformanceReport.tsx` | Same |
| `src/pages/reports/MonthlyScorecardReport.tsx` | Same |
| `src/pages/reports/TeamVsManagerScoreReport.tsx` | Same |
| `src/pages/reports/QueryReport.tsx` | Same |
| `src/pages/reports/IssuesReport.tsx` | Same |
| `src/pages/reports/TNIReport.tsx` | Same |
| `src/pages/reports/KRAIssuance.tsx` | Same |
| `src/pages/reports/IncentiveReport.tsx` | Same |
| `src/pages/reports/BottleneckReport.tsx` + `src/hooks/useBottleneckReport.ts` | Same |
| `src/pages/reports/CustomReport.tsx` | Same; KPI-mode + employee-mode both honor the filter |
| `src/pages/reports/KpiEmployeeMatrix.tsx` (uses `useAdminReports.ts`) | Same |
| `DOCUMENTATION.md` | v2.64.7 — Active/Inactive filter on all reports |
| `mem://features/reports/company-scoped-reporting` | Append: "Every report exposes an Active/Inactive/All segmented control next to its export button. Default = Active. Helper `applyEmployeeStatusFilter` is the single source of truth." |

### Technical Details (for engineers)

- The filter is intentionally **client-side post-fetch** to keep one shared helper across reports with very different query shapes (some join `kpis → profiles!inner`, some pull `profiles` standalone).
- For reports already querying `profiles` standalone, we drop the hardcoded `.eq('is_active', true)` and let the helper filter the result. This avoids duplicate filtering and keeps "Inactive" / "All" modes possible without query rewrites.
- Excel export receives a metadata row at the top: `Filter: <Active|Inactive|All>` so audit reviewers see the scope at a glance.
- URL persistence (`?emp_status=inactive`) means a shared link respects the chosen scope.

### Risk & Impact

| Area | Impact |
|---|---|
| Data | None — same data, controlled visibility |
| Workflow / RLS | None |
| UI | Adds one small control per report. Default behavior unchanged from v2.64.6 (Active only). |
| Regression | Low. Helper is pure and well-typed; existing reports stay functional if they ignore the new prop (graceful degradation during incremental rollout). |
| Mitigation / test | (a) Each report: switch to Inactive → only ex-employees show; switch to All → counts add up. (b) Excel export header reflects mode. (c) Refresh preserves `emp_status` URL param. (d) Mobile (<640px) shows Select dropdown. |

### Out of Scope
- Per-user default preference (URL persistence covers most use cases)
- Showing inactive employees in operational dashboards (governance memo keeps them out)
- Bulk re-activation tools

