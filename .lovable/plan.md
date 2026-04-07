

## Enhance KPI Scorecard Detail Report

### What Changes
Add three new columns to the KPI Scorecard Detail report:
1. **Frequency** — the KPI's review frequency (Monthly, Quarterly, Bi-Monthly, etc.)
2. **Org KPI Type** — if the KPI is an Org KPI, show its scope (Organization / Department / Employee); otherwise show "Individual"
3. **Data Owner** — for Org KPIs, show the assigned data owner name(s); blank for individual KPIs

### Implementation

#### File: `src/pages/reports/KpiScorecardDetail.tsx`

**1. Expand `FlatRow` interface** — add `frequency`, `isOrgKpi`, `orgKpiScope`, `dataOwnerNames` fields.

**2. Update query** — add `frequency, is_org_level, org_level_scope` to the KPI select. Also fetch `org_kpi_data_owners` with joined profile names in a second query to build a lookup map keyed by `categoryId||kraName||kpiName`.

**3. Map rows** — populate the new fields from query results. For data owners, look up from the owner map using the KPI's category/kra/kpi key.

**4. Add table columns** — insert three new `TableHead` + `TableCell` entries after the "KPI" column:
- **Freq** — shows frequency badge (e.g., "Monthly", "Quarterly")
- **Type** — shows "Org (Organization)" / "Org (Department)" / "Org (Employee)" / "Individual" with color-coded badge
- **Data Owner** — shows owner name(s) or "—"

**5. Update export** — add "Frequency", "Type", and "Data Owner" columns to the Excel export `exportData` map.

**6. Update `colSpan`** — adjust the empty-state colSpan from 16 to 19.

### Files to Change

| File | Change |
|------|--------|
| `src/pages/reports/KpiScorecardDetail.tsx` | Add 3 new columns (Frequency, Org KPI Type, Data Owner) to interface, query, table, and export |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **No data changes**: Read-only report enhancement
- **No regression**: Additive columns only; existing columns unchanged
- **Performance**: One additional query for `org_kpi_data_owners` (small table); no impact on pagination

