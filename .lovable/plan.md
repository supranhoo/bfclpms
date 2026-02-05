
# Plan: Complete Import PMS Data Template with All Supported Columns

## ✅ COMPLETED

All missing columns have been added to the Import PMS Data template and documented.

---

## Changes Made

### 1. Updated Template Download Function ✅

Added missing columns to `downloadTemplate()` in `src/pages/admin/ImportData.tsx`:
- `division`, `businessUnit`, `department`, `subBranch` - Organization structure
- `isOrgLevel` - Mark KPIs as organization-level (centrally managed)
- `frequencyCycleStart` - For Yearly KPIs: 'Jan-Dec', 'Jul-Jun', 'Apr-Mar'

### 2. Updated KpiImportRow Interface ✅

Added new fields:
- `frequencyCycleStart?: string`
- `isOrgLevel?: boolean | string`

### 3. Updated normalizeKpiRow Function ✅

Added parsing for:
- `isOrgLevel` - accepts: 'isOrgLevel', 'is_org_level', 'orgLevel', 'org_level'
- `frequencyCycleStart` - accepts: 'frequencyCycleStart', 'frequency_cycle_start', 'cycleStart', 'cycle_start'

### 4. Updated UI Help Text ✅

Added documentation sections:
- Organization structure columns (now includes `subBranch`)
- Special flags section for `isOrgLevel` and `frequencyCycleStart`
- Expanded optional columns with reviewer achieved values

### 5. Updated DOCUMENTATION.md ✅

Added complete "Import Columns Reference" section with all 41 columns organized by category.

---

## Template After Fix

The download template now includes:

| Category | Columns |
|----------|---------|
| **Identification** | sNo, newCode, fullName, month |
| **KPI Definition** | category, kra, kpi, target, uom, uomType, qualitativeOptions, frequency, frequencyCycleStart |
| **Scoring** | kpiWeightage, criteria, r5, r4, r3, r2, r1, r0 |
| **Organization** | division, businessUnit, department, subBranch |
| **Review Data** | targetAchieved, rating, employeeTargetAchieved, employeeRating, employeeRemarks, managerTargetAchieved, managerRating, managerRemarks, auditTargetAchieved, auditRating, auditRemarks, achievedWeight |
| **Metadata** | sourceOfData, kpiStatus, reviewStatus, isOrgLevel |

**Total: 41 columns** (up from 33 previously)

---

## Validation Complete

- [x] Download template includes all 41 columns
- [x] Organization structure columns work with auto-creation
- [x] `isOrgLevel` flag parsing added to normalizeKpiRow
- [x] `frequencyCycleStart` parsing added to normalizeKpiRow
- [x] UI help text documents all column categories
- [x] DOCUMENTATION.md has complete import reference
