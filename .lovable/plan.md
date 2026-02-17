

# Fix: Allow Employee to Edit Self-Review While at "Self Review" Status

## Problem

When Dippendu clicks on a KPI at "Self Review" status, the panel opens but shows as **read-only** with a "View KPI Details" header. He cannot modify his submitted values even though the manager has not yet reviewed the KPI.

## Root Cause

In `SelfReviewSheet.tsx` (line 445):
```
const isReadOnly = !isKraSet;   // isKraSet = status === 'kra_set'
```

This means **any** status other than `kra_set` makes the sheet read-only, including `self_review`. The employee loses all ability to edit once they click "Submit."

## Fix

Allow editing when the KPI status is either `kra_set` OR `self_review`. Once it moves to `manager_check` or beyond, it correctly becomes read-only.

### File: `src/components/review/SelfReviewSheet.tsx`

**Change 1 (line 445):** Update the `isReadOnly` logic:

```
// Before
const isReadOnly = !isKraSet;

// After
const isSelfReview = selectedKpi?.status === 'self_review';
const isReadOnly = !isKraSet && !isSelfReview;
```

**Change 2 (header label):** Update the title logic (line 456) so it shows "Edit Self Review" when resubmitting at `self_review` status instead of "View KPI Details":

```
// Before
{isReadOnly ? 'View KPI Details' : 'Submit Self Review'}

// After  
{isReadOnly ? 'View KPI Details' : (isSelfReview ? 'Edit Self Review' : 'Submit Self Review')}
```

**Change 3 (button label):** Update the submit button text in the footer (around line 773+) to say "Update" or "Re-submit" when at `self_review` status, distinguishing it from the initial submission.

### File: `DOCUMENTATION.md`

Document that employees can edit their self-review as long as the KPI is still at `self_review` status (before the manager picks it up).

## What This Enables

| KPI Status | Before (Broken) | After (Fixed) |
|---|---|---|
| `kra_set` | Editable | Editable (no change) |
| `self_review` | Read-only | Editable (can re-submit) |
| `manager_check` | Read-only | Read-only (no change) |
| `audit` and beyond | Read-only | Read-only (no change) |

## Backend Impact

None. The `useSubmitSelfReview` hook already uses `upsert` with `onConflict: 'kpi_id'` and sets the status to `self_review` -- it already handles re-submissions correctly at the database level.

## Files to Change

| File | Change |
|---|---|
| `src/components/review/SelfReviewSheet.tsx` | Update `isReadOnly` to allow editing at `self_review`; update header and button labels |
| `DOCUMENTATION.md` | Document self-review edit capability |

