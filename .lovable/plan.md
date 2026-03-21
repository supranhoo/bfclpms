

## Show Reporting Manager's KPI Score in View KPI Details

### What
Add a small info card near the "Review Journey" section showing the reporting manager's rating and achieved value for the **same KPI**, but only when:
1. The employee has a reporting manager
2. The manager has the same KPI (matched by `kpi_name`, `review_period`, `review_year`)
3. The manager's KPI status is `approved`

### UI Design
A compact card placed **above** the Review Journey section, styled as an info banner:
```text
┌─────────────────────────────────────────────────┐
│ 👤 Manager's Score (Satyendra Kumar Singh)      │
│   Value: 100    Rating: 5 - Outstanding         │
└─────────────────────────────────────────────────┘
```
- Uses existing `RatingBadge` for the rating display
- Muted background, subtle border — not attention-grabbing, just informational
- Hidden entirely when conditions aren't met

### Changes

**New hook: `src/hooks/useManagerKpiScore.ts`**
- Accepts `kpi` object (needs `employee_id`, `kpi_name`, `review_period`, `review_year`)
- Step 1: Fetch reporting manager ID from `profiles` table
- Step 2: Query `kpis` table for manager's matching KPI where `status = 'approved'`, matched on `kpi_name`, `review_period`, `review_year` (no `kra_name` matching)
- Step 3: Fetch `review_submissions` for that KPI to get `final_score`, `achieved_value`
- Returns: `{ managerName, finalScore, achievedValue, isLoading }`

**New component: `src/components/review/ManagerKpiBenchmark.tsx`**
- Takes the hook's output, renders the info card with `RatingBadge`
- Returns `null` when no matching manager KPI exists

**Modified: `src/components/review/KpiReviewPanel.tsx`**
- Import and render `ManagerKpiBenchmark` above `KpiJourneySection` in the right column

