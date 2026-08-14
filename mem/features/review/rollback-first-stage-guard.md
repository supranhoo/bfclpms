---
name: Rollback first-stage guard
description: KPI rollback requests are only valid from a stage with a predecessor; hide the action at kra_set (ADR-257)
type: feature
---
ADR-257 / POLICY §KPI-ROLLBACK-FIRST-STAGE-GUARD.

- SSOT: `src/lib/rollbackEligibility.ts` — `isFirstWorkflowStage`, `canRequestRollback`, `FIRST_STAGE_ROLLBACK_MESSAGE`. Prefers the KPI's resolved workflow stages, falls back to the canonical status list.
- Never offer "Request Rollback" at the first stage (usually `kra_set`) — an admin full reset / send-back already IS the rollback outcome. Applies to `UnifiedScorecard`, `SelfReviewSheet`, and `RollbackRequestDialog` (re-validates on submit).
- Never surface "Cannot determine rollback target status" to users.
- First-stage KPI with no prior submission shows "Awaiting your self-review for <period>" so an editable row is not mistaken for locked.
