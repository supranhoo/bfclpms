

# Fix: Dashboard Inflated Counts from Non-Issued KPIs (v1.45.93)

## Root Cause Found

The Bottleneck Report data is **correct**. The **Dashboard** is the source of the inaccurate numbers.

The database contains **674 non-issued KPIs** (is_issued = false) for January 2026 that have workflow statuses like `self_review` (366), `manager_check` (303), etc., even though they were never actually issued to employees. These are template/draft KPIs.

The Dashboard's `EmployeeSelectorGrid` uses `useKpisByPeriodRanges` which fetches ALL KPIs without filtering `is_issued`. When the Audit Panel computes "Pending Audit", it counts these non-issued KPIs, inflating the number from the correct ~110 to the displayed 250.

The Bottleneck Report correctly filters `is_issued !== false`, which is why its numbers are lower and accurate.

## Database Evidence (January 2026, Non-Approved)

```text
Status           | Issued (true) | Non-Issued (false) | Ghost count
-----------------+---------------+--------------------+------------
kra_set          |            66 |                181 |        181
self_review      |            53 |                366 |        366
manager_check    |            86 |                303 |        303
hr_pms_review    |           110 |                  4 |          4
management_review|             0 |                 27 |         27
```

Total non-issued phantom KPIs: **881**. These inflate every stat card across all Dashboard panels (Team, Audit, HR PMS, Management).

## Solution

Add `is_issued` filtering to the Dashboard's KPI data pipeline so non-issued KPIs are excluded from all reviewer panel stats and employee cards.

## Technical Changes

### 1. `src/components/review/EmployeeSelectorGrid.tsx`

Filter `periodKpis` to exclude non-issued KPIs before using them for stats and employee filtering:

```typescript
// After line 148: const { data: periodKpis } = useKpisByPeriodRanges(...)
const issuedPeriodKpis = useMemo(() => {
  return periodKpis?.filter(k => (k as any).is_issued !== false) || [];
}, [periodKpis]);
```

Then replace all references to `periodKpis` in stats calculations, employee badge counts, and filtering logic with `issuedPeriodKpis`.

This affects:
- The `stats` useMemo (line ~340) that computes summary card values
- The `getEmployeeKpiStats` function (line ~418) that computes per-employee badges
- The `relevantKpis` variable derived from `periodKpis`

### 2. `src/components/review/AuditScorecard.tsx`

The AuditScorecard also counts pending/in-audit using `kpis` from `useKpisByEmployee` which does NOT filter `is_issued`. Add the same filter:

```typescript
// After filtering by period/year (line ~98)
const kpis = useMemo(() => allKpis?.filter(k => {
  const periodMatch = ...;
  const yearMatch = ...;
  return periodMatch && yearMatch && (k as any).is_issued !== false;
}), [allKpis, selectedPeriod, selectedYear]);
```

### 3. Similar fix needed in `UnifiedScorecard.tsx` and `ManagementScorecard.tsx`

All scorecard components that compute stats from KPI lists must exclude non-issued KPIs.

### 4. `DOCUMENTATION.md`

Bump to v1.45.94 and document the `is_issued` filtering requirement as a global data contract: "All reviewer panels and reports MUST filter `is_issued !== false` to exclude draft/template KPIs from workflow statistics."

## Impact After Fix

- Dashboard "Pending Audit" for Jan will drop from 250 to ~110 (only genuinely issued KPIs at hr_pms_review)
- All panel stats (Team, HR PMS, Audit, Management) will show accurate counts
- Bottleneck Report numbers will now **match** the Dashboard
- Total Pending across all panels will decrease significantly

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data accuracy | Improves -- removes phantom counts | Numbers will match bottleneck report |
| User expectation | Medium -- all dashboard stats will decrease | Numbers will now be accurate; explain change |
| Regression | Low -- additive filter only | Non-issued KPIs were never actionable anyway |
| Performance | None -- client-side filter on already-fetched data | No additional queries |

