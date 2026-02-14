

# Reviewer-Initiated N/A Marking at Any Review Stage

## Current Behavior

Today, only the **employee** can mark a KPI as "Not Applicable" during self-review (via a checkbox in `SelfReviewSheet`). At later stages (Manager, Auditor, Management), reviewers can only **confirm** an already-set N/A flag -- they cannot initiate it themselves.

## What Changes

Any reviewer (Manager, Skip-Level, HR PMS, Auditor, Management) will be able to mark a KPI as N/A even if the employee scored it normally. When a reviewer marks N/A:

- The `is_na` flag on `review_submissions` is set to `true`
- The reviewer must provide a mandatory reason (stored as their level's remarks)
- The KPI is forwarded to the next stage with N/A status
- Dashboard scoring excludes the KPI (existing behavior for `is_na = true`)
- An audit log records who marked it N/A, at what stage, and why
- A new `na_marked_by_role` column tracks which role initiated the N/A

## Implementation

### 1. Database: Add `na_marked_by_role` column

Add a nullable text column to `review_submissions` to track which role marked the N/A:

```sql
ALTER TABLE review_submissions
  ADD COLUMN na_marked_by_role text;
```

This allows the system to show "Marked N/A by Auditor" vs "Marked N/A by Employee" in the review trail.

### 2. Update `NaConfirmationCard` component

Transform this component from a read-only confirmation card into a dual-purpose card:

- **When N/A was set by a previous stage:** Show existing confirmation UI (checkbox + optional remarks) -- no change
- **New: "Mark as N/A" action:** Add a new variant/section with a Switch/button that allows the reviewer to initiate N/A marking, with a mandatory reason textarea

The component will accept a new prop `canMarkNa: boolean` and `onMarkNa: (remarks: string) => void`.

### 3. Update `UnifiedScorecard.tsx` (primary scorecard)

This is the main component used across all reviewer views.

- Add a `reviewerMarkNa` state (boolean) and a `markNaRemarks` state (string)
- When reviewer toggles "Mark as N/A":
  - Hide the score/achieved-value input fields (they become irrelevant)
  - Show a mandatory remarks field for justification
  - Change the action button to "Mark N/A and Forward"
- On submit with N/A:
  - Set `is_na = true` and `na_marked_by_role = viewLevel` on `review_submissions`
  - Store the reason in the reviewer's remarks field (e.g., `manager_remarks`)
  - Advance the KPI status to the next workflow stage
  - Log audit entry: `{viewLevel}_MARKED_NA`
  - Notify the employee

### 4. Update legacy scorecards (EmployeeScorecard, AuditScorecard, ManagementScorecard)

Apply the same pattern for consistency, since these components still handle some flows independently:

- Add the "Mark as N/A" toggle in the review sheet
- Update the approve handler to support reviewer-initiated N/A
- Each creates an audit log with the specific action (e.g., `AUDITOR_MARKED_NA`)

### 5. Update `KpiDetailsTable` to show N/A initiator

Currently the table just checks `is_na` to disable the review button. Enhance it to show a badge indicating which role marked it N/A (using the new `na_marked_by_role` field).

### 6. Update scoring and display logic

No changes needed to scoring -- the existing `if (submission?.is_na) return` skip logic already handles this correctly across Dashboard, EmployeePerformanceSummary, and KpiTrackerModal. The new column is purely informational.

### 7. Update DOCUMENTATION.md

Record the new reviewer-initiated N/A capability.

## Files Modified

| File | Change |
|---|---|
| Database migration | Add `na_marked_by_role` column to `review_submissions` |
| `src/components/review/NaConfirmationCard.tsx` | Add "Mark as N/A" variant with Switch + mandatory remarks |
| `src/components/review/UnifiedScorecard.tsx` | Add reviewer N/A toggle, update submit handler |
| `src/components/review/EmployeeScorecard.tsx` | Add reviewer N/A toggle for manager view |
| `src/components/review/AuditScorecard.tsx` | Add reviewer N/A toggle for auditor view |
| `src/components/review/ManagementScorecard.tsx` | Add reviewer N/A toggle for management view |
| `src/components/review/KpiDetailsTable.tsx` | Show "Marked N/A by [Role]" badge |
| `DOCUMENTATION.md` | Document reviewer N/A marking |

## User Flow

```text
Reviewer opens KPI review sheet
  |
  +--> KPI already marked N/A by employee?
  |      YES --> Existing confirmation flow (checkbox + forward)
  |      NO  --> New "Mark as N/A" switch appears above score fields
  |                |
  |                +--> Reviewer toggles ON
  |                |      Score fields hide
  |                |      Mandatory reason textarea appears
  |                |      Action button changes to "Mark N/A & Forward"
  |                |
  |                +--> Reviewer toggles OFF
  |                       Normal scoring flow resumes
  |
  +--> On submit:
         is_na = true
         na_marked_by_role = 'auditor' (or manager/management)
         {level}_remarks = reason
         KPI advances to next stage
         Audit log + employee notification created
```

## Risk: Low

- Scoring logic is unaffected (N/A exclusion already works)
- Existing employee-initiated N/A flow is unchanged
- The new column is nullable, so no migration issues with existing data
- All views already handle `is_na = true` for display purposes

