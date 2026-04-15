

## Convert Filter Dropdowns to Searchable Comboboxes

### Problem
The Department, Designation, Grade, Manager, and Status filter dropdowns in the review tabs use plain `Select` components with no type-ahead/search. With hundreds of departments and managers, users must scroll through long lists to find what they need.

### Current vs Target UI

```text
CURRENT (plain Select — no search):
┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
│ All Departments ▾│  │ All Designations▾│  │ All Grades  ▾│  │ All Managers    ▾│
└──────────────────┘  └──────────────────┘  └──────────────┘  └──────────────────┘
     ┌──────────────────┐
     │ ✓ All Departments│   ← No search box, must scroll
     │  1050 TPD-E And I│
     │  1050 TPD-Mech   │
     │  ...200 more...  │
     └──────────────────┘

AFTER (searchable Combobox):
┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
│ All Departments ▾│  │ All Designations▾│  │ All Grades  ▾│  │ All Managers    ▾│
└──────────────────┘  └──────────────────┘  └──────────────┘  └──────────────────┘
     ┌──────────────────┐
     │ 🔍 Search...     │   ← Type to filter
     │ ✓ — None —       │
     │  1050 TPD-Mech   │   ← Only matching items shown
     └──────────────────┘
```

### Solution
Replace all 5 `Select` dropdowns in **`EmployeeFilters.tsx`** with the existing `OrgFilterCombobox` component (single-select mode). This component already supports search, keyboard navigation, and a "None" clear option.

### Changes

**File: `src/components/review/EmployeeFilters.tsx`**
1. Replace `Select` import with `OrgFilterCombobox` import
2. Convert each filter dropdown:
   - **Department**: `options` from `departments.map(d => ({ value: d.id, label: d.name }))`, value/onChange mapped to existing props
   - **Designation**: `options` from `designations.map(d => ({ value: d, label: d }))`
   - **Grade**: `options` from `grades.map(g => ({ value: g, label: g }))`
   - **Manager**: `options` from `managers.map(m => ({ value: m.id, label: m.name }))`
   - **Status**: `options` from `statusOptions.map(s => ({ value: s.value, label: s.label }))`
3. Map `onValueChange` to emit `null` when empty string selected (the combobox "None" option returns `''`)
4. Keep the same responsive grid layout (`grid-cols-2 sm:flex`)

**No other files need changes** — `EmployeeFilters` is the shared component used by `EmployeeSelectorGrid`, which powers all tabs (Team Reviews, Self Review, Manager Review, Skip Mgr, HR PMS, Audit, Management).

**`DOCUMENTATION.md`** — Version bump
**`POLICY.md`** — Version bump

### Risk Assessment
- **Data impact**: None — UI-only change
- **Regression risk**: None — `OrgFilterCombobox` is already used elsewhere in the app (AccessProfilesManager)
- **UX improvement**: All filter dropdowns across all review tabs become searchable

