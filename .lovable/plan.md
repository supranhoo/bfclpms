

## Add Rollback for Auto-Score / Manager Penalty + "Effective From Month" Setting

### Overview
Three additions to the Pending Reviews page:
1. **Rollback Auto-Scored KPIs** — A new tab showing KPIs that were system-auto-scored, with bulk rollback capability (revert to `kra_set`, clear zero scores).
2. **Rollback Manager Penalties** — Same tab or sub-section for penalized manager KPIs, rollback to their previous status.
3. **"Effective From Month" setting** — Add a month selector in the Settings panel so admins can configure from which month the auto-score/penalty rules apply.

### Design

#### Identifying rollbackable KPIs
- Query `kpi_audit_logs` for `action = 'SYSTEM_AUTO_SCORED'` or `action = 'MANAGER_PENALTY_SCORED'` where `source = 'pending_reviews_admin'`.
- Join with `kpis` to confirm current status is still `approved` (not yet further actioned).
- Filter by selected month/year.
- Show employee name, KPI name, scored date, admin who triggered it.

#### Rollback logic
**Auto-Score rollback:**
- Set `kpis.status` back to `kra_set`
- Clear `review_submissions`: reset `achieved_value`, `self_score`, `self_rating`, `self_remarks`, `final_score`, `final_rating`, `auto_advance_reason` to null
- Insert audit log with action `SYSTEM_AUTO_SCORE_ROLLBACK`

**Manager Penalty rollback:**
- Set `kpis.status` back to `old_value.status` from the audit log (the status before penalty)
- Clear the penalty remarks/scores from `review_submissions`
- Insert audit log with action `MANAGER_PENALTY_ROLLBACK`

#### "Effective From Month" setting
- New system setting key: `pending_review_effective_from_month` storing `{month, year}`
- Displayed in the Settings panel as a month/year selector
- The overdue queries (`useOverdueKraSetKpis`, `useOverdueTeamReviewKpis`) will skip KPIs whose `review_period`+`review_year` is before the effective-from date

### Files Modified

#### 1. `src/hooks/usePendingSelfReviews.ts`
- Add `useAutoScoredKpis(filterMonth, filterYear)` — queries audit logs joined with KPIs to find rollbackable auto-scored items
- Add `usePenalizedManagerKpis(filterMonth, filterYear)` — same for manager penalties
- Add `useRollbackAutoScore()` mutation — reverts KPI status + clears submission + audit log
- Add `useRollbackManagerPenalty()` mutation — same for penalties
- Add effective-from-month filtering logic in existing overdue queries
- Export new types: `AutoScoredKpi`, `PenalizedManagerKpi`

#### 2. `src/pages/admin/PendingSelfReviews.tsx`
- Add new tab **"Rollback"** with two sub-sections (auto-scored, manager penalties)
- Each sub-section: table with checkbox selection, "Rollback Selected" and "Rollback All" buttons
- Add "Effective From Month" selector in the Settings panel (month + year dropdowns)
- Save/load effective-from-month via `useSystemSetting` / `useUpdateSystemSetting`

### No database changes needed
All data is already captured in `kpi_audit_logs` with sufficient metadata to identify and reverse actions.

