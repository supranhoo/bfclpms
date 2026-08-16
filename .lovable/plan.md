# Console: higher stage supersedes lower (reuse the Bulk Review rule)

## What you asked for

In Bulk Review, a reviewer who sits higher in the chain can act on a row that is still
sitting at a lower stage: the higher sign-off carries the lower scores forward and the
skipped stages are closed out in the same action. The Performance Console does not do
this today — its worksheet only accepts a move to the *immediately next* stage, so any
row waiting further back is refused with "Not waiting at this stage right now".

## Current behaviour (verified)

- `bu_console_kpi_advance` computes the employee's resolved workflow, takes the stage
  right after the KPI's current status, and skips the row with `stage_mismatch` unless
  that next stage equals the requested one. It never inherits a score; a row with no
  score is skipped as `not_scored`.
- `bulk_write_stage_scores` already implements the rule you want: an inheritance cascade
  (manager <- self, skip <- manager/self, HR PMS <- skip/manager/self, auditor <-
  HR PMS/skip/manager/self, then compute-from-achievement), an explicit
  `auditor_takes_precedence` guard for HR PMS, and forward reconciliation of the KPI
  status so the intermediate stages are closed, not left dangling.
- Final-score immutability (`final_locked`) and the KRA-Set admin-only gate already hold
  on both paths and stay untouched.

## The change

Make the console worksheet use the same supersede semantics instead of a private, stricter
rule.

1. **Server** — extend `bu_console_kpi_advance` so a requested target stage that is
   *downstream* of the row's current position is accepted, not skipped:
   - resolve the employee's chain via `get_employee_workflow` (as now, no hardcoded ladder);
   - allow the move when the target stage index is greater than the current status index —
     `stage_mismatch` then only fires for a *backwards* target;
   - for each stage being leapfrogged, carry the score forward with the same cascade used by
     `bulk_write_stage_scores` (reuse it rather than re-implement: the console RPC composes
     the existing sign-off so there is one scoring SSOT), recording `inherited_from`;
   - keep every existing skip reason: `final_score_locked`, `kra_set_admin_only`,
     `no_submission`, `no_workflow`, `terminal_stage`, `final_approval_not_supported`,
     plus a new `auditor_takes_precedence` mirrored from the bulk rule;
   - the dry-run preview reports, per row, which stages will be superseded, so the
     confirmation shows "12 rows, 5 of them skipping Manager check" before commit.

2. **Who may supersede** — unchanged tiers: `bu_console_can_write` (admin, management,
   auditor) plus `bu_console_kpi_actionable` (management/audit only past KRA Set). The
   supersede right is *not* a widening: it only removes the artificial "must be exactly
   next" restriction for a stage the actor is already allowed to sign.

3. **Worksheet UI** (`KraWorksheet.tsx` + `StageRail.tsx`) — when a stage is selected on the
   rail, the grid also shows rows waiting at earlier stages of the same chain, marked
   "waiting at Manager check — you can sign above it". Selecting them is allowed; the batch
   bar states plainly how many rows will be superseded, and the remark box (min 10 chars,
   as in bulk) is required for that batch.

4. **Audit** — every superseded stage writes its own `kpi_audit_logs` entry with the acting
   user, the source stage it inherited from, and the batch id, so the timeline reads the same
   as a bulk sign-off. No silent stage collapse.

## Technical notes

- Files: `bu_console_kpi_advance` (migration), `src/hooks/useBuConsoleRun.ts` (new skip
  reasons + preview shape), `src/components/admin/bu-console/KraWorksheet.tsx`,
  `StageRail.tsx`, `pipelineStages.ts` (already the stage-order SSOT).
- New pure module `src/lib/review/supersedeChain.ts` — given a chain, a current status and a
  target stage, returns the stages being superseded and the inheritance source per stage.
  Unit-tested against the same cases as the bulk cascade; the RPC and the UI both read it
  (UI for labels, server for the authoritative decision).
- No schema change, no new table, no grant change. Rollback = one revert of the RPC to the
  strict-next-stage body; no data migration.
- Docs in the same change: ADR-290, `DOCUMENTATION.md`, POLICY §CONSOLE-STAGE-SUPERSEDE
  cross-referencing §111.7.a so the two surfaces are stated to share one rule.

## Two decisions

1. **Can a higher stage supersede a row that has not been self-submitted yet?** Bulk refuses
   it (`self_not_submitted`). I recommend the console refuse it too — the employee's own
   input is never invented.
2. **Backwards targets** stay refused (that is what Rollback Requests are for), so this is a
   forward-only leap. Say the word if you want the console to also step rows back.
