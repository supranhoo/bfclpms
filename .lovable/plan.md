

# Org KPI Rating Override Warning for Reviewers

## Overview

When an Organization KPI's value and rating have been propagated by a Data Owner, any subsequent reviewer (Manager, Auditor, Skip-Level, HR PMS, or Management) who changes the propagated rating should see a **warning confirmation dialog** before their change is saved. This ensures reviewers are consciously aware they are overriding a centrally-entered, data-owner-vetted score.

## How It Works

1. When a reviewer opens a KPI review panel for an Org-level KPI, the system already knows the propagated score (from `review_submissions.self_score` and the `orgKpiValuesMap` which tracks `entered_by_name`).
2. When the reviewer selects a score that **differs** from the propagated/previous-level score, a warning **AlertDialog** appears before submission.
3. The dialog displays:
   - The KPI name
   - The original propagated rating (e.g., "R4 - Very Good") and who entered it (data owner name)
   - The new rating the reviewer is selecting
   - A mandatory remarks field (reason for override) if one isn't already filled
   - "Proceed" and "Cancel" buttons
4. If the reviewer confirms, the save proceeds normally. If they cancel, the score reverts to the previous value.

## Technical Plan

### 1. New Component: `OrgKpiRatingOverrideWarning.tsx`

Create `src/components/review/OrgKpiRatingOverrideWarning.tsx` -- a reusable AlertDialog component.

**Props:**
- `open: boolean`
- `onConfirm: () => void`
- `onCancel: () => void`
- `kpiName: string`
- `originalScore: number`
- `originalEnteredBy: string | null`
- `newScore: number`

**Renders:**
- An AlertDialog with a warning icon and amber/orange styling
- Shows: "You are changing the rating from R{original} to R{new} for an Organization KPI originally entered by {dataOwnerName}."
- Confirm button: "Proceed with Override"
- Cancel button: "Keep Original Rating"

### 2. Integration into `UnifiedScorecard.tsx`

- Add state: `orgOverrideWarningOpen`, `pendingSubmitArgs`
- In the submit handler, before calling `submitReview.mutate()`:
  - Check if `selectedKpi?.is_org_level === true`
  - Check if the reviewer's score differs from the previous-level score (e.g., `self_score` for manager, `manager_score` for auditor, etc.)
  - If both conditions are true, show the warning dialog instead of immediately submitting
  - On confirm, proceed with `submitReview.mutate(pendingSubmitArgs)`
  - On cancel, close dialog and do nothing

### 3. Integration into `ManagementScorecard.tsx` and `AuditScorecard.tsx`

Apply the same pattern: intercept the save/approve action, check for org-level + score change, and show the warning dialog.

### 4. Documentation Update

Bump version to **1.45.83** and document the new Org KPI rating override warning feature in `DOCUMENTATION.md`.

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/review/OrgKpiRatingOverrideWarning.tsx` | **Create** -- new AlertDialog component |
| `src/components/review/UnifiedScorecard.tsx` | **Modify** -- add override detection + dialog trigger |
| `src/components/review/ManagementScorecard.tsx` | **Modify** -- add override detection + dialog trigger |
| `src/components/review/AuditScorecard.tsx` | **Modify** -- add override detection + dialog trigger |
| `DOCUMENTATION.md` | **Modify** -- version bump + feature documentation |

## Risk Assessment

| Aspect | Detail |
|--------|--------|
| Data impact | None -- this is purely a UI-side warning; no schema changes |
| Workflow impact | None -- does not alter the approval flow, only adds a confirmation step |
| Regression risk | Low -- the warning is gated behind `is_org_level === true` and score mismatch checks |
| UI/UX consistency | Uses existing AlertDialog pattern already used for propagation confirmations |

