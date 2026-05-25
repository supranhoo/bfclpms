
## What you're seeing

After bulk-signing the HR PMS stage, the `hr_pms_score` is written to `review_submissions`, but the KPI's `kpis.status` row doesn't move — the cell stays at the same status and the toast reports `0 advanced`. The single-cell Admin Data Entry dialog has an explicit "Advance workflow status" toggle (`AdminDataEntryDialog.tsx` L850-866) that performs this jump; the **Bulk** path has no equivalent and relies entirely on `reconcile_workflow_statuses`.

## Root cause (RCA)

`bulk_write_stage_scores` writes the stage column, then calls `reconcile_workflow_statuses(p_kpi_ids := ...)`. That reconciler advances **one stage at a time** and only via narrow branches:

1. The employees in your screenshot are still at `kra_set` (or `self_review`) because Override bypassed the prior-stage gates. When HR PMS writes `hr_pms_score` with the row still at `kra_set`:
   - **Branch 2a** (terminal → approved) requires `current_status = terminal_stage`. Not matched.
   - **Branch 2b** (scored-and-forward) explicitly excludes `kra_set` from its `IN (...)` list. Not matched.
   - **Branch 3** (review-stage mismatch) finds `hr_pms_score IS NOT NULL` and sets `next_status = hr_pms_review` — a **one-step hop**, not "approved".
2. Even when Branch 3 fires, the KPI lands on `hr_pms_review` (not `approved`) because reconcile only does one transition per call. If the workflow template's terminal is `hr_pms_review`, approval needs a second reconcile pass.
3. If the employee's workflow template actually has `audit` / `management_review` after `hr_pms_review`, HR PMS is **not** terminal for them — no amount of reconciling will approve from HR PMS, which is correct policy. We must surface this clearly instead of silently failing.

So the "stuck" symptom is the union of (a) reconcile not chaining multiple hops, and (b) no UI signal when HR PMS isn't actually the terminal stage for that employee's template.

## Risk & Impact Report

- **Data**: No schema change. `final_score` immutability (POLICY §88) is preserved — we still only finalise via the existing `final_score = <terminal>_score` write inside reconcile.
- **Workflow**: Bulk sign-off becomes equivalent to the single-cell "Advance workflow status" toggle (which already exists and is trusted). No new permission surface.
- **UI/UX**: New per-row reason `not_terminal_for_template` in the toast so admins know *why* a row didn't approve (template has stages after HR PMS).
- **Regression risk**: Medium. Reconciler changes affect all callers (Org KPI propagation, single-cell admin, query workflow). Mitigation: only add a bounded "chain until no progress, max N=workflow length" loop scoped to `p_kpi_ids` — behaviour for callers passing no `p_kpi_ids` is unchanged.
- **Scalability**: Bounded by `array_length(v_stage_keys)` per KPI (≤7). No new fan-out.
- **Rollback**: Single migration replacing two functions; revert by re-applying the previous definitions stored in `20260525134020_*.sql` and `20260520054855_*.sql`.

## Plan

### A. Backend — chain reconcile until stable (one migration)

**`reconcile_workflow_statuses`** — when `p_kpi_ids IS NOT NULL`, wrap the existing per-KPI block in a loop that re-evaluates the same KPI up to `array_length(v_stage_keys, 1)` times until `v_next_status IS NULL`. This lets a single bulk write at HR PMS walk `kra_set → … → hr_pms_review → approved` in one call when HR PMS is terminal, instead of stopping after one hop.

Also include `kra_set` in Branch 2b's `IN (...)` list so a scored stage immediately after `kra_set` (the Override case) advances cleanly instead of relying on Branch 3.

Affected rows are accumulated as separate entries per hop (preserves the existing audit shape).

### B. Backend — bulk RPC surfaces "not terminal" explicitly

**`bulk_write_stage_scores`** — after the reconcile call, for any row in `p_rows` whose KPI ended on a status `!= 'approved'` AND whose workflow template's terminal stage is **not** the acted stage (`p_stage_key`), append a `skipped` entry with reason `not_terminal_for_template` (no error — the write itself is valid). Rows that did advance to `approved` count toward `advanced` as today.

### C. Frontend — label + copy only

- **`src/lib/summariseSkipReasons.ts`**: add `not_terminal_for_template: 'workflow has stages after this one — sign-off recorded but cannot approve from here'` to `REASON_LABEL`.
- **`src/components/review/BulkApproveDialog.tsx`**: under the Override checkbox tooltip, add a one-liner: "Sign-off only approves KPIs whose template ends at the stage you're acting on. Others advance one step."

No other UI changes; the toast helper from the last turn already groups skip reasons.

### D. Tests

- **`src/lib/summariseSkipReasons.test.ts`**: add a case with `not_terminal_for_template` in the skipped array — assert the line appears verbatim.
- **`src/test/bulkWriteStageScoresContract.test.ts`**: add a regex assertion that the migration source contains `not_terminal_for_template` and a `LOOP` token inside the reconcile body.
- **No DB integration test** (would require seeded multi-stage fixtures) — covered by the contract regex + the existing reconcile dry-run path.

### E. Docs

- `DOCUMENTATION.md` → v2.66.13.16 entry: "Bulk sign-off now chains workflow transitions in one pass; non-terminal templates surfaced as `not_terminal_for_template` skip reason."
- `POLICY.md` §111.7.d: "Bulk-stage writes MUST advance the KPI to every reachable stage up to and including `approved` in the same call when scoring permits. If the acted stage is not the template terminal, status MUST advance exactly one step and the row MUST be reported under `skipped` with reason `not_terminal_for_template`."

## What stays out of scope

- No change to `final_score` write path (POLICY §88 untouched).
- No change to override semantics — Override still only writes the selected stage's column.
- No change to single-cell `AdminDataEntryDialog` (its toggle already chains via its own RPC path).
- No change to mgmt approve branch.

## Verification after build

1. From your screenshot's filter, run the same bulk sign-off — toast should now read `Signed off — 4 advanced` (assuming HR PMS is terminal for those 4 employees) instead of `0 advanced`.
2. For an employee whose template has `audit` after `hr_pms_review`, the same action should land them on `hr_pms_review` and report 1 row under `not_terminal_for_template` with the new label.
3. `bun vitest run src/lib/summariseSkipReasons.test.ts src/test/bulkWriteStageScoresContract.test.ts` passes.
