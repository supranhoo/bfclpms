

## Add "Org KPI" Column to KPI Journey Report

### Changes

**1. `src/hooks/useKpiJourneyReport.ts`**
- Add `isOrgKpi: boolean` to the `KpiJourneyRow` interface
- Include `is_org_level` in the KPI select query (line 66)
- Set `isOrgKpi: !!kpi.is_org_level` in the row mapping (line 155)

**2. `src/pages/reports/KpiJourneyReport.tsx`**
- Add a "Type" column header after "KPI" in the table
- Render a badge: "Org" (purple) or "Individual" (gray) based on `row.isOrgKpi`
- Add `isOrgKpi` filter dropdown (All / Org KPI / Individual) alongside existing filters
- Include the "Type" field in the Excel export

