

## RCA: Rollback Does Not Clear Downstream Reviewer Scores

### Problem
When a KPI is rolled back from Management Review to Audit, the system reverts the KPI status but leaves the old management scores (Value: 5, Rating: 5) in `review_submissions`. After the auditor resubmits, the Review Journey and dashboard still display stale management data.

### Root Cause (Two Gaps)

**Gap 1 — Rollback approval (`useKpiRollbackRequests.ts` line 163-168):**
Only updates `kpis.status` to the target stage. Does NOT clear downstream reviewer scores from `review_submissions`.

**Gap 2 — Reviewer re-submission (`UnifiedScorecard.tsx` line 580-606):**
The `submitReview` mutation only writes the current reviewer's fields + `final_score/final_rating`. It does NOT clear scores from reviewers AFTER the current stage. The send-back flow (line 737-745) already has this clearing logic, but the regular save path does not.

### Fix

#### 1. Clear downstream scores on rollback approval (`src/hooks/useKpiRollbackRequests.ts`)
After reverting KPI status, also update `review_submissions` to null out all reviewer fields for stages that come AFTER the `target_status` in the workflow.

Use the same stage-to-field mapping as the send-back flow:
```text
target = audit → clear management_* fields, final_score, final_rating
target = hr_pms_review → clear auditor_*, management_*, final_score, final_rating
target = manager_check → clear skip_level_*, hr_pms_*, auditor_*, management_*, final_score, final_rating
```

#### 2. Clear downstream scores on reviewer submission (`src/components/review/UnifiedScorecard.tsx`)
In the `submitReview` mutation, after writing the reviewer's own fields, also null out all reviewer fields for stages AFTER the current `activeReviewStage`. This prevents stale data from persisting when a reviewer re-submits after a rollback.

Add to `updateData` before the Supabase call:
```text
If viewLevel = auditor (activeReviewStage = audit):
  updateData.management_score = null
  updateData.management_rating = null
  updateData.management_remarks = null
  updateData.management_evidence_url = null
  updateData.management_achieved_value = null
```

Use the workflow stages array to determine which fields are downstream.

#### 3. Data repair for Piyush Bansal's Feb KPI
Execute a targeted SQL update to clear the stale management scores for this specific KPI, allowing it to properly appear as pending management review.

#### 4. Documentation updates
- `DOCUMENTATION.md` version history
- `POLICY.md` — add invariant: rollback and re-submission must clear all downstream reviewer data

### Files Changed
| File | Action |
|------|--------|
| `src/hooks/useKpiRollbackRequests.ts` | Clear downstream reviewer fields on rollback approval |
| `src/components/review/UnifiedScorecard.tsx` | Clear downstream fields in `submitReview` mutation |
| Data update (SQL) | Fix Piyush Bansal's Feb KPI stale management scores |
| `DOCUMENTATION.md` | Version history |
| `POLICY.md` | New invariant |

### Risk Assessment
- **Regression**: Low — only clears fields that should not exist post-rollback; normal forward flow unaffected since downstream fields are naturally empty
- **Data**: 1 targeted row fix; no changes to Dec 2025 or earlier
- **Scope**: Fixes both rollback and re-submission paths systemically

