

## Show Employee Name in KPI Details Header

### Change — `src/components/review/KpiHeaderSection.tsx`

Add the employee's name to the left of the existing "Reporting Manager" line (line 139-143). The data is already fetched in `employeeProfile` (line 48-73), so no new queries needed.

**Current** (line 139-143):
```
👤 Reporting Manager: Anil Kumar Pathak
```

**After**:
```
👤 Employee: John Doe  |  👤 Reporting Manager: Anil Kumar Pathak
```

Replace the reporting manager block with a row showing both employee name and manager name, right-aligned. Employee name shows always (when available), manager name shows when available.

### Risk Assessment
- **Data Impact**: None — uses already-fetched `employeeProfile.full_name`
- **Workflow Impact**: None — display-only change
- **Regression Risk**: Zero — modifying a single display line

### Files Changed
1. **`src/components/review/KpiHeaderSection.tsx`** — Add employee name display next to reporting manager

