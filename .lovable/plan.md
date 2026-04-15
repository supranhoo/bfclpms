

## Fix Terminal Month Banner Matching for Existing Multi-Month KPIs

### Root Cause
The terminal month lookup query (line 179 in `KpiJourneySection.tsx`) uses **exact `kpi_name` matching**:
```
.eq('kpi_name', kpi.kpi_name)
```

But the KPI names differ across the quarterly cycle:
- **Jan/Feb**: `"Introduction of new vendor."` (short)
- **March**: `"Introduction of new vendor. New vendor should have not been registered/empanelled..."` (long)

Since the exact name match fails, the query returns no terminal KPI, and the banner never renders for January/February.

### Solution
Relax the terminal month matching to use `kra_name + category_id + employee_id + frequency` instead of requiring exact `kpi_name`. Within the same KRA category for the same employee in the same quarter with the same frequency, there is a reliable 1:1 correspondence.

### Changes

**File: `src/components/review/KpiJourneySection.tsx`**
1. In the `terminalKpiData` query (lines 174-198), replace:
   ```
   .eq('kpi_name', kpi.kpi_name)
   ```
   with:
   ```
   .eq('frequency', kpi.frequency)
   ```
   Keep the existing `employee_id`, `kra_name`, `category_id`, `review_period`, `review_year` filters. This matches by KRA + category + frequency + terminal month — which uniquely identifies the sibling.

2. If the query returns **multiple** matches (edge case: multiple KPIs under same KRA), prefer the one whose `kpi_name` starts with the same prefix (first 30 chars) as the current KPI, falling back to the first result.

3. Update the `queryKey` to remove `kpi.kpi_name` and add `kpi.frequency` for correct cache keying.

**Files: `DOCUMENTATION.md`, `POLICY.md`** — Version bump

### Risk Assessment
- **Data impact**: None — read-only query change
- **Regression risk**: Low — the relaxed match could theoretically pick a wrong sibling if multiple KPIs share the same KRA + category + frequency, but the prefix tiebreaker handles this. The current exact match returns **nothing** for mismatched names, so this is strictly better.
- **Scope**: Fixes all existing multi-month KPIs where names were edited after rollover

