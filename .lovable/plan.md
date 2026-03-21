

## Completed: Fix Manager Review False-Positive + Add Skip-Level Tab

### Changes Made

#### `src/hooks/usePendingSelfReviews.ts`
- **Fixed** `useOverdueTeamReviewKpis`: Now queries `review_submissions` after fetching KPIs at `manager_check` and excludes those where `manager_score IS NOT NULL` (already reviewed by manager)
- **Added** `useOverdueSkipLevelKpis(deadlineDay, filterMonth, filterYear)`: New hook that queries KPIs at `skip_level_check` status, excludes those where `skip_level_score IS NOT NULL`, resolves manager and skip-level manager names via profile chain

#### `src/pages/admin/PendingSelfReviews.tsx`
- Added **Pending Skip-Level Review** tab with read-only table showing: Employee, Code, Department, KPI, KRA, Manager, Skip-Level Manager, Days Overdue
- No auto-penalty action for skip-level — purely informational visibility

### Previous: Rollback + Effective From Month for Pending Reviews
- Added `useAutoScoredKpis()`, `usePenalizedManagerKpis()`, `useRollbackAutoScore()`, `useRollbackManagerPenalty()`
- Added Rollback tab and Effective From Month setting

### No database changes needed
