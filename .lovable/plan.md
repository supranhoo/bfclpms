

## Revised Plan: Pending Reviews — Manager + Skip-Level Tabs Only

### Scope
- **Pending Manager Review**: Fix false-positive (exclude KPIs where `manager_score IS NOT NULL`). Already planned.
- **Pending Skip-Level Review**: New tab showing KPIs at `skip_level_check` where `skip_level_score IS NULL`. Only populated for employees whose workflow includes the `skip_level_check` stage.

### Behavior when skip-level stage is absent
If an employee's workflow goes `manager_check → hr_pms_review` or `manager_check → audit` (no `skip_level_check` stage), their KPIs will never reach `skip_level_check` status. The Skip-Level tab will simply show "No pending items" for those workflows. This is correct — no false data is displayed.

HR PMS and Audit pending tracking is excluded from this scope and can be added later.

### Files Modified

#### 1. `src/hooks/usePendingSelfReviews.ts`
- **Fix** `useOverdueTeamReviewKpis`: After fetching KPIs at `manager_check`, query `review_submissions` and exclude those with `manager_score IS NOT NULL`
- **Add** `useOverdueSkipLevelKpis(deadlineDay, filterMonth, filterYear)`: Query KPIs at `status = 'skip_level_check'`, exclude those with `skip_level_score IS NOT NULL`, apply same deadline logic, resolve skip-level manager name via profile chain

#### 2. `src/pages/admin/PendingSelfReviews.tsx`
- Add "Pending Skip-Level Review (N)" tab after Manager Review tab
- Table columns: Employee, Code, Department, KPI, KRA, Manager, Skip-Level Manager, Days Overdue
- Read-only visibility for now (no auto-penalty action)

### No database changes needed

