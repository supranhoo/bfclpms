

## RCA: Management-Scored KPIs Stuck at `management_review` (Not Approved)

### Root Cause

**This is NOT a code bug — it's a UX workflow gap.**

The audit logs confirm that all 6 KPIs for employee 100856 (Feb 2026) were submitted via **"Save Draft"** (`MANAGEMENT_REVIEWED`) on April 4, not via **"Approve"** (`MANAGEMENT_APPROVED`). The reviewer scored all KPIs but never clicked the green "Approve" button — only "Save Draft".

**Evidence:**
- 6 audit log entries: all show action = `MANAGEMENT_REVIEWED` (draft), zero `MANAGEMENT_APPROVED`
- `final_score` is NULL on all 6 — the code intentionally sets `final_score = null` on draft saves (line 315-316)
- **System-wide impact**: 22 KPIs across 5 employees are in the same state — management score exists but status stuck at `management_review`

The code is working correctly: draft saves the score but keeps status at `management_review`. The problem is that reviewers don't realize they must click "Approve" separately after scoring.

### Fix: Add "Approve All Drafted" Capability

Since this is a recurring pattern (22 KPIs across 5 employees), the fix has two parts:

**Part 1: Bulk "Approve All Drafted" button on the Management Scorecard**

Add a prominent action button that appears when drafted (scored but unapproved) KPIs exist for the current employee. This button:
- Counts drafted KPIs (status = `management_review` with `management_score` not null)
- Shows a confirmation dialog listing the KPIs about to be approved
- On confirm: batch-updates all drafted KPIs to `approved`, copies `management_score` → `final_score`, logs `MANAGEMENT_APPROVED` for each

**Part 2: Visual "Draft" indicator on the KPI list within ManagementScorecard**

Currently, the KPI list inside ManagementScorecard doesn't distinguish between "pending review" and "drafted but not approved". Add an amber "Drafted" badge next to scored-but-unapproved KPIs so the reviewer clearly sees they still need to approve.

### Files to Change

| File | Change |
|------|--------|
| `src/components/review/ManagementScorecard.tsx` | Add "Approve All Drafted" button with confirmation dialog; add "Drafted" badge to KPI list items that have management_score but status is still `management_review` |
| `DOCUMENTATION.md` | Document the bulk approve feature; version bump |
| `POLICY.md` | Add policy note about draft vs. approved distinction at management level |

### Risk Assessment
- **Data Impact**: Positive — resolves 22 stuck KPIs going forward. Existing data is untouched until the reviewer clicks the new bulk approve button.
- **Workflow Impact**: None — this adds an accelerator, doesn't change the approval logic.
- **Regression Risk**: Low — reuses existing `submitManagementReview` mutation logic. Each KPI gets the same update path as individual approvals.
- **Security**: No RLS changes. The bulk action runs as the authenticated management user, same as individual approvals.

