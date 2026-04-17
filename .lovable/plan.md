

Looking at the screenshot: the user is on **Incentive Data Entry** page (`/admin/incentive-data-entry`), Production Data tab. They want a **Company filter dropdown** added so admins in multi-company orgs can scope the program list (and downstream data entry) to a specific company.

Let me check existing patterns quickly.
<lov-tool-use id="toolu_vrtx_017qxtCdMEp6Hevq6XTNDPU6" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/incentive/UnifiedProductionDataTab.tsx\", \"lines\": \"1-80\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01PmyxvYmo1uB1RVCyAEdyoQ" name="code--search_files" integration-id="code" data="{\"query\": \"useCompanyFilter\", \"include_patterns\": \"*.ts,*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Gwk3spGneAU9Go8J8aYPok" name="code--search_files" integration-id="code" data="{\"query\": \"company_id\", \"include_patterns\": \"src/hooks/useIncentivePrograms*\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01BnVUvmyi44PjU3kFUXGQvC" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/incentive/UnifiedProductionDataTab.tsx\", \"lines\": \"1-100\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01XRj5zzvUwFpH41WdkBPmJk" name="code--search_files" integration-id="code" data="{\"query\": \"useCompanyFilter\", \"include_patterns\": \"*.tsx,*.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01E7kSKj4rKw2AEy4VMRjqRe" name="code--view" integration-id="code" data="{\"file_path\": \"src/hooks/useCompanyFilter.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Y1vUMmr6jztbJLrSS6nnMy" name="code--search_files" integration-id="code" data="{\"query\": \"company_id|company_name\", \"include_patterns\": \"src/hooks/useIncentivePrograms.ts,src/components/incentive/UnifiedProductionDataTab.tsx,src/components/incentive/ProductionTargetGrid.tsx,src/components/incentive/VesselDataEntryGrid.tsx,src/components/incentive/ProductionDailyGrid.tsx\"}">
</lov-tool-use>
I have enough context. The screenshot shows the Production Data tab with a Program selector. The user wants to add a Company filter alongside it. The tab itself doesn't display employees — but the underlying grids (VesselDataEntryGrid, ProductionDailyGrid, ProductionTargetGrid) do show production data which may be tied to programs (not employees directly). However, eligibility data tab DOES show employees — likely the user means scoping which programs/employees show up.

Let me check briefly what the grids contain re employees to scope correctly.
<lov-tool-use id="toolu_vrtx_01Fdp8i92maiYDTZfddfZkh5" name="code--search_files" integration-id="code" data="{\"include_patterns\": \"src/components/incentive/ProductionTargetGrid.tsx,src/components/incentive/VesselDataEntryGrid.tsx,src/components/incentive/ProductionDailyGrid.tsx\", \"query\": \"employee|profile\"}">
</lov-tool-use>
Good — the grids are employee-driven. A Company filter would make sense to scope rows in those grids. Let me also check ProductionTargetGrid quickly.
<lov-tool-use id="toolu_vrtx_01DNQc9prLA2ewo8WgDAcS2q" name="code--search_files" integration-id="code" data="{\"include_patterns\": \"src/components/incentive/ProductionTargetGrid.tsx\", \"query\": \"employee|profile\"}">
</lov-tool-use>
ProductionTargetGrid is org-level (no employees) — company filter doesn't apply. Vessel & Daily grids have employees.

<lov-plan>

## Plan: Company Filter on Incentive Data Entry

### Scope
Add a Company dropdown filter on the **Incentive Data Entry** page so admins can scope visible employees per company. Applies to both tabs.

### Where the filter applies

| Sub-tab / Grid | Has employees? | Filter applied |
|---|---|---|
| Production Data → VesselDataEntryGrid | Yes | Yes — filters vessel rate rows |
| Production Data → ProductionDailyGrid | Yes | Yes — filters mapped employees |
| Production Data → ProductionTargetGrid | No (org-level) | N/A — filter hidden/disabled |
| Eligibility Data tab | Yes | Yes — filters mapped employees |

### UI Mock

```text
┌─ Incentive Data Entry ─────────────────────────────────────────────┐
│  Enter production data and employee eligibility data ...           │
│                                                                    │
│  [ Production Data ] [ Eligibility Data ]                          │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ [Metal Sizing ▾]  [🏢 All Companies ▾]  [⬇ Download Excel] │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Metal Sizing  [April ▾] [2026 ▾]  Full Month  1-10  11-20  21-31  │
│  ...grid filtered by selected company...                           │
└────────────────────────────────────────────────────────────────────┘
```

For Eligibility tab, filter sits next to the existing Month / Year / Program selectors:

```text
[January ▾] [2026 ▾] [Port Incentive ▾] [🏢 All Companies ▾] [Search...]
```

Filter auto-hides if user has access to only 1 company (existing `CompanyFilter` behaviour).

### Changes

**1. `UnifiedProductionDataTab.tsx`**
- Use `useCompanyFilter()` hook.
- Render `<CompanyFilter />` next to Program selector in the header card.
- Pass `selectedCompanyId` + `filterByCompany` down to `VesselDataEntryGrid` and `ProductionDailyGrid` as props.

**2. `VesselDataEntryGrid.tsx`**
- Accept `filterByCompany?: (empId: string) => boolean` prop.
- Filter `vesselRates` rows whose `r.employee_id` doesn't match.

**3. `ProductionDailyGrid.tsx`**
- Accept same `filterByCompany` prop.
- Filter `mappedEmployees` after fetch.

**4. `EligibilityDataEntry.tsx`**
- Add `useCompanyFilter()` + `<CompanyFilter />` in toolbar row.
- Filter `mergedData` employees by `filterByCompany(emp.id)`.

**5. `ProductionTargetGrid.tsx`** — no change (no employee dimension).

### Files Touched

| File | Change |
|---|---|
| `src/components/incentive/UnifiedProductionDataTab.tsx` | Add CompanyFilter in header, pass down filter |
| `src/components/incentive/VesselDataEntryGrid.tsx` | Filter rows by company |
| `src/components/incentive/ProductionDailyGrid.tsx` | Filter mapped employees by company |
| `src/components/incentive/EligibilityDataEntry.tsx` | Add CompanyFilter, filter merged data |

### Risk & Impact

| Area | Impact |
|---|---|
| Data | None — pure client-side filter, reuses `useCompanyFilter` |
| Workflow | None — additive, defaults to "All Companies" |
| Regression | Low — wrapping filter in existing render lists |
| Mitigation | When `selectedCompanyId === 'all'` filter passes everyone (existing behaviour) |

### Out of Scope
- Compute engine company-scoping (engine still computes per program for all mapped employees regardless of UI filter)
- Excel export company filter (separate enhancement if needed)

