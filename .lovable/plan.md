

## Filter Pending KPI Details to Show Only Overdue KPIs

### Problem
The "Pending KPI Details" table currently shows ALL pending KPIs. User wants to show only KPIs that are overdue — i.e., pending past their due date.

### Due Date Logic
- **Monthly/Daily/Weekly (and null/unknown)**: Due date = 1st of the month following `review_period`
- **Bi-Monthly**: Due date = 1st of the month after the bi-monthly cycle end (Jan-Feb → Mar 1, Mar-Apr → May 1, etc.)
- **Quarterly**: Due date = 1st of the month after quarter end (Jan-Mar → Apr 1, Apr-Jun → Jul 1, Jul-Sep → Oct 1, Oct-Dec → Jan 1 next year)
- **Half-Yearly**: Due date = 1st of month after half end (Jan-Jun → Jul 1, Jul-Dec → Jan 1 next year)
- **Yearly**: Due date = Jan 1 of the following year

### Changes

#### File: `src/hooks/useBottleneckReport.ts`

1. **Add a `getDueDate` helper function** that takes `frequency`, `review_period` (month name), and `review_year`, and returns a `Date` representing the due date based on the logic above. Uses `getMonthNumber` from `frequencyUtils` to convert month names.

2. **Filter in `allRows` (line 123)**: After the existing `.filter(kpi => kpi.status !== 'approved')`, add a second filter that computes the due date for each KPI and excludes rows where `today < dueDate`. This ensures only overdue KPIs appear.

### No database changes needed

