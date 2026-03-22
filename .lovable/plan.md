

## Root Cause: Pending Tabs Ignore Employee Workflow

### The Problem

The "Pending Manager Review" tab fetches all KPIs with `status = 'self_review'`. But for employees whose workflow is `self_review → audit → management` (no `manager_check` stage), a KPI at `self_review` is actually **pending with the Auditor**, not a Manager. These KPIs are incorrectly listed in the Manager tab.

Same issue for "Pending Skip-Level Review": it fetches `status = 'manager_check'`, but for employees without `skip_level_check` in their workflow, those KPIs are pending with whoever comes next (audit/management).

**Root cause**: The queries filter by status alone without checking whether that status actually routes to the tab's reviewer in the employee's specific workflow.

### Fix: `src/hooks/usePendingSelfReviews.ts`

#### 1. `useOverdueTeamReviewKpis` (Manager tab, ~line 141)

After fetching KPIs with `status = 'self_review'`, collect unique employee IDs and call `get_employee_workflow` RPC for each. Then **filter out** any KPI whose employee's workflow does NOT contain `manager_check`, because for those employees `self_review` routes to a different reviewer (audit, skip-level, etc.).

```text
1. Fetch KPIs at 'self_review' (existing)
2. Get unique employee IDs from results
3. Batch-fetch workflows via get_employee_workflow RPC
4. Keep only KPIs where employee's workflow includes 'manager_check'
   AND 'manager_check' is the stage immediately after 'self_review'
5. Continue with existing deadline/exclusion logic
```

#### 2. `useOverdueSkipLevelKpis` (Skip-Level tab, ~line 1047)

Same approach: after fetching KPIs with `status = 'manager_check'`, filter out KPIs whose employee's workflow does NOT contain `skip_level_check` as the next stage after `manager_check`.

#### 3. Update "Pending With" badge logic

Currently the badge is hardcoded per tab. After this fix it's still correct since the filtering ensures only workflow-matching KPIs appear in each tab.

### No database changes needed

