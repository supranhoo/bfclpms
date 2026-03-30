

## Fix: Reconciliation Function Re-Approves KPIs With Stale Post-Rollback Scores

### Root Cause (Confirmed)
The `reconcile_workflow_statuses` SQL function has two fatal flaws after a rollback:

1. **Branch 3 (Review-Stage Mismatch)**: Scans for any non-null score in downstream stages. After a rollback to `audit`, if stale `management_score` wasn't cleared (pre-fix data), Branch 3 advances status to `management_review`.
2. **Branch 2a (Terminal Stage Completed)**: On the next reconciliation pass, since `management_review` is the terminal stage and `management_score` exists, it auto-approves with `COALESCE(management_score, ...)` — picking up the stale score of 5 instead of the updated auditor score of 0.

The downstream-clearing code we added to `useKpiRollbackRequests.ts` and `UnifiedScorecard.tsx` prevents **new** rollbacks from leaving stale data. But **Piyush Bansal's Feb KPIs** were rolled back **before** the fix was deployed, so stale `management_score` values persist and the reconciler keeps re-approving them.

### Fix (3 Parts)

#### 1. Make reconciliation approval workflow-aware (SQL migration)
Replace the generic `COALESCE` chain (line 225) with terminal-stage-aware logic:

```sql
-- Instead of:
SET final_score = COALESCE(management_score, auditor_score, hr_pms_score, ...)

-- Use:
SET final_score = CASE v_terminal_stage
  WHEN 'management_review' THEN management_score
  WHEN 'audit' THEN auditor_score
  WHEN 'hr_pms_review' THEN hr_pms_score
  WHEN 'skip_level_check' THEN skip_level_score
  WHEN 'manager_check' THEN manager_score
  WHEN 'self_review' THEN self_score
  ELSE COALESCE(management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score)
END
```

Same pattern for `final_rating`.

#### 2. Add rollback-awareness to Branch 3 (Review-Stage Mismatch)
Before advancing a KPI based on a downstream score, verify the score was updated **after** the most recent rollback/send-back event for that KPI. If a rollback exists that is more recent than the score, skip the KPI:

```sql
-- In Branch 3, after finding a downstream score, check:
SELECT EXISTS (
  SELECT 1 FROM kpi_audit_logs
  WHERE kpi_id = v_kpi.kpi_id
    AND action IN ('ROLLBACK_APPROVED', 'STATUS_TRANSITION')
    AND (new_value->>'status')::text = v_kpi.current_status
    AND created_at > (
      SELECT COALESCE(MAX(rs.updated_at), '1970-01-01')
      FROM review_submissions rs WHERE rs.kpi_id = v_kpi.kpi_id
    )
) INTO v_has_recent_rollback;

IF v_has_recent_rollback THEN
  CONTINUE;  -- Skip, the downstream score is stale
END IF;
```

#### 3. Data repair — clear stale management scores for Piyush Bansal Feb KPIs
Targeted SQL UPDATE to null out `management_*` and `final_*` fields, and revert `kpis.status` to `audit` for Feb 2026 KPIs that were incorrectly re-approved by the reconciler.

```sql
-- Identify affected KPIs: Piyush Bansal Feb 2026, status=approved, 
-- with management_score but where audit logs show a rollback occurred
-- after the management score was entered.
```

#### 4. Documentation updates
- `DOCUMENTATION.md` version history
- `POLICY.md` — add invariant: reconciliation must use workflow-aware terminal score, not generic COALESCE

### Zero-Regression Safeguards

| Risk | Mitigation |
|------|-----------|
| Normal forward-flow KPIs incorrectly blocked | Branch 3 rollback check only fires if a rollback audit log exists targeting the current status AND is newer than the submission. Normal KPIs have no rollback logs → no change in behavior. |
| Terminal-stage CASE expression misses a stage | Added ELSE fallback to original COALESCE chain — if terminal stage is unrecognized, behavior is identical to current code. |
| Data repair touches wrong rows | SQL UPDATE scoped to: employee = Piyush Bansal, period = February 2026, year = 2026 only. WHERE clause includes `management_score IS NOT NULL AND status = 'approved'` plus audit log cross-check for rollback existence. |
| Reconciler becomes too conservative | The rollback-awareness check only applies to Branch 3 (mismatch). Branches 1 (orphan) and 2a (terminal scored) are unaffected for non-rollback scenarios. |
| Dec 2025 and earlier data | No data repair for Dec 2025 or earlier. Migration only changes function logic (no backfill). |
| Auto-reconcile triggered by workflow config changes | Same function — now safer. Will not re-approve KPIs with stale post-rollback scores. |

### Files Changed
| File | Action |
|------|--------|
| New SQL migration | Update `reconcile_workflow_statuses`: workflow-aware final_score sync + rollback-awareness in Branch 3 |
| Data update (insert tool) | Fix Piyush Bansal Feb 2026 KPIs: clear stale management scores, revert status |
| `DOCUMENTATION.md` | Version history |
| `POLICY.md` | New invariant |

