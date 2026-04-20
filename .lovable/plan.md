

## RCA — HR PMS Stat Cards Show Wrong Counts (Mar 2026)

### Evidence (DB vs UI)

| Card | UI | DB Truth | Gap |
|---|---|---|---|
| Total Employees | 14 | 107 distinct employees have March KPIs at HR-PMS-relevant stages | -93 |
| Pending Review | 0 | 0 at `skip_level_check` | ✅ |
| In HR PMS Review | 28 | 28 at `hr_pms_review` | ✅ |
| HR PMS Reviewed | 185 | 806 KPIs past HR PMS (or ~739 if "approved only") | -621 |
| Total KPIs | 595 | 1,758 March KPIs | -1,163 |

### Root Cause

The v2.64.8 "period-aware Total Employees" fix in `EmployeeSelectorGrid.tsx` over-narrowed the denominator. For HR PMS / Audit / Management views, the recompute counts only employees whose CURRENT KPI status is at the reviewer's stage or immediately before it. It excludes:

1. **Employees whose KPIs already advanced past the reviewer's stage** — for HR PMS, employees with KPIs now at `management_review` or `approved` were reviewed by HR PMS this period and must count toward "Total Employees" and "Reviewed".
2. **Employees with mixed-status KPI sets** — some at `kra_set`, some at `manager_check`, some at `approved` — they belong in the period roster regardless of where the bulk sits today.
3. **`Total KPIs` filter is over-scoped** — currently filters by stage-eligibility instead of "all KPIs of employees in this view's roster, this period".

The `2,468 eligible of 2,533` diagnostic correctly identifies the workflow-eligible pool. The bug is in the second-stage narrowing (period-presence + stage-relevance) which drops anyone past the reviewer's stage.

### Fix Plan

#### Fix 1 — Correct "Total Employees" definition for review dashboards
In `src/components/review/EmployeeSelectorGrid.tsx`, change the period-aware recompute so an employee counts if **any** of their KPIs in the selected period falls within the workflow stages relevant to this view:

| View | Counts employees with any March KPI at any of: |
|---|---|
| `hr_pms` | `kra_set`, `self_review`, `manager_check`, `skip_level_check`, `hr_pms_review`, `audit`, `management_review`, `approved` (i.e., any stage their workflow contains) |
| `audit` | same — any stage in their template |
| `management` | same |
| `manager` | same (limited to direct reports) |
| `skip_level` | same (limited to skip-reports) |

In short: **roster = employees whose workflow includes my review stage AND who have ≥1 KPI in this period**, regardless of where those KPIs currently sit.

#### Fix 2 — Correct "HR PMS Reviewed" / "Audit Reviewed" / "Management Reviewed"
Define "Reviewed by me this period" as: KPIs whose `<stage>_score` (or `<stage>_reviewed_at` audit column) is populated AND `review_period = March` AND `review_year = 2026`. This avoids double-counting work that bypassed the stage.

For HR PMS: count KPIs where `hr_pms_score IS NOT NULL` (or equivalent) for March 2026.

#### Fix 3 — Correct "Total KPIs" 
Change to: total KPIs in this period belonging to employees in the current roster (after demographic + workflow filters), not stage-scoped. Label tooltip: *"All KPIs in this period for employees visible in this view"*.

#### Fix 4 — Tooltip clarity
Add tooltips to all 5 stat cards explaining the exact definition (e.g., *"Employees with at least one KPI in March whose workflow includes HR PMS"*).

### UI Mockup

```text
┌──────────────────┬──────────────┬──────────────────┬──────────────────┬──────────────┐
│ Total Employees  │ Pending      │ In HR PMS Review │ HR PMS Reviewed  │ Total KPIs   │
│      107  ⓘ      │      0       │       28         │      739         │   1,758      │
│ In Mar 2026      │ Before HR PMS│ Currently here   │ HR PMS completed │ This period  │
└──────────────────┴──────────────┴──────────────────┴──────────────────┴──────────────┘
ⓘ tooltip: "Employees with at least one KPI in March 2026 whose workflow includes the HR PMS stage"
```

### Files Touched

| File | Change |
|---|---|
| `src/components/review/EmployeeSelectorGrid.tsx` | Rewrite `stats.totalEmployees`, `stats.reviewed`, `stats.totalKpis` recompute blocks. Add Tooltip wrappers explaining each metric. Keep diagnostic line. |
| `src/components/review/StatCard.tsx` (if separate) or inline | Accept `tooltip?: string` prop |
| `DOCUMENTATION.md` | v2.64.11 — Stat card metric corrections for reviewer dashboards |
| `mem://features/review/reviewer-dashboard-view-architecture` | Append: "Stat cards: Total Employees = period-present + workflow-eligible (any stage); Reviewed = KPIs with reviewer signature in period; Total KPIs = period total for visible roster" |

### Risk & Impact

| Area | Impact |
|---|---|
| Data | None (read-only metrics) |
| Workflow / RLS | None |
| Numbers shown | All 5 cards on HR PMS / Audit / Management / Manager / Skip-Level dashboards will increase to match DB truth. May surprise users — version note + tooltips explain why. |
| Regression | Low. Sort, badges, filters, employee list all unchanged. Only stat card numerator/denominator math changes. |
| Test matrix | (a) HR PMS Mar 2026 → Total Employees ≈ 107, Total KPIs = 1,758, In Review = 28, Reviewed ≥ 739. (b) Audit Mar 2026 → numbers reflect audit-stage truth. (c) Manager Review → only direct reports counted. (d) Tooltips render on hover. (e) Diagnostic line still shows "X eligible of Y active". |

### Out of Scope
- Server-side metric aggregation (current client-side calc is fast enough)
- Changing the employee card list / sort / pagination
- Touching dashboards outside the reviewer grid (admin reports, etc.)

