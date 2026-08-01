# Fix: July Org KPI rollback blocked ("No propagated scopes")

## What went wrong

The data owner uploaded July 2026 values for the Training-Hours Org KPIs and asked for a revert. "Rollback All Scopes" fails with *"No propagated scopes to bulk-roll-back for this period"*.

Verified current state in the database:

- `org_kpi_values` for these July KPIs: **11 department rows, all in `draft`, value already cleared**.
- Employee scorecards still carry the wrong July value:
  - "Completion of Mandated Average Training Hours": 17 at self-review, 9 at manager-check.
  - "Completion of Mandated Training Hours": 47 at self-review, 10 at manager-check, 2 residual at KRA-set.

So the master rows were already reset, but the child scorecards were not. The bulk rollback only looks for master rows in `propagated`/`approved` state — none exist — so it aborts before touching a single scorecard. The card still shows "Propagated" because that badge is inferred from the child scorecards (ADR-055 fact-based status). Master truth and child truth have diverged; the rollback tool can only read the master.

## Root cause (5 Why)

1. Rollback fails → no master rows in propagated/approved state.
2. Why? A prior partial action reset the master rows to `draft` without clearing the children.
3. Why did that leave children behind? The bulk rollback derives its work list from `org_kpi_values`, not from the actual propagated child KPIs.
4. Why? Original design assumed master and child always move together.
5. Why is that wrong? Propagation, individual rollback, repair-gap and reviewer advancement can each move one side independently — there is no invariant enforcing the pair.

## Fix

**1. New child-truth rollback RPC** (`rollback_org_kpi_propagation_by_children`), admin/data-owner gated, SECURITY DEFINER:

- Work list is built from `kpis` where `is_org_level = true` and KRA + KPI + period + year match — independent of master status.
- Clears `review_submissions` (achieved value, self score, self rating) for those KPIs.
- Steps the KPI back to `kra_set`, including cells already at `manager_check` (admin-forced, as requested) — reviewer scores on those cells are cleared and this is stated explicitly in the confirm dialog.
- Cells at `approved` or beyond are **not** touched (frozen final scores stay immutable); they are returned in a `skipped` list and shown to the admin.
- Resets any matching `org_kpi_values` rows to `pending` with a null value.
- Writes one `org_kpi_data_entry_logs` audit row per scope (`action = 'bulk_rollback_children'`) plus one summary row, and notifies the data owners and every affected reviewer.
- Everything runs in a single transaction, so a partial state like today's cannot recur.

**2. Button gating** — "Rollback All Scopes" becomes enabled when *either* master rows are propagated/approved *or* child scorecards are past `kra_set`, so the button and the action can no longer disagree.

**3. Confirm dialog** — shows exact counts before committing: scopes reset, scorecards cleared, of which N already manager-reviewed, and M skipped as approved.

**4. Reconciliation check** — a read-only diagnostic that lists Org KPIs where master status and child status disagree, surfaced in the existing admin diagnostics block on the Org KPI Data Entry page.

## Impact & risk

- Data: only July 2026 rows for the two KPIs the admin selects; approved/frozen cells untouched; full audit trail; the pre-change values are recorded in the audit log so the state can be reconstructed.
- Workflow: 19 manager-check cells return to KRA-set and must be re-entered and re-reviewed — this is the intended outcome of the revert.
- Regression risk: low. New RPC, existing single-scope rollback untouched; only the bulk button's enable condition changes.
- Rollback of the fix itself: drop the new RPC and revert the gate helper; no schema change.

## Technical notes

- Migration: `rollback_org_kpi_propagation_by_children(p_kra_name, p_kpi_name, p_review_period, p_review_year, p_reason)` returning `{scopes_reset, scorecards_cleared, manager_stage_cleared, skipped_approved}`; `GRANT EXECUTE ... TO authenticated`, authorization checked inside.
- Frontend: `useBulkRollbackOrgKpiPropagation` calls the RPC instead of the multi-step client writes; `hasBulkRollbackTarget` in `src/lib/orgKpiStatus.ts` extended with the child-truth branch.
- Tests: extend `src/test/bulkRollbackOrgKpiPropagation.test.ts` with the draft-master/advanced-children case, the approved-skip case, and the manager-check-forced case; static contract test for the new RPC (SECURITY DEFINER, locked search_path, role gate, approved exclusion).
- Docs: ADR-227 plus POLICY entry §ORG-KPI-ROLLBACK-CHILD-TRUTH; DOCUMENTATION.md version history updated.

## Execution order

1. Migration (RPC) → 2. hook + gate helper → 3. dialog copy and counts → 4. tests → 5. ADR/POLICY/docs → 6. run the revert for the two July KPIs and report the resulting counts.
