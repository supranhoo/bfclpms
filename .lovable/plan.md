

# Enhance Employee Performance Summary Filters

## Current State
The report already has the correct columns (Month, Employee ID, Full Name, Department, Designation, Reporting Manager, Review Status, Total Score, Out of Score, %, Overall Rating) with weighted scoring and N/A exclusion matching the Dashboard.

## Changes Needed

### 1. Replace Period Dropdown with Static Month Filter
Currently the filter pulls from the `review_periods` database table. Replace with a simple static list of 12 calendar months (January through December) plus an "All Months" option.

### 2. Add Review Status Filter
Add a new dropdown filter that lets users filter by review status (e.g., show only "Approved" rows, or only "Manager Check" rows). The dropdown will be populated dynamically from the statuses present in the data, with an "All Status" default.

---

## Technical Details

### File: `src/pages/reports/EmployeePerformanceSummary.tsx`

**A. Add static month list constant (near line 17):**
```text
const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
```

**B. Add status filter state (near line 67):**
```text
const [selectedStatus, setSelectedStatus] = useState('all');
```

**C. Replace the period dropdown (lines 523-535):**
Replace the DB-based `reviewPeriods` dropdown with the static `FULL_MONTHS` list.

**D. Add status filter dropdown (after the month filter):**
A new `<Select>` with options: "All Status" plus each status from `STATUS_LABELS` (Approved, Manager Check, Audit, etc.).

**E. Update `filteredData` (lines 305-322):**
Add status filtering: if `selectedStatus !== 'all'`, filter rows where `row.status === selectedStatus`.

**F. Remove unused `reviewPeriods` query (lines 70-81):**
Since we no longer need DB-fetched periods, remove the `useQuery` for `review-periods`.

### File: `DOCUMENTATION.md`
Note the static month filter and status filter additions.

## No Scoring Changes
Total Score, Out of Score, %, and Overall Rating columns are already correct and match the Dashboard logic (weighted scoring, N/A exclusion, zero-value preservation). No changes needed there.

