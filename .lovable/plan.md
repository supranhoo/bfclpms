

## Fix: Score Trend Hyperlink Lands on Wrong Month

### Problem
When clicking a score (e.g., 4.9 for Feb) in the Direct Reportees monitor, the URL includes `period=February&year=2026`, but the Dashboard page never reads these params. It defaults to the current month instead.

### Root Cause
`src/pages/Dashboard.tsx` line 83-130: The deep-link `useEffect` reads `employee` and `kpi` from URL params but ignores `period` and `year`. The `periodSelection` state is always initialized from `useDefaultPeriodSelection()` (current month).

### Changes

#### `src/pages/Dashboard.tsx` (deep-link useEffect, ~line 83-130)

In the `employeeParam` branch, also read `period` and `year` from searchParams and call `setPeriodSelection` before selecting the employee:

```typescript
const periodParam = searchParams.get('period');
const yearParam = searchParams.get('year');
if (periodParam && yearParam) {
  setPeriodSelection({
    period: periodParam,
    year: parseInt(yearParam, 10),
  });
}
```

Then clean up these params alongside the others:

```typescript
next.delete('period');
next.delete('year');
```

Also handle the case where `employeeParam` is provided without `kpiParam` (which is the pattern the monitor uses — it passes `employee`, `period`, `year` but no `kpi`). Currently only the `employeeParam && kpiParam` branch runs. Add a new branch for `employeeParam` alone (without `kpiParam`) that:
1. Reads period/year and sets periodSelection
2. Fetches the employee profile
3. Switches to team view and selects the employee
4. Cleans up URL params

### No other changes needed
The `DirectReporteesMonitor` already passes the correct month and year in the URL. Only the Dashboard's deep-link handler needs to consume them.

