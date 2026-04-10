

## Add Company Filter to Employee Mapping

### What
Add a "Company" filter dropdown to the `ProgramEmployeeMapping` component, consistent with the existing company filter pattern used across reports. This lets users scope the employee list by company before mapping.

### Changes

**File: `src/components/incentive/ProgramEmployeeMapping.tsx`**

1. Import `useCompanyFilter` hook and `CompanyFilter` component
2. Add `company_name` to employee data by resolving via `useCompanyFilter.getCompanyName(emp.id)` or by joining `company_id` from profiles
3. Add a Company filter `<Select>` as the first filter in the grid (before Division)
4. Add a "Company" column to the table between the checkbox and Employee columns
5. Apply company filtering in the `filtered` useMemo — use `filterByCompany(emp.id)` from the hook
6. Add `company_name` to the `filterOptions` set for the dropdown
7. Update `SortKey` type to include `'company_name'`
8. Update `clearFilters` to reset company selection

**File: `DOCUMENTATION.md`**
- Record the addition of Company filter to Employee Mapping

### Technical Details
- Reuses existing `useCompanyFilter` hook (resolves employee→company via dept→BU→division→company chain)
- Reuses existing `CompanyFilter` component for consistent UI
- No database changes needed

