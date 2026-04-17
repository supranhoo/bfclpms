

## Plan: Multi-Select Company Filter on Incentive Report

### Goal
Add a company filter to the Incentive Report toolbar (next to Programme/Period/Status etc.) that supports multi-select + "All Companies" selection, scoping both the displayed rows and the Export.

### Approach

**File: `src/components/incentive/MonthlyIncentiveTable.tsx`** (the toolbar shown in the screenshot)
- Use existing `useCompanyFilter()` hook to get the company list + employee→company map.
- Add local state `const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([])` (empty = All).
- Render the existing `MultiSelectFilter` component between **Programme** and **Period** filters:
  ```tsx
  <MultiSelectFilter
    options={companies.map(c => c.name)}
    value={selectedCompanyNames}
    onChange={...}
    placeholder="All Companies"
    label="Company"
    className="w-[180px] h-9"
  />
  ```
  (Map name↔id internally so the dropdown stays user-friendly while filtering by id.)
- Filter the computed/queried rows: keep a row when `selectedCompanyIds.length === 0` OR the row's resolved `company_id` (from `employeeCompanyMap.get(row.employee_id)`) is in the set.
- Pass the filtered set into the existing Export handler so Excel honors the same scope.

**File: `src/components/incentive/RetroactiveAdjustmentTable.tsx`** (parity — same toolbar pattern)
- Same multi-select company filter added to its toolbar so both tabs behave consistently.

### Why Multi-Select (not single)
The existing `CompanyFilter` is single-select only. Per request we need both "select many" and "select all", which `MultiSelectFilter` already provides (built-in Select All / Deselect All, badge count, search).

### UI Placement
```
[Month] [Year] [Company ▾] [Programme] [Period] [Status] [Eligibility] [Incentive Status] [Search]
```
Width matches sibling selects (`w-[180px] h-9`).

### Files Touched
| File | Change |
|---|---|
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Add multi-select Company filter + row filtering + export scope |
| `src/components/incentive/RetroactiveAdjustmentTable.tsx` | Same filter for parity |

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None — client-side filter on already-fetched rows |
| Workflow | None |
| UI/UX | Consistent with other reports already using `MultiSelectFilter` |
| Regression | Very low — purely additive filter; default (empty) = current behaviour |
| Mitigation | Empty selection preserves "All Companies" default |

### Out of Scope
- Server-side company filtering at SQL level (current rowset is small enough for client filter; revisit if perf issues)
- Persisting selection across sessions

