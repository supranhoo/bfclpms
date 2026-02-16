

# Post-Propagation Edit Lock for Data Owners

## Problem
Currently, after a data owner clicks "Save & Propagate", the values are pushed to employee scorecards but the org KPI entry card remains fully editable. There is no lock preventing further edits, and no confirmation before propagation. Additionally, the propagation does not actually set the `status` column to `'propagated'` on the `org_kpi_values` row, so the "Propagated" badge never appears.

## Solution

### 1. Fix: Actually set status to 'propagated' after propagation
Currently, `usePropagateOrgKpiValue` updates `review_submissions` but never updates the `org_kpi_values.status` column. We need to add a status update after successful propagation.

### 2. Lock editing after propagation for data owners
Once a KPI's status is `'propagated'`, data owners (non-admin users) will see:
- All input fields (achieved value, remarks, evidence) become disabled/read-only
- A lock indicator with message: "Locked after propagation. Contact admin to unlock."
- The "Save" and "Save & Propagate" buttons become disabled

Admins will see an "Unlock" button that resets the status back to `'entered'`, allowing the data owner to edit and re-propagate.

### 3. Add confirmation dialog before propagation
Before propagating, show an AlertDialog confirming: "This will update scores for X employee scorecards. The entry will be locked for editing afterward. Continue?"

## Changes

### File: `src/hooks/usePropagateOrgKpiValue.ts`
- After successful propagation, update the corresponding `org_kpi_values` row(s) to set `status = 'propagated'`
- Invalidate `org-kpi-values` query cache so the UI reflects the new status

### File: `src/components/admin/OrgKpiEntryCard.tsx`
- Accept new props: `isAdmin` (boolean) and `onUnlock` (callback)
- When `data.status === 'propagated'` and `!isAdmin`: disable all inputs, hide Save/Propagate buttons, show a lock banner
- When `data.status === 'propagated'` and `isAdmin`: show an "Unlock for Editing" button that calls `onUnlock`
- Wrap the "Save & Propagate" button with an AlertDialog confirmation showing the employee count that will be affected

### File: `src/pages/admin/OrgKpiDataEntry.tsx`
- Pass `isAdmin` prop to each `OrgKpiEntryCard`
- Add an `onUnlock` handler that updates the `org_kpi_values.status` back to `'entered'` and logs an audit entry
- Pass `onUnlock` to each card

### File: `DOCUMENTATION.md`
- Document the post-propagation locking behavior and admin unlock capability

## Technical Details

| File | Change |
|---|---|
| `src/hooks/usePropagateOrgKpiValue.ts` | Add `org_kpi_values` status update to `'propagated'` after successful propagation |
| `src/components/admin/OrgKpiEntryCard.tsx` | Add locked state UI, admin unlock button, and propagation confirmation dialog |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Pass `isAdmin` and `onUnlock` to cards; implement unlock handler |
| `DOCUMENTATION.md` | Document locking behavior |

## User Experience Flow

```text
Data Owner saves & propagates
       |
       v
Confirmation dialog: "Update X employee scorecards? Entry will be locked."
       |
   [Confirm]
       |
       v
Values propagated --> status set to 'propagated' --> inputs locked
       |
       v
Data Owner sees: "Locked after propagation" banner, read-only fields
       |
       v
Admin clicks "Unlock for Editing" --> status reset to 'entered' --> inputs enabled again
```

