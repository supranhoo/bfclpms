

User wants multi-select + "Select All" capability on ALL dropdowns in Incentive Config across all incentive plans. Image shows Employee Mapping filters (Division, BU, Department, Designation, Grade) currently single-select dropdowns.

Let me scope what "all dropdowns in incentive config" covers.
<lov-tool-use id="toolu_vrtx_012ZMdkK9hDxQVPfoKeWcM1J" name="code--search_files" integration-id="code" data="{\"query\": \"incentive\", \"include_patterns\": \"src/pages/**/*.tsx,src/components/incentive/**/*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_018K79x97G3gb7EhjgUadiBc" name="code--list_dir" integration-id="code" data="{\"dir_path\": \"src/components/incentive\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_013ApkNYeSxiiy7sY6SMBRvz" name="code--list_dir" integration-id="code" data="{\"dir_path\": \"src/components/incentive\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_016PqnEChi3Wag11K6sNkwvP" name="code--search_files" integration-id="code" data="{\"query\": \"Employee Mapping|All Divisions|All BUs|All Departments\", \"include_patterns\": \"src/**/*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_019mGXhGjH9qR4krGjv2BGxH" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/incentive/ProgramEmployeeMapping.tsx\"}">
</lov-tool-use>
<lov-plan>

## Plan: Multi-Select + "Select All" for Incentive Mapping Filter Dropdowns

### Scope
The screenshot shows `ProgramEmployeeMapping.tsx` (the only multi-dropdown filter bar in the incentive config). Currently each filter (Division, BU, Department, Designation, Grade — plus Company) is a single-select Radix `Select` with one "All X" option. User wants each to support **multi-select with "Select All" / clear**.

### Approach

Replace each single-select `<Select>` in the filter row (lines 244–278) with a reusable **`MultiSelectFilter`** popover component:

- Trigger button shows: `"All <Label>"` when empty, `"<value>"` when 1 chosen, `"<n> selected"` when many.
- Popover content: search box + "Select All" / "Clear" toggle + scrollable checkbox list.
- State changes from `string` → `string[]` for: `filterDivision`, `filterBU`, `filterDept`, `filterDesig`, `filterGrade`. Empty array `[]` = no filter (equivalent to current "all").
- Filter logic at lines 137–141 changes from `=== value` to `arr.length === 0 || arr.includes(emp.field)`.
- `clearFilters()` resets each to `[]`.
- `hasFilters` checks for non-empty arrays.

**Company filter** is shared via `CompanyFilter` (used elsewhere in reporting). Leaving it single-select to avoid cross-cutting regressions in reports — if user wants multi-company too, that's a separate task. Will note in plan.

### New Component
`src/components/ui/multi-select-filter.tsx` — generic, reusable (Popover + Command + Checkbox primitives already in project). Will also benefit other dropdowns later if reused.

### Files Touched
| File | Change |
|------|--------|
| `src/components/ui/multi-select-filter.tsx` | NEW — reusable multi-select with search + select-all |
| `src/components/incentive/ProgramEmployeeMapping.tsx` | Replace 5 `<Select>` blocks with `<MultiSelectFilter>`; convert state to `string[]`; update filter & clear logic |
| `DOCUMENTATION.md` / `POLICY.md` | v2.65.x note: incentive mapping filters support multi-select |

### Risk & Impact
| Area | Impact |
|------|--------|
| Data | None — pure client-side filtering |
| Workflow | None — same enrolment behavior, just richer filter UI |
| RLS | None |
| Regression | Low — isolated to `ProgramEmployeeMapping`. Other incentive dropdowns (program type selector, slab category, etc.) are single-value semantic pickers, not list filters, so untouched |
| Mitigation | Empty array preserves current "show all" default; `Select All (N)` button in toolbar still works against the new multi-filter result |

### Out of Scope (confirm if needed)
- Company filter (shared component used in reports) — not converted
- Other incentive tabs' single-value pickers (Program Type, Slab Category) — these select one logical entity, multi-select doesn't apply

