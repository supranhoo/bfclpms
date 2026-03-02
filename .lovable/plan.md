

# Mandatory Remarks Per Review Level (Admin-Configurable)

## Overview
Add a configurable feature where remarks are mandatory at each review level before a reviewer can submit/approve a KPI. Management level is excluded by default. Admins can turn this on/off independently for each level via System Settings.

## Admin Configuration

New workflow settings (inserted into the `workflow_settings` table under a new **"validation"** category) with boolean toggles for each level:

| Setting Key | Label | Default |
|---|---|---|
| `remarks_mandatory_self` | Mandatory remarks for Self Review | `true` |
| `remarks_mandatory_manager` | Mandatory remarks for Manager Review | `true` |
| `remarks_mandatory_skip_level` | Mandatory remarks for Skip-Level Review | `true` |
| `remarks_mandatory_hr_pms` | Mandatory remarks for HR PMS Review | `true` |
| `remarks_mandatory_auditor` | Mandatory remarks for Auditor Review | `true` |
| `remarks_mandatory_management` | Mandatory remarks for Management Review | `false` |

These will appear as on/off switches in the existing **Validation Rules** card in System Settings (WorkflowSettingsTab).

## Enforcement Points

### 1. Self Review (`SelfReviewSheet.tsx`)
- Before `handleSubmitReview` submits, check if `remarks_mandatory_self` is enabled
- If enabled and `selfRemarks` is empty, show a toast error and block submission
- Add a red asterisk (*) next to the "Remarks" label when mandatory

### 2. Reviewer Levels (`UnifiedScorecard.tsx`)
- In the `handleSubmitForReview` function (around line 844-926), before calling `submitReview.mutate`:
  - Look up the setting for the current `viewLevel` (e.g., `remarks_mandatory_manager`)
  - If enabled and `reviewerRemarks` is empty, show toast error and block
- Add a red asterisk next to the Remarks label in both the regular KPI and daily binary remarks sections

### 3. Manager Review (`EmployeeScorecard.tsx`)
- Same pattern: check `remarks_mandatory_manager` before approval
- Block submission if remarks empty and setting is on

## Technical Plan

### Database Migration
Insert 6 new rows into `workflow_settings` table with category `'validation'` and boolean values.

### Hook Addition
Add a convenience hook `useRemarksMandatorySettings()` in `useWorkflowSettings.ts` that returns a map of `{ self: boolean, manager: boolean, skip_level: boolean, hr_pms: boolean, auditor: boolean, management: boolean }`.

### File Changes

| File | Change |
|---|---|
| `src/hooks/useWorkflowSettings.ts` | Add `useRemarksMandatorySettings()` convenience hook + defaults |
| `src/components/review/SelfReviewSheet.tsx` | Import hook, validate remarks before submit, add asterisk on label |
| `src/components/review/UnifiedScorecard.tsx` | Import hook, validate remarks in `handleSubmitForReview`, add asterisk on label |
| `src/components/review/EmployeeScorecard.tsx` | Import hook, validate remarks before manager approval, add asterisk on label |
| DB migration | Insert 6 setting rows into `workflow_settings` |

### UI Behavior
- When mandatory: Label shows "Manager Remarks *" with red asterisk
- Attempting to submit without remarks shows a toast: "Remarks are required for [Level] review"
- The submit/approve button remains clickable (no disable) -- validation happens on click with clear feedback

## Risk Assessment

| Aspect | Risk | Mitigation |
|---|---|---|
| Data Impact | None | Only inserts new setting rows; no schema changes |
| Regression | None | All validation is gated behind the new settings; defaults match current behavior for Management (off) |
| RLS | None | Uses existing `workflow_settings` policies (admin update, all read) |
| Workflow Impact | Low | Admins can disable any level's requirement instantly |

