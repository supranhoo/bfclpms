# Sync monthly KRA/KPI changes into the Annual Review

## Assumptions
- "Monthly scorecard changes via process" = approved KPI score edits, rollbacks and re-scores made after the annual review forms were already completed.
- Target cycle: **Annual Review - 2025-2026** (FY Jul-2025 - Jun-2026), currently active.

## The feature already exists (ADR-161 - KRA Score Rehydrate)
- Annual review templates can carry a **System Score slot with `source = 'carry_kra'`**. That slot pulls the employee's month-wise approved KPI ratings for the fiscal year, aggregates them to a 0-5 rating, and scales it into appraisal points `(rating / 5) x slot weight`.
- The scores stored on a completed instance are a **snapshot**, not a live lookup (deliberate - HR audit immutability). So later monthly KPI corrections do NOT flow in automatically.
- The re-sync tool is `annual_review_rehydrate_kra_for_cycle(cycle, mode, reason, instances?)`, exposed in the UI as the **KRA Score Rehydrate** card, currently mounted inside **Annual Review Admin -> Access Control tab**.
- It supports `dry_run` (writes a diff preview, changes nothing) and `apply` (writes new system_scores, total_score, final_rating, storing a full pre-image), plus `annual_review_rollback_kra_rehydrate_run(run_id, reason)` for a one-click undo.

## Current state found in the data
- 2,086 completed instances in the cycle; **137 use a KRA (`carry_kra`) template** - only those are affected by monthly KPI changes.
- Only **one run has ever been executed**: a `dry_run` on 26 Jul 2026 covering 135 instances, showing **14 changed** - it was never applied.
- Since that dry run, ~1,870 `review_submissions` rows have been updated (27 Jul - 3 Aug), so the current drift is larger than 14 and unmeasured.

## Plan

### 1. Measure current drift
Run a fresh `dry_run` for the 2025-26 cycle and review the diff table: per employee old vs new total, delta, and whether the rating band changed.

### 2. Review and apply
Present the changed rows (band changes first). After sign-off, run `apply` with a reason. Every applied run keeps its pre-image, so it can be rolled back from the same card.

### 3. Make it discoverable and safer (UI work)
- Move the KRA Score Rehydrate card out of the Access Control tab into its own **"KRA Sync"** section in Annual Review Admin, with a short explainer of snapshot-vs-live behaviour.
- Add a **drift indicator**: per cycle, show the date of the last applied run and how many KRA instances have underlying monthly KPI data changed since then, so admins know when a re-sync is due.
- Show a per-instance hint on the review form's System Scores card when the stored carry_kra value differs from the live recomputation ("Monthly KPI data changed since this was finalised").

### 4. Close the coverage gaps
- Extend the rehydrate loop to also cover **in-flight** instances (it currently filters `overall_status = 'completed'` only) so an updated monthly score reaches reviewers who have not yet submitted.
- Non-KRA (criteria-scored) templates stay untouched - monthly KPI data does not feed them.

### 5. Documentation and tests
- Unit tests for the drift-detection helper (changed / unchanged / no-KPI-data cases).
- Update `DOCUMENTATION.md` and `POLICY.md` section AR-KRA-REHYDRATE with the drift indicator and in-flight coverage.

## Risk and impact
- **Data:** Apply mutates `system_scores`, `total_score`, `final_rating` on completed reviews. Mitigated by mandatory dry-run first, stored pre-image, and rollback RPC.
- **Workflow:** Rating band changes can move an employee's increment slab; the diff highlights those rows before apply.
- **Regression:** Bell Curve, heat map and the Annual Review report read the same stored values, so they update consistently after apply.
- **Rollback:** `annual_review_rollback_kra_rehydrate_run(run_id, reason)`.

## Open question
Should the apply run for 2025-26 happen in this same pass, or should the UI work land first and HR trigger the apply from the console?