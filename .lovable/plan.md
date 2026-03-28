

## Add Overall Score to Employee Cards Across All Dashboards

### What You Asked For
Display each employee's overall weighted performance score (e.g., 4.2, 5, 3.5) directly on their card tile across all reviewer dashboards — Team Reviews, Self Review, Manager Review, Skip Mgr Review, Audit, HR PMS, and Management.

### Current State
Employee cards in `EmployeeSelectorGrid` show name, designation, manager, progress bar, and status badges. No score is displayed. The `periodKpis` fetched via `SLIM_KPI_SELECT` do **not** include `review_submissions`, so score data is unavailable in the current dataset.

### Proposed UI

```text
┌──────────────────────────────────────────────┐
│  [Avatar]  Ankit Choudhary (101785)    →     │
│            Senior Manager              ┌───┐ │
│            Manager: Jaspal (101125)    │4.2│ │
│  ██████████████████████░░░  6/10       └───┘ │
│  [Direct] [6 pending]                        │
└──────────────────────────────────────────────┘
```

The score badge sits in the top-right area of the card, next to the arrow icon. It uses the canonical color coding from `getScoreBadgeClass`:
- **5** = Blue
- **4** = Green  
- **3** = Yellow
- **2** = Light pink
- **1** = Red
- **0** = Deep maroon
- **No score** = Gray "—"

The score shown is the **weighted average** of all non-N/A KPIs for that employee in the selected period, using the 8-stage fallback chain (final → management → auditor → hr_pms → skip_level → manager → self).

### Technical Approach

#### 1. New Hook: `useEmployeeScoresForPeriod`
A lightweight hook that fetches scores for all visible employees in a single batch query.

**Query**: For all KPI IDs in `periodKpis`, fetch `review_submissions` (kpi_id, final_score, management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score, is_na). This is a single query batched in chunks of 500 IDs.

**Computation**: For each employee, calculate weighted average score:
- Filter out KPIs where `is_na = true` or no submission exists
- Apply 8-stage fallback chain to get the best available score per KPI
- Compute: `sum(score × weightage) / sum(weightage)`
- Return `Map<employeeId, number | null>`

#### 2. Modify `EmployeeSelectorGrid`
- Call the new hook with `periodKpis` KPI IDs
- Pass the score map into `renderEmployeeCard`
- Add a compact score badge (circular, color-coded) in the card's top-right corner, between the employee name row and the arrow icon

#### 3. Score Badge Component
Reuse the existing color utilities from `reviewConstants.ts` (`getScoreBadgeClass`). Display as a small rounded pill showing the numeric score to 1 decimal place (e.g., "4.2"). If no score data exists, show a muted "—".

### Files Changed
| File | Action |
|------|--------|
| `src/hooks/useEmployeeScoresForPeriod.ts` | **New** — batch-fetch submissions and compute weighted avg per employee |
| `src/components/review/EmployeeSelectorGrid.tsx` | Import hook, pass scores to card renderer, add score badge to card layout |

### Risk Assessment
- **Performance**: One additional query for submissions, batched. Cached with 5-minute staleTime. Lightweight computation done client-side via `useMemo`.
- **Data**: Read-only — no schema changes
- **Regression**: Zero — additive UI change only, existing badges/progress bars untouched
- **Security**: Submissions already accessible via existing RLS policies (same user context)

