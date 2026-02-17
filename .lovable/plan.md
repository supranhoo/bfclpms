

# Deep Audit: Hardcoded Workflow Statuses + Dippendu Das Data Fix

## Part 1: Dippendu Das's KPI Data Status

Dippendu Das has **~20 KPIs for January 2026** stuck at `self_review` with `manager_rating: null` and `manager_score: null`. These were previously at the management stage but were sent back using the **old buggy ManagementScorecard code** (which set incorrect statuses). The code fix has been applied (v1.44.0), but the **data was never corrected**.

Since these KPIs have only self-review data (self_rating, self_score) and no manager/auditor data, they need to be manually advanced to the correct status using Admin Data Entry with the "Advance workflow status" toggle. Alternatively, a one-time SQL fix can be run to move them to `manager_check` (the stage just before audit) so the auditor can pick them up. **This requires a database migration.**

### Data Fix

Run a migration to move Dippendu Das's January 2026 KPIs from `self_review` to `manager_check` (which is the stage that lands in the auditor's queue in the default 6-stage pipeline). Since manager data was already cleared by the bad send-back, the admin will need to use Admin Data Entry to fill in manager-level data, OR the KPIs can be moved directly to the auditor's pending stage.

We will check the employee's actual workflow to set the correct pre-audit status.

---

## Part 2: Hardcoded Workflow Status Audit

After a deep search across 104 files, here are all locations with hardcoded workflow status assumptions that ignore the dynamic 8-stage pipeline:

### Critical (Breaks 8-stage workflows)

| # | File | Line(s) | Issue |
|---|---|---|---|
| 1 | `src/components/review/MobileKpiCard.tsx` | 74-84, 114-116 | `canReview()` hardcodes `self_review`, `manager_check`, `audit`, `management_review` -- ignores skip_level and hr_pms stages. Should use `canReviewKpi()` from workflowEngine. |
| 2 | `src/hooks/useAdminDataEntry.ts` (`getPreviousStatus`) | 380-394 | `STATUS_ORDER` is hardcoded to 6 stages -- missing `skip_level_check` and `hr_pms_review`. Admin Step Back will skip these stages entirely. |
| 3 | `src/hooks/useAdminDataEntry.ts` (step-back clear logic) | 450-474 | Cascade-clear uses hardcoded status comparisons (`kra_set`, `self_review`, `manager_check`) instead of index-based clearing from the full 8-stage order. Misses skip_level and hr_pms fields. |
| 4 | `src/pages/admin/ImportData.tsx` (`determineReviewStatus`) | 60-64 | Returns only 5 statuses; ignores `management_review`, `skip_level_check`, `hr_pms_review`. Imports with skip-level/HR PMS data get wrong status. |
| 5 | `src/hooks/useKpis.ts` (`useSendBackKpi`) | 869-936 | Manager send-back always resets to `kra_set` and only clears `manager_*` fields. Does not respect workflow or cascade-clear downstream data. |
| 6 | `src/hooks/useKpiFilters.ts` (`ReviewStatus` type) | 21 | Type is `'kra_set' | 'self_review' | 'manager_check' | 'audit' | 'approved'` -- missing `management_review`, `skip_level_check`, `hr_pms_review`. |

### Moderate (Incorrect counts/display in 8-stage workflows)

| # | File | Line(s) | Issue |
|---|---|---|---|
| 7 | `src/pages/admin/AllKpis.tsx` | 39 | `WORKFLOW_STAGES` hardcoded to 6 stages. Column headers in the All KPIs dashboard won't show skip-level or HR PMS columns. |
| 8 | `src/components/review/DailySubmissionSummary.tsx` | 38 | `STATUS_ORDER` hardcoded to 6 stages. Determines which achieved-value columns to show -- misses skip-level/HR PMS. |
| 9 | `src/pages/reports/KRAIssuance.tsx` | 35-41 | `statusCounts` only counts 5 statuses. KPIs at `management_review`, `skip_level_check`, `hr_pms_review` are invisible. |
| 10 | `src/pages/reports/CompletionReport.tsx` | 62-76 | Completion tracking only checks 4 statuses. skip_level_check and hr_pms_review are unaccounted for. |
| 11 | `src/components/review/EmployeeScorecard.tsx` | 254-255 | `pendingReviewCount` hardcodes `self_review`; `reviewedCount` hardcodes `['manager_check', 'audit', ...]`. Both ignore dynamic stages. |
| 12 | `src/pages/ManagementDashboard.tsx` | 213, 262, 346 | Status filtering hardcodes `management_review`. Doesn't affect logic (management always checks that status) but the pattern is fragile. |

