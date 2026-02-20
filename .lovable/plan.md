

# Add "Mark as N/A" for Admins on Org KPI Data Entry

## Overview

Allow administrators to mark an Org KPI as "Not Applicable" directly from the Org KPI Data Entry page. When marked N/A and propagated, all linked employee review submissions will have `is_na = true` with scores nulled out -- matching the existing N/A behavior in the self-review and reviewer flows.

## Current Behavior

- Employees can mark individual KPIs as N/A during self-review
- Reviewers (Manager, Auditor, etc.) can mark or override N/A during their review stage
- There is no way for admins to mark an entire Org KPI as N/A from the data entry page
- The Org KPI propagation always pushes a numeric achieved value and calculated score

## Planned Changes

### 1. Add `is_na` field to `org_kpi_values` table (Database Migration)

Add a boolean column to track N/A status at the org KPI value level:

```sql
ALTER TABLE org_kpi_values ADD COLUMN is_na boolean NOT NULL DEFAULT false;
```

No new RLS policies needed -- existing policies cover all operations on this table.

### 2. Update `OrgKpiCardData` interface and card UI (`OrgKpiEntryCard.tsx`)

- Add `isNa: boolean` to `OrgKpiCardData`
- Add an N/A toggle (Switch component) visible only to admins, placed above the achieved value input
- When N/A is toggled ON:
  - Disable and hide the achieved value, remarks, and evidence inputs
  - Show a mandatory "Reason for N/A" textarea
  - Change the status badge to show "N/A" styling
- When N/A is toggled OFF: restore normal input fields
- The N/A state auto-saves like other fields and can be propagated via "Save and Propagate"

### 3. Update `onSave` / `onSaveAndPropagate` signatures

- Add `isNa?: boolean` and `naRemarks?: string` to the save value objects passed from the card to the page handlers

### 4. Update `OrgKpiDataEntry.tsx` page handlers

- `handleCardSave`: Include `is_na` in the bulk upsert payload to `org_kpi_values`
- `handleCardSaveAndPropagate`: When `isNa` is true, propagate with N/A semantics instead of numeric values
- `buildCardData`: Read `is_na` from `existingValuesMap` and pass it to the card

### 5. Update propagation logic (`usePropagateOrgKpiValue.ts`)

- Add optional `isNa?: boolean` to `PropagateParams`
- When `isNa` is true:
  - Set `achieved_value: null`, `self_score: null`, `self_rating: null`, `is_na: true`, `na_marked_by_role: 'admin'` on `review_submissions`
  - Still update KPI status from `kra_set` to `self_review`
- When `isNa` is false (default): existing behavior unchanged

### 6. Update `useOrgKpiValues.ts` types

- Add `is_na: boolean` to the `OrgKpiValue` interface

### 7. Update `DOCUMENTATION.md`

- Version bump to 1.45.42
- Document the N/A capability for Org KPI Data Entry

## UI Layout (Admin View)

```text
+-------------------------------------------+
| KPI Name                     [N/A Toggle]  |  <-- Admin only
| KRA: ...                                   |
|                                            |
| [When N/A is OFF - normal view]            |
| Achieved: [____]  Remark: [____]  [File]   |
|                                            |
| [When N/A is ON]                           |
| (!) This KPI is marked as Not Applicable   |
| Reason: [________________________] *       |
|                                            |
| [Audit] [Impact] [Save] [Save & Propagate] |
+-------------------------------------------+
```

## Propagation Behavior

| Scenario | Achieved Value | is_na | Scores | Status |
|---|---|---|---|---|
| Normal propagation | numeric value | false | Calculated | self_review |
| N/A propagation | null | true | null | self_review |
| N/A reversed later | numeric value | false | Recalculated | self_review |

## What Will NOT Change

- Self-review N/A flow (employee marks own KPI as N/A)
- Reviewer N/A override/confirmation flow
- Non-admin data owners will not see the N/A toggle
- Scoped (department/employee) entry tables -- N/A applies at the KPI level, not per-scope row

