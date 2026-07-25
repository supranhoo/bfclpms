
## Assumptions
- "Self is blank" refers to Balram's completed review showing Self weighted_score = 0.00 (and, in the reviewer chip strip, Dept/BU chips showing "–" against current criteria). Instance `367cf7d5-fc19-474b-a1e8-82cf71eca3e2`, template `af2a2c7c…577cf`.

## Verified evidence (pre-plan reads)
- Current template criteria IDs: `attendance, safety, quality, crit_ukam6hl, crit_aq5q1i3, crit_2ml1mrv, crit_bf0f3gb, crit_59r9kio, crit_8clrq1o, crit_nerrw2u`.
- `annual_review_responses` for the instance:
  - `self` — `weighted_score = 0.00`, `criteria_scores` keys match the **current** template IDs exactly (all 5s).
  - `dept_head` / `bu_head` — `weighted_score = 375.00`, `criteria_scores` keys are a completely different set (`crit_2j29x46, crit_3vxqmh0, …`) that **do not exist** in the current template.
- Instance is `completed`, `total_score = 89`, `criteria_weighted_score = 375` (i.e. only Dept/BU contributed; Self was never recomputed).
- UI reads `values[criterion.id]` in `CriteriaScoringMatrix` and `computeCriteriaScore(criteria, criteria_scores)` in `ManagerCalibration`/`scoring.ts`. Anything using the stored `weighted_score` on the row renders 0 for Self.

## 5 Whys (Balram case)
1. Why is Self blank? Self's stored `weighted_score` is `0.00`, so any tile that reads the persisted field renders 0/blank.
2. Why is `weighted_score` 0 when `criteria_scores` has all 5s? The recompute path (`advance_annual_review_status` / `compute_annual_review_weighted_score`) was not re-run for the `self` row after Self was re-entered under the new template.
3. Why did Self get re-entered while Dept/BU keys are stale? The template was swapped **after** Dept/BU had locked their responses. Self was re-hydrated against the new template criterion IDs; Dept/BU responses were left with their old criterion IDs and never remapped.
4. Why weren't Dept/BU remapped? `remap_annual_review_criteria_scores` (ADR-122) was not invoked for this instance on the template swap, and no trigger runs it automatically.
5. Why was a template swap allowed after locked responses existed? ADR-117 blocks `template_id` updates only on rows that already have an **override**. A direct swap on the instance (or a clear-and-reapply override, as done for 200414) bypasses the recompute + remap invariant.

## Root Cause
Template-swap on an instance with locked responses left two invariants broken for this instance:
1. Dept/BU `criteria_scores` still keyed by the **old** criterion IDs → chips render `–` against current template.
2. Self `weighted_score` never re-derived after the swap → tile renders 0.

## Risk & Impact Report
- **Data Impact**: Repair rewrites `criteria_scores` keys on 2 locked response rows and recomputes `weighted_score` on 1 self row; `total_score` / `criteria_weighted_score` on the instance will be recomputed. Additive, reversible (see rollback).
- **Workflow Impact**: None. Instance stays `completed`; no stage regression.
- **UI/UX Impact**: Self tile shows a real number; Dept/BU comparison chips populate. No layout change.
- **Regression Risk**: Low if we scope the remap to instances with detected key-orphans. Blast radius must be measured before running system-wide.
- **Scalability Impact**: Scan is one CTE over `annual_review_responses`; O(N) once. Cap batch to 500 per run.
- **Mitigation**: Dry-run report first; write a repair audit row per instance; keep raw pre-repair JSON in `annual_review_reset_archive`-style audit.

## CAPA — Plan

### Corrective (Balram — targeted repair)
1. Snapshot current `criteria_scores` + `weighted_score` for the 3 responses into an audit row (`annual_review_rescore_audit_2026_07`).
2. Call `remap_annual_review_criteria_scores(instance_id, template_id)` (ADR-122) for `dept_head` and `bu_head` — carry old scores onto the current criterion IDs by matching name/order.
3. Recompute `weighted_score` for `self`, `dept_head`, `bu_head` via `compute_annual_review_weighted_score`.
4. Recompute instance `criteria_weighted_score`, `total_score`, `final_rating` (do **not** touch `final_score` if immutable per POLICY §FINAL-SCORE-IMMUTABLE — write a report showing before/after and only overwrite with explicit admin confirmation).

### Preventive (system-wide)
1. **Scanner RPC** `find_orphan_criteria_scores(cycle_id)`: return every instance where any response's `criteria_scores` keys ⊄ current template criterion IDs, plus a diff summary (missing keys, unmapped keys).
2. **Auto-remap on template change** — new trigger `on_instance_template_change_remap`:
   - Fires `AFTER UPDATE OF template_id ON annual_review_instances`.
   - For each existing response, runs `remap_annual_review_criteria_scores` and then `compute_annual_review_weighted_score`.
   - Writes an audit row per response (pre/post JSON).
3. **Guard the swap** — extend ADR-117 trigger to also block direct `template_id` updates on instances with any locked response unless the caller sets `p_admin_override := true`; when override is used, the auto-remap trigger above must run in the same tx.
4. **Self recompute on hydrate** — `hydrate_annual_review_system_scores` and the ADR-116 remap path must always re-run `compute_annual_review_weighted_score` for `self` when self criteria_scores change.
5. **Admin UI surface** — add an "Orphan criteria scan" card in Annual Review Admin → Diagnostics with dry-run counts and a "Remap & recompute" button (per-instance and bulk-by-cycle). Gate behind admin role + confirmation dialog.

### Verification
- Unit tests
  - `remap_annual_review_criteria_scores` maps by name when IDs differ; leaves scores untouched when IDs already match.
  - Template-change trigger writes audit and updates all 3 stages; idempotent on re-run.
  - Scanner RPC classifies (a) fully-orphan, (b) partial-orphan, (c) clean.
- Mock data
  - Instance A: swap only, no locked responses → no change.
  - Instance B: locked responses under old IDs → remap + recompute.
  - Instance C: mixed self-new / dept-old (Balram shape) → both branches exercised.
- Manual
  - Re-open Balram's review; confirm Self tile shows a real value and Dept/BU chips populate for every criterion.

### Rollback
- Every write is preceded by an audit snapshot; a rollback RPC restores `criteria_scores` + `weighted_score` from the snapshot and re-derives instance totals.

## SSOT updates
- **POLICY.md** — add §AR-TEMPLATE-SWAP-REMAP-INVARIANT: "Any change to `annual_review_instances.template_id` on an instance with locked responses must (a) run `remap_annual_review_criteria_scores` for every response, and (b) recompute `weighted_score` for every response and the instance totals, in the same transaction."
- **DOCUMENTATION.md** — add ADR-166 (Template Swap Remap Invariant) with the scanner, trigger, guard, and admin diagnostics surface; link ADR-116, ADR-117, ADR-122.

## Deliverables
1. Migration: scanner RPC, auto-remap trigger, guard extension, audit table.
2. Targeted repair migration for instance `367cf7d5…eca3e2`.
3. Admin Diagnostics card (`AnnualReviewAdmin.tsx` → Diagnostics tab) with dry-run + repair.
4. Tests + mock data listed above.
5. POLICY.md + DOCUMENTATION.md updates.

## Post-implementation notes
Run the scanner first and share the impacted-instance list before executing bulk repair — some instances may need admin judgment (e.g., name changes across template versions that don't match cleanly).