### Low Priority (Display/labeling only)

| # | File | Line(s) | Issue |
|---|---|---|---|
| 13 | `src/pages/reports/AuditTrailReport.tsx` | 43-99 | `actionLabels` and `actionColors` don't have entries for skip-level or HR PMS actions. New actions will show raw strings. |
| 14 | `supabase/functions/import-kpis/index.ts` | 221-228 | Edge function `REVIEW_STATUS_MAP` missing `management_review`, `skip_level_check`, `hr_pms_review`. |
| 15 | `src/hooks/useKpis.ts` (`ReviewStatus` type) | 7 | Type lacks `skip_level_check` and `hr_pms_review`. |

---

## Proposed Fixes

### Fix A: Data migration for Dippendu Das

Run a SQL migration to correct the KPI statuses. Check his workflow first to determine the correct pre-audit status, then update accordingly.

### Fix B: `getPreviousStatus` in `useAdminDataEntry.ts`

Replace the hardcoded 6-stage `STATUS_ORDER` with a function that accepts the employee's workflow stages (fetched via RPC), or use the workflow engine's `resolvePreviousStatus`.

### Fix C: Step-back cascade-clear in `useAdminDataEntry.ts`

Use index-based clearing from the full status order (matching the pattern already used in `UnifiedScorecard.tsx` lines 494-551) to correctly handle skip_level and hr_pms fields.

### Fix D: `MobileKpiCard.tsx` `canReview()`

Replace hardcoded status checks with `canReviewKpi()` from `workflowEngine.ts`, passing the employee's workflow stages. This matches the pattern already used in `KpiDetailsTable.tsx` (line 147-150).

### Fix E: `useSendBackKpi` in `useKpis.ts`

This hook always sends back to `kra_set` regardless of context. It should use `resolveSendBackStatus` and cascade-clear downstream data, matching the pattern in `UnifiedScorecard.tsx`.

### Fix F: `useKpiFilters.ts` and `useKpis.ts` types

Expand `ReviewStatus` to include all 8 stages.

### Fix G: Report pages and AllKpis dashboard

- `AllKpis.tsx`: Fetch workflow stages dynamically or use the full 8-stage list.
- `KRAIssuance.tsx`: Count all statuses including `management_review`, `skip_level_check`, `hr_pms_review`.
- `CompletionReport.tsx`: Account for all intermediate stages in completion tracking.
- `DailySubmissionSummary.tsx`: Use full status order.

### Fix H: `ImportData.tsx` and edge function

Update `determineReviewStatus` to handle skip-level and HR PMS data columns, and include `management_review` as a valid status.

### Fix I: `AuditTrailReport.tsx`

Add action labels and colors for skip-level and HR PMS actions.

### Fix J: `EmployeeScorecard.tsx` stats

Use workflow-aware status checking instead of hardcoded arrays.

### Fix K: Update `DOCUMENTATION.md`

Document all hardcoded workflow removals.

---

## Files to Change

| File | Priority | Change |
|---|---|---|
| **Database migration** | Critical | Fix Dippendu Das's January 2026 KPIs |
| `src/hooks/useAdminDataEntry.ts` | Critical | Fix `getPreviousStatus` and cascade-clear to support 8 stages |
| `src/hooks/useKpis.ts` | Critical | Fix `useSendBackKpi` to use workflow engine; expand `ReviewStatus` type |
| `src/hooks/useKpiFilters.ts` | Critical | Expand `ReviewStatus` type |
| `src/components/review/MobileKpiCard.tsx` | Critical | Use `canReviewKpi()` from workflow engine |
| `src/pages/admin/AllKpis.tsx` | Moderate | Use full 8-stage status list |
| `src/components/review/DailySubmissionSummary.tsx` | Moderate | Use full status order |
| `src/pages/reports/KRAIssuance.tsx` | Moderate | Count all statuses |
| `src/pages/reports/CompletionReport.tsx` | Moderate | Account for all stages |
| `src/components/review/EmployeeScorecard.tsx` | Moderate | Workflow-aware stat counts |
| `src/pages/admin/ImportData.tsx` | Moderate | Handle skip-level/HR PMS data |
| `supabase/functions/import-kpis/index.ts` | Low | Expand status map |
| `src/pages/reports/AuditTrailReport.tsx` | Low | Add skip-level/HR PMS action labels |
| `DOCUMENTATION.md` | Required | Document changes |

