

## Completed: Rollback + Effective From Month for Pending Reviews

### Changes Made

#### `src/hooks/usePendingSelfReviews.ts`
- Added `useAutoScoredKpis()` — queries `kpi_audit_logs` for `SYSTEM_AUTO_SCORED` actions, joins with KPIs still at `approved` status
- Added `usePenalizedManagerKpis()` — same for `MANAGER_PENALTY_SCORED` actions
- Added `useRollbackAutoScore()` — reverts KPI to `kra_set`, clears submission scores, logs `SYSTEM_AUTO_SCORE_ROLLBACK`
- Added `useRollbackManagerPenalty()` — reverts to previous status from audit log, clears scores, logs `MANAGER_PENALTY_ROLLBACK`
- Exported new types: `AutoScoredKpi`, `PenalizedManagerKpi`

#### `src/pages/admin/PendingSelfReviews.tsx`
- Added **Rollback tab** with two sub-sections: Auto-Scored KPIs and Manager Penalty KPIs
- Each section has table with checkbox selection, "Rollback Selected" and "Rollback All" buttons
- Added **Effective From Month** selector in Settings panel (month + year dropdowns)
- Saves to `pending_review_effective_from_month` system setting

### No database changes needed
