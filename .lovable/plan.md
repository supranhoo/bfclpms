

# Plan: Auto-Progression System for Unsubmitted KPIs

## Problem
When employees fail to submit their self-review within a deadline, their KPIs remain stuck at `kra_set` or `self_review`, blocking the entire review pipeline for managers, auditors, and management. The admin must manually intervene for each delinquent employee.

## Solution: "Auto-Advance with Zero Score" Engine

A new auto-rule type that, when triggered, automatically advances unsubmitted KPIs through the workflow with a 0 score, leaving a clear audit trail explaining why.

### How It Works

1. **New Auto-Rule Type**: `auto_advance_zero` — added to the existing `ReviewPeriodAutoRules` UI alongside `deadline_passed`, `review_submitted`, etc.
2. **Configuration**: Admin sets a deadline (days from stage start). After the deadline, unsubmitted KPIs are auto-advanced.
3. **Execution** (in the `auto-lock-review-periods` edge function):
   - Find all KPIs for the period still at `kra_set` or `self_review`
   - For each, create/update the `review_submissions` record with `self_score: 0`, `self_rating: 0`
   - Advance the KPI status to the next workflow stage (e.g., `self_review` or `manager_check`)
   - Insert an `auto_advance_reason` field in the submission: `"Auto-advanced: Employee did not submit self-review within X days"`
   - Log each advancement in `review_period_audit_log`
4. **Employee Awareness**:
   - The `GovernanceLockBanner` and `KpiJourneySection` display a visible warning banner on auto-advanced KPIs
   - A new `auto_advance_reason` column on `review_submissions` stores the system-generated explanation
   - The Review Trail Card shows the auto-advance event with timestamp and reason

### Additional Capabilities to Explore

| Feature | Description |
|---------|-------------|
| **Grace Period Notification** | Send email notification X days before auto-advance warning employees to submit |
| **Partial Auto-Advance** | Only auto-advance if employee submitted 0 out of N KPIs; if partial, leave all pending for manual review |
| **Manager Override** | After auto-advance, manager can still assign a non-zero score (the 0 is a default, not final) |
| **Configurable Default Score** | Admin chooses default score (0, 1, or N/A) instead of hardcoding 0 |
| **Stage-Specific Rules** | Auto-advance not just self-review but any stage (e.g., if manager doesn't review within X days, auto-advance to auditor) |
| **Dashboard Widget** | Show count of auto-advanced KPIs on Management Dashboard as a red alert card |

### Implementation Details

**Database Changes:**
- Add column `auto_advance_reason TEXT` to `review_submissions` table
- No new tables needed; the existing `review_period_auto_rules` table supports this via its flexible `trigger_condition` and `action` JSONB columns

**Files to Modify:**

| File | Change |
|------|--------|
| `src/components/admin/ReviewPeriodAutoRules.tsx` | Add `auto_advance_zero` to `RULE_TYPES` with configurable deadline days and optional default score |
| `supabase/functions/auto-lock-review-periods/index.ts` | Add `auto_advance_zero` case: query stuck KPIs, create 0-score submissions, advance status, audit log |
| `src/components/review/KpiJourneySection.tsx` | Show auto-advance warning banner when `submission.auto_advance_reason` exists |
| `src/components/review/ReviewTrailCard.tsx` | Display auto-advance events in the trail with distinct styling |
| `DOCUMENTATION.md` | Document the auto-advance feature and configuration |

**Risk Assessment:**
- **Data Impact**: Only affects KPIs that are genuinely stuck (status = `kra_set`/`self_review` past deadline). Manager/auditor can still override the 0 score — it's a default, not a lock.
- **Regression Risk**: Low — new rule type, existing rules unaffected. Default behavior unchanged until admin explicitly creates the rule.
- **Reversibility**: Admin can send-back auto-advanced KPIs to the employee if needed.

