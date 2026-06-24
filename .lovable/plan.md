## Your read is partially correct

You are right that the UI doesn't model the two-tier blend (System pool vs Criteria pool, then split inside Criteria across reviewers). But the underlying math is currently a **single flat blend** across all buckets (`self`, `manager`, `dept_head`, `bu_head`, `hr`, `system`, `criteria`) where every weight is taken directly against 100.

That means today, to express "System 60% / Criteria 40%, and within the 40 split Self 0 / Dept Head 28 / BU Head 12" you must hand-compute the nested products and enter `system=60, dept_head=28, bu_head=12, self=0`. The math result is correct — but:

1. Admins have to do the multiplication themselves (40% × 70% = 28). Error-prone.
2. There is no visible "Criteria pool = 40%" anchor — if BU split changes from 30→40, the admin has to re-derive 4 numbers instead of editing one.
3. Self-review is not visually pinned to zero; it is just "happens to be 0".
4. The label `criteria` exists only as a legacy single-bucket fallback — it is not the "Criteria pool" you mean.

So the engine is mathematically capable, but the **configuration model is mismatched** with how the policy is actually written ("System 60 / Criteria 40, then split Criteria among reviewers").

## Proposed correction: two-tier weights with derived flat blend

Introduce an explicit **Criteria reviewer mix** layer. Keep the existing flat `StageWeights` as the SSOT for the math (so DB triggers, exports, finalisation RPC do **not** change), but compute it from a clearer two-tier admin input.

### New template config shape (additive, backward compatible)

```text
sections.stage_weights_v2 = {
  pools: { system: 60, criteria: 40 },           // must sum to 100
  criteria_mix: { self: 0, dept_head: 70, bu_head: 30 }  // must sum to 100
}
```

Resolution order:
1. If `stage_weights_v2` present and valid → derive flat `stage_weights`:
   `system = pools.system`
   `<role> = pools.criteria × criteria_mix[<role>] / 100`  for each role in the mix
2. Else fall back to existing `stage_weights` (current behaviour, no regression).
3. Else legacy `{ criteria: 100 }`.

The derived flat map is what feeds `computeFinalScore` and the PL/pgSQL mirror. **No engine change needed.**

### UI changes (Template editor + per-instance override + bulk dialog)

Replace the single `StageWeightsEditor` card with a two-section card:

- **Section A — Outer pools**
  - `System score (%)` input
  - `Criteria score (%)` input
  - Live total badge "Must equal 100%"
- **Section B — Criteria reviewer mix (% of the Criteria pool)**
  - `Self review (%)` — defaults to 0, can be pinned to 0 with a "Exclude self" switch
  - `Manager / R1 (%)`
  - `Skip manager (%)`
  - `Department head (%)`
  - `BU head (%)`
  - `HR (%)`
  - Live total badge "Must equal 100% of criteria pool"
- **Derived blend preview** (read-only): shows the computed flat weights ("System 60, Dept Head 28, BU Head 12, Self 0") and the resolved 0–100 sanity total.
- Preset buttons:
  - `60 / 40 — Self 0, Dept 70, BU 30` (your current case)
  - `Use legacy (Criteria 100%)`
- Backwards-compat: an "Advanced (flat weights)" disclosure still exposes the existing flat editor for any pre-existing templates.

### Files to change

- `src/types/annualReview.ts` — add `StageWeightsV2` type.
- `src/lib/annualReview/finalScore.ts` — add `resolveStageWeightsV2()` and `flattenStageWeightsV2()`; `resolveStageWeights` first tries v2, then existing path. Engine unchanged.
- `src/components/annual-review/StageWeightsEditor.tsx` — split into `<PoolsEditor />` + `<CriteriaMixEditor />` + derived-preview footer; keep flat editor under "Advanced".
- `src/components/annual-review/TemplateEditorDialog.tsx` — store `stage_weights_v2` alongside `stage_weights` (write both: v2 as source of truth, flat as derived snapshot for legacy readers and SQL).
- `src/components/annual-review/InstanceStageWeightsDialog.tsx` and `BulkStageWeightsAssignmentDialog.tsx` — same two-tier editor; same dual-write.
- `src/components/annual-review/HrFinalizationSheet.tsx` and `RecentStageWeightOverridesPanel.tsx` — display two-tier summary when v2 is present, flat otherwise.
- DB: **no schema change** — `sections` is already JSONB, `stage_weights_v2` lives alongside `stage_weights`. The PL/pgSQL `annual_review_compute_final_score` keeps reading the flat `stage_weights` (which we always write as the derived snapshot). Optional follow-up migration: have the SQL validator accept v2 and re-derive server-side; out of scope for this round.

### Tests

- `finalScore.test.ts`:
  - `flattenStageWeightsV2` — 60/40 with self 0 / dept 70 / bu 30 → `{ system: 60, dept_head: 28, bu_head: 12, self: 0 }`
  - Invalid v2 (mix doesn't sum to 100) → falls through to flat
  - v2 with `self: 0` and missing self response → no renormalisation gives self any weight (already guaranteed by engine; regression-locked)
  - End-to-end `computeFinalScore` with v2-derived weights produces the same number as hand-entered flat weights
- `StageWeightsEditor` component test: editing pools/mix updates the derived preview; "Exclude self" pins self mix to 0 and disables the input.

### Documentation + Policy

- `DOCUMENTATION.md` — add "Two-tier final score weights (v2)" section; show resolution order and dual-write contract.
- `POLICY.md` — codify: "Self-review contributes to feedback only and may carry 0% in the final score. The Criteria pool is split across active reviewers per template; weights must sum to 100% of the pool."
- Version-history entries in both.

### Risk & rollback

- Risk: low. v2 is additive JSON; flat weights remain the canonical input to the math engine.
- Rollback: delete the `stage_weights_v2` key from `sections`; the editor falls back to flat mode; no data corruption possible.
- No migration; existing templates keep working unchanged until an admin opens and re-saves them.

## Confirm before I build

1. Pools always exactly `{ system, criteria }`, or do you also want an explicit `system_pool / criteria_pool / hr_pool` three-way (e.g., HR finalisation as its own pool outside criteria)?
2. Should `self` be allowed any non-zero value in `criteria_mix`, or pinned to 0 platform-wide (policy)?
3. Keep the "Advanced (flat weights)" escape hatch, or remove it once v2 ships?