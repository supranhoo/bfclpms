

## RCA: Approved KPIs Not Re-evaluated After Workflow Change

### Root Cause

**No workflow-change impact detection.** When an admin changes an employee's workflow template (e.g., from `self_l1_hr_pms` → `self_l1_audit`), the system only updates the `workflow_config` table. It does NOT check whether any KPIs for the affected period were already approved under the old workflow with a now-insufficient terminal reviewer.

**Timeline for KPI `ee7db054` (Samir Dey, employee 100482):**
- **Mar 28**: HR PMS approved the KPI → status set to `approved`, `final_score = 5` (HR PMS was terminal reviewer under `self_l1_hr_pms`)
- **Apr 4**: Admin changed Samir Dey's March workflow from `self_l1_hr_pms` (stages: kra_set → self_review → manager_check → hr_pms_review → approved) to `self_l1_audit` (stages: kra_set → self_review → manager_check → audit → approved)
- **Result**: KPI shows `approved` but has never been through `audit` — the new terminal stage

### Data Impact — 39 KPIs across 7 employees

| Employee | Code | KPI Count |
|----------|------|-----------|
| Samir Dey | 100482 | 1 |
| PRATIK KEDIA | 100741 | 1 |
| Jitendra Bharti | 101715 | 8 |
| Vivek Kumar Dansena | 101784 | 5 |
| Amit Kumar Shaw | 101804 | 15 |
| Rupesh Kumar Sharma | 101851 | 1 |
| Preetam Sagar | 101852 | 8 |

All 39 KPIs were approved by HR PMS before the workflow was changed to require audit on April 4.

### Fix — 3 parts

#### Part 1: Database Migration — Step Back 39 Affected KPIs

Reset these 39 KPIs from `approved` to the stage preceding the new terminal reviewer (`audit`). Specifically, set status to `manager_check` (the stage before `audit` in the new workflow), so they appear in the auditor's pending queue. Clear `final_score` and `final_rating` (since approval is revoked) but preserve all existing reviewer scores (self, manager, HR PMS). Log `WORKFLOW_CHANGE_STEP_BACK` audit entries with `performed_by = NULL` (System).

#### Part 2: Workflow Change Hook — Auto-detect & Step Back on Future Changes

Add a database trigger `trg_workflow_change_step_back` on `workflow_config` that fires on INSERT or UPDATE (when `workflow_template_id` changes). The trigger:

1. Identifies all KPIs for the affected employee + period that are at `approved` status
2. Resolves the old and new workflow templates' stages
3. For each approved KPI: if the new workflow has stages beyond what the old terminal reviewer covered (e.g., old terminal was `hr_pms_review`, new has `audit` after it), step the KPI back to the stage preceding the new uncovered stage
4. Clear `final_score`/`final_rating` on stepped-back KPIs
5. Log `WORKFLOW_CHANGE_STEP_BACK` audit entries

This is the **preventive mechanism** — any future workflow change that adds stages beyond the old terminal will automatically revert affected KPIs.

#### Part 3: UI Notification in Workflow Config

In the workflow assignment UI (`useWorkflowConfig.ts`), after a successful workflow config save, show a toast warning if the change affected any already-approved KPIs: "X KPIs were stepped back to [stage] due to workflow change. Affected employees: [names]."

#### Part 4: Documentation

| File | Change |
|------|--------|
| Migration SQL | Step back 39 KPIs + create trigger |
| `src/hooks/useWorkflowConfig.ts` | Add post-save check for affected KPIs, show toast |
| `POLICY.md` | Add §60: Workflow changes that add stages beyond current terminal must revert approved KPIs |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **Step-back**: All reviewer scores preserved. Only `final_score`/`final_rating` cleared and status moved to pre-audit. Auditor will see these in their queue.
- **Trigger**: Only fires when workflow template actually changes. Does not fire on same-template re-saves. Only affects `approved` KPIs where new stages were added beyond old terminal.
- **No data loss**: HR PMS scores remain on `review_submissions`. Once auditor reviews and re-approves, `final_score` recalculates from the new terminal reviewer.

