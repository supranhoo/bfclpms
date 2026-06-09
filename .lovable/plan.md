## Issue

Reported by **Jitendra Bharti**: when a Skip-Level Manager (SLM) requests a Rollback and an Admin approves it, the KPI disappears from the SLM's pending queue and they can no longer act on it.

## Root cause analysis

Two issues are at play, in `src/hooks/useKpiRollbackRequests.ts → useApproveRollbackRequest`:

### 1. Incomplete React-Query cache invalidation (primary, user-visible cause)

After admin approves a rollback the hook reverts `kpis.status` and clears downstream `review_submissions` fields correctly. It then invalidates only:

- `['kpis']`, `['my-kpis']`, `['review-submissions']`, `['notifications']`, `['rollback-request', kpi_id]`, `['all-rollback-requests']`, `['rollback-status-counts']`

But the reviewer grid (`EmployeeSelectorGrid` → `useKpisByPeriod`, `useAllKpis`, employee-scoped queues) is keyed under:

- `['kpis-by-period', ...]`
- `['kpis-by-period-ranges', ...]`
- `['all-kpis', user?.id]`
- `['review-submission-scores-by-kpi-ids', ...]`

None of those are invalidated. Result: in any session where the SLM/Admin is currently viewing the team-reviews grid, the SLM's queue keeps showing the pre-rollback snapshot. With `status` flipped server-side, the cached row no longer matches `resolveReviewableStatuses('skip_level')` and the KPI is **filtered out of the queue but never re-fetched**, so it visually "disappears". Hard refresh recovers it; the user doesn't know to do that.

### 2. No notification to the newly-active reviewer

Currently only the requester is notified. When the SLM requests a rollback that targets `manager_check`, the Manager becomes the new active reviewer but is not pinged. The Manager re-forwards eventually (the DB shows this happened in ~2 minutes for the Avinash / Timeliness KPI on Jun 9), but in the interim the SLM sees nothing in queue and assumes they lost access. Same applies when the requester is the SLM themselves rolling back their own stage — they should get an in-app "ready for re-review" ping rather than relying on visual refresh.

## Scope of fix

Targeted change to one file. No DB schema or RLS change. No workflow-engine change (the status-transition + clearFields logic is already correct).

### File: `src/hooks/useKpiRollbackRequests.ts`

In `useApproveRollbackRequest.onSuccess`, add the missing invalidations:

```ts
queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
queryClient.invalidateQueries({ queryKey: ['kpis-by-period-ranges'] });
queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
queryClient.invalidateQueries({ queryKey: ['review-submission-scores-by-kpi-ids'] });
queryClient.invalidateQueries({ queryKey: ['employee-kpi-stats'] });
queryClient.invalidateQueries({ queryKey: ['team-employees'] });
queryClient.invalidateQueries({ queryKey: ['sent-back-kpis'] });
```

In `useApproveRollbackRequest.mutationFn`, after the status revert and field clearing, also insert a notification for the **new active reviewer** (the user whose stage becomes active after rollback). We already know `target_status` (= the new value of `kpis.status` = last completed stage). The next stage is the active one. Resolve that and notify the employee's reporting chain owner of that stage — for the common cases:

- `target_status = 'self_review'` → notify employee (`kpis.employee_id`)
- `target_status = 'manager_check'` → notify SLM (`profiles.reporting_manager_id` of the manager)
- `target_status = 'skip_level_check'` → notify HR PMS role holders
- `target_status = 'kra_set'` → notify employee

Implementation: keep it minimal — fetch the employee profile + reporting chain, derive the next reviewer using the same helper the reviewer grid uses, insert a `notifications` row of type `rollback_active_reviewer` with title "KPI Returned for Review" and message naming the KPI. If chain lookup fails, no-op (non-blocking).

## Verification steps

1. As Admin, approve a pending rollback for an SLM-stage KPI.
2. As the SLM (different session), open Team Reviews → confirm the KPI re-appears in the Skip-Level queue within React-Query's default `staleTime` without a hard page refresh.
3. Confirm the new active reviewer receives an in-app notification.
4. Confirm `kpi_audit_logs` still records `ROLLBACK_APPROVED` exactly once.
5. Re-run the Jun-9 case (KPI `468b6d80…`): status = `manager_check`, SLM Jaspal should see it in his queue.

## Risk and impact

- **Data impact**: None. Only client-side cache invalidations + one additional `notifications` row per approval.
- **Workflow impact**: None — status transitions unchanged.
- **UI impact**: Reviewer queue refreshes correctly; new reviewer receives a bell notification.
- **Regression risk**: Low. Invalidations are additive; the notification insert is wrapped in try/catch and non-blocking.
- **Scalability**: Negligible — one extra DB insert + a few cache invalidations per admin approval (low-frequency action).
- **Rollback strategy**: Pure code change in one file; revert via chat history.

## Documentation updates

- Append a row to `mem/features/admin/rollback-request-management-system` noting the active-reviewer notification + cache invalidation contract.
- Update `DOCUMENTATION.md` "Rollback flow" section with the same.

## Tests

Extend `src/hooks/useKpiRollbackRequests` coverage (if a test file exists; otherwise add a focused one) asserting that `onSuccess` invalidates the additional query keys and that an active-reviewer notification is enqueued when `target_status` resolves to a stage with a known next reviewer.

## Out of scope (explicitly not changed)

- `resolvePreviousStatus` and the rollback target logic — verified correct against the "status = last completed stage" convention.
- RLS policies on `kpis` / `review_submissions` — SLM already has read+update rights at `manager_check` status.
- The "Request Rollback" button placement and `currentStatus` value passed by `UnifiedScorecard`.

## Open question for the user (non-blocking)

If after this fix any specific SLM still cannot see a KPI, please share the **employee name + KPI name + month** so we can inspect that row directly. The current evidence (Jun-9 Timeliness for Avinash Kumar) shows the DB state is already correct (`status = manager_check`, SLM = Jaspal) — only the stale UI cache and missing notification are blocking access.
