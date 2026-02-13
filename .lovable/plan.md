

# New Workflow: 8-Stage Review with Skip-Level RM and HR PMS Team

## Overview

Add a new workflow template with **8 stages** (including bookend stages):

```text
KRA Set -> Self Review -> Manager Check -> Skip-Level Check -> HR PMS Review -> Audit -> Management Review -> Approved
```

This introduces two new reviewer roles that don't exist in the current system: **Skip-Level Reporting Manager** and **HR PMS Team**.

## Current System Constraints

The current system has 4 reviewer stages hardcoded into `review_submissions` columns:
- `self_*` (score, rating, remarks, evidence, achieved_value)
- `manager_*`
- `auditor_*`
- `management_*`

The `viewLevel` type throughout the codebase is: `'employee' | 'manager' | 'auditor' | 'management'`

Adding two new stages requires extending both the database schema and the UI layer.

## Plan

### Phase 1: Database Changes

**1a. Add new columns to `review_submissions`**
- `skip_level_score` (numeric)
- `skip_level_rating` (rating_level enum)
- `skip_level_remarks` (text)
- `skip_level_evidence_url` (text)
- `skip_level_evidence_urls` (jsonb)
- `skip_level_achieved_value` (numeric)
- `hr_pms_score` (numeric)
- `hr_pms_rating` (rating_level enum)
- `hr_pms_remarks` (text)
- `hr_pms_evidence_url` (text)
- `hr_pms_evidence_urls` (jsonb)
- `hr_pms_achieved_value` (numeric)

**1b. Add new KPI status enum values**
- `skip_level_check` (after `manager_check`)
- `hr_pms_review` (after `skip_level_check`)

**1c. Add `hr_pms` to the `app_role` enum**

This allows certain users to be assigned the HR PMS role.

**1d. Insert the new workflow template**
```sql
INSERT INTO workflow_templates (name, display_name, description, stages)
VALUES ('full_8_stage', 'Full 8-Stage Review',
  'Complete review with Skip-Level RM and HR PMS Team',
  '["kra_set","self_review","manager_check","skip_level_check","hr_pms_review","audit","management_review","approved"]');
```

**1e. Add RLS policies for the new stages**

Update KPI UPDATE policies to allow skip-level managers (RM's RM auto-resolved) and HR PMS role holders to progress KPIs at their respective stages.

### Phase 2: Workflow Engine Updates

**File: `src/lib/workflowEngine.ts`**

- Add `skip_level_check` and `hr_pms_review` to all resolution functions
- Extend `resolveSendBackTargets` with new targets: `skip_level` and `hr_pms`
- Extend `resolvePendingStatuses` and `resolveReviewableStatuses` for the new view levels
- Add `getVisibleJourneyStages` mappings: `skip_level_check` -> `'skip_level'`, `hr_pms_review` -> `'hr_pms'`

**File: `src/hooks/useWorkflowConfig.ts`**

- Add `getStageLabel` entries for `skip_level_check` -> "Skip-Level Review" and `hr_pms_review` -> "HR PMS Review"

### Phase 3: View Level Extension

**Extend the `viewLevel` / `ScorecardViewLevel` type** across the codebase from `'manager' | 'auditor' | 'management'` to include `'skip_level' | 'hr_pms'`.

Files affected:
- `src/components/review/UnifiedScorecard.tsx`
- `src/components/review/KpiReviewPanel.tsx`
- `src/components/review/KpiJourneySection.tsx`
- `src/components/review/ReviewLevelOverrideEditor.tsx`
- `src/components/review/KpiDetailsTable.tsx`
- `src/components/review/KpiObservationsSection.tsx`
- `src/lib/workflowEngine.ts`

### Phase 4: Skip-Level RM Resolution

The skip-level manager is auto-resolved by looking up the reporting manager's own `reporting_manager_id`.

**New DB function: `get_skip_level_manager(employee_uuid UUID)`**
```sql
SELECT p2.reporting_manager_id
FROM profiles p1
JOIN profiles p2 ON p1.reporting_manager_id = p2.id
WHERE p1.id = employee_uuid;
```

**New page: `src/pages/SkipLevelReview.tsx`**
- Similar to `TeamReview.tsx` but fetches employees where the current user is the skip-level manager (i.e., employees whose RM reports to the current user)
- Query: profiles where `reporting_manager_id` is in the set of profiles that have `reporting_manager_id = auth.uid()`
- Uses `UnifiedScorecard` with `viewLevel="skip_level"`

### Phase 5: HR PMS Review Page

**New page: `src/pages/HrPmsReview.tsx`**
- Available to users with the `hr_pms` role
- Shows all employees whose KPIs are at `skip_level_check` or `hr_pms_review` status
- Uses `UnifiedScorecard` with `viewLevel="hr_pms"`

### Phase 6: UnifiedScorecard Updates

The `UnifiedScorecard` needs to handle the two new view levels:

- **Score field mapping**: `skip_level` -> `skip_level_score/rating/remarks`, `hr_pms` -> `hr_pms_score/rating/remarks`
- **Forward status**: `skip_level` forwards to `hr_pms_review`, `hr_pms` forwards to `audit`
- **Send-back targets**: `skip_level` can send back to `manager` or `employee`; `hr_pms` can send back to `skip_level`, `manager`, or `employee`
- **Daily override columns**: `skip_level` and `hr_pms` get their own override storage

### Phase 7: Journey and Tracker UI

**KpiJourneySection** - Add `skip_level` and `hr_pms` stage cards with distinct icons/colors:
- Skip-Level: `UserCheck` icon, teal color
- HR PMS: `ClipboardCheck` icon, rose color

**WorkflowProgressTracker** - Add stage config entries for the two new statuses with labels and colors.

**KpiDetailsTable** - Add two new score columns (Skip-Level, HR PMS) between Manager and Auditor.

### Phase 8: Navigation and Sidebar

**AppSidebar** - Add two new menu items under the Review section:
- "Skip-Level Review" (visible when user has skip-level subordinates)
- "HR PMS Review" (visible when user has `hr_pms` role)

**App.tsx** - Add routes: `/skip-level-review` and `/hr-pms-review`

### Phase 9: Supporting Updates

- **Stage colors** in `WorkflowConfig.tsx`: Add colors for `skip_level_check` and `hr_pms_review`
- **Review constants** (`reviewConstants.ts`): Add status labels and colors for the new statuses
- **Audit log actions**: Add action types for skip-level and HR PMS approvals/send-backs
- **Notification routing** (`inboxUtils.ts`): Handle navigation for the new stages
- **DOCUMENTATION.md**: Update with the new workflow

## Technical Details Summary

| Item | Details |
|---|---|
| New DB columns | 12 (6 per new stage on review_submissions) |
| New enum values | 2 status values + 1 role value |
| New pages | 2 (SkipLevelReview, HrPmsReview) |
| New DB function | 1 (get_skip_level_manager) |
| Modified files | ~15-18 files |
| New workflow template | 1 (8-stage) |

## Risks and Mitigations

- **Backward compatibility**: Existing workflows are unaffected. The new columns are nullable, so current submissions continue to work.
- **Skip-level edge case**: If an RM has no reporting manager, the skip-level stage will have no reviewer. The system should auto-skip this stage or show a warning during workflow assignment.
- **HR PMS role assignment**: Admins will need to assign the `hr_pms` role to relevant users via User Management before the workflow can function.

