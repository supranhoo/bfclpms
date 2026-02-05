

# Plan: Complete Import PMS Data Template with All Supported Columns

## Summary

The **Import PMS Data** template download is missing several important columns that are actually supported by the system. This plan addresses the gaps to ensure users have a complete template.

---

## Current State

| Category | Template Columns | Missing Columns |
|----------|-----------------|-----------------|
| **Core Fields** | All present ✅ | None |
| **Rating Thresholds** | All present ✅ | None |
| **Review Data** | All present ✅ | None |
| **Organization Structure** | ❌ Missing | `division`, `businessUnit`, `department`, `subBranch` |
| **Special Flags** | ❌ Missing | `isOrgLevel`, `frequencyCycleStart` |

---

## Changes Required

### 1. Update Template Download Function

Add the missing columns to the `downloadTemplate()` function in `src/pages/admin/ImportData.tsx`:

```typescript
// Add to template object:
division: 'Operations',           // NEW
businessUnit: 'Plant',            // NEW
department: 'Manufacturing',      // NEW
subBranch: '',                    // NEW
isOrgLevel: '',                   // NEW - 'yes'/'true' for org-level KPIs
frequencyCycleStart: '',          // NEW - For yearly: 'Jan-Dec', 'Jul-Jun', 'Apr-Mar'
```

### 2. Update UI Documentation

Add the missing columns to the help text displayed under the import card (lines 1899-1941):

**Organization Structure section** - Already documented but add `subBranch`:
- `subBranch` - Sub-branch name (optional)

**Add new section** for special flags:
- `isOrgLevel` - Mark as 'yes' or 'true' for organization-level KPIs (centrally managed)
- `frequencyCycleStart` - For Yearly KPIs: 'Jan-Dec', 'Jul-Jun', or 'Apr-Mar'

**Expand Optional columns section** with reviewer achieved values:
- `managerTargetAchieved`, `auditTargetAchieved` - Reviewer override values

### 3. Update DOCUMENTATION.md

Add an "Import Columns Reference" section documenting all 40+ supported columns.

---

## File Changes

| File | Change |
|------|--------|
| `src/pages/admin/ImportData.tsx` | Add missing columns to template + update UI help text |
| `DOCUMENTATION.md` | Add import columns reference section |

---

## Template After Fix

The download template will include these complete column groups:

**Identification (4 columns):**
- `sNo`, `newCode`, `fullName`, `month`

**KPI Definition (9 columns):**
- `category`, `kra`, `kpi`, `target`, `uom`, `uomType`, `qualitativeOptions`, `frequency`, `frequencyCycleStart`

**Scoring (8 columns):**
- `kpiWeightage`, `criteria`, `r5`, `r4`, `r3`, `r2`, `r1`, `r0`

**Organization (4 columns):**
- `division`, `businessUnit`, `department`, `subBranch`

**Review Data (12 columns):**
- `targetAchieved`, `rating`, `employeeTargetAchieved`, `employeeRating`, `employeeRemarks`
- `managerTargetAchieved`, `managerRating`, `managerRemarks`
- `auditTargetAchieved`, `auditRating`, `auditRemarks`

**Metadata (4 columns):**
- `sourceOfData`, `kpiStatus`, `reviewStatus`, `isOrgLevel`

**Total: 41 columns** (up from 33 currently)

---

## Technical Details

### ImportData.tsx Changes

**Template object update (lines 1231-1350):**

```typescript
const template = [
  {
    sNo: 1,
    month: 'Dec-25',
    reviewStatus: 'Pending',
    newCode: '100001',
    fullName: 'John Doe',
    // Organization structure
    division: 'Operations',        // NEW
    businessUnit: 'Plant',         // NEW
    department: 'Manufacturing',   // NEW
    subBranch: '',                 // NEW
    // KPI definition
    category: 'Financial Performance',
    kra: 'Revenue Growth',
    kpi: 'Monthly Revenue Target',
    uom: '%',
    uomType: 'numeric',
    qualitativeOptions: '',
    frequency: 'Monthly',
    frequencyCycleStart: '',       // NEW
    kpiWeightage: 25,
    criteria: 'Higher is Better',
    target: '100',
    r5: '120',
    r4: '110',
    r3: '100',
    r2: '90',
    r1: '80',
    r0: '',
    // Review data
    targetAchieved: '',
    achievedWeight: '',
    rating: '',
    kpiWeightageScore: '',
    employeeTargetAchieved: '',
    employeeRating: '',
    employeeRemarks: '',
    managerTargetAchieved: '',     // Already exists
    managerRating: '',              // Already exists
    managerRemarks: '',
    auditTargetAchieved: '',        // Already exists
    auditRating: '',                // Already exists
    auditRemarks: '',
    // Metadata
    sourceOfData: 'SAP',
    kpiStatus: 'Active',
    isOrgLevel: '',                // NEW
  },
  // ... additional sample rows
];
```

**UI documentation update (lines 1922-1934):**

```typescript
<p className="font-medium mt-4 mb-2">Organization structure columns (auto-created if missing):</p>
<ul className="list-disc list-inside space-y-1">
  <li><code>division</code> - Division name</li>
  <li><code>businessUnit</code> - Business Unit name</li>
  <li><code>department</code> - Department name</li>
  <li><code>subBranch</code> - Sub-branch name (optional)</li>
</ul>

<p className="font-medium mt-4 mb-2">Special flags:</p>
<ul className="list-disc list-inside space-y-1">
  <li><code>isOrgLevel</code> - Set to 'yes' or 'true' for organization-level KPIs</li>
  <li><code>frequencyCycleStart</code> - For Yearly KPIs: 'Jan-Dec', 'Jul-Jun', or 'Apr-Mar'</li>
</ul>
```

---

## Validation Checklist

After implementation:
- [ ] Download template includes all 41 columns
- [ ] Organization structure columns work with auto-creation
- [ ] `isOrgLevel` flag correctly marks KPIs as org-level
- [ ] `frequencyCycleStart` works for yearly KPIs
- [ ] UI help text documents all columns
- [ ] DOCUMENTATION.md has complete import reference

