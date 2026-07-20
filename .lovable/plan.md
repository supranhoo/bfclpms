## The bug (verified in DB)

Ujjwal Chauhan (200408) shows **System Score = 54.00 / 50** and **Criteria = 0 / 50 → Overall 54/100**.

Template `system_scores[]` weights sum to **50** (2+2+3+4+3+3+25+8). Per-slot values persisted on the instance:

| Slot | Source | Weight | `system_scores_raw` | `system_scores` (stored) | Correct scaled points |
|---|---|---|---|---|---|
| LTI | safety | 2 | 0 | **5** | 2 |
| STI | safety | 2 | 0 | **5** | 2 |
| UA/UC/NM | safety | 3 | 21 | **5** | 3 |
| 5S | safety | 4 | 2.33 | 2 | 2 (band 2) |
| Training | hr | 3 | 9 | **5** | 3 |
| Fugitive | env | 3 | 35 | **4** | 2.4 (or 3) |
| Annual Production | manual | 25 | 98 | 20 | 20 |
| Annual PM | manual | 8 | 100 | 8 | 8 |
| **Sum** | | **50** | | **54** | **≤ 50** |

For safety/hr/env slots the map contains the **0..5 rating** instead of the weight-scaled points, so the pool over-flows its own max (54/50). Manual slots (Production, PM) are correctly scaled.

## 5 Whys

1. Why is System Score 54/50? Because per-slot values summed to 54 while the pool max is 50.
2. Why per-slot values > their weight? Safety/HR/Env slots store the 0..5 rating (e.g. LTI=5) instead of `rating/5 × weight` (LTI=2).
3. Why is rating stored where points belong? The safety/HR/env carry writers push the rating directly into `system_scores` without applying `rating/5 × weight`; the front-end assumes `system_scores[id]` is already in weight-points.
4. Why did the front-end not rescale? The template's `system_scores[]` slot has `scoring_rules.bands = []` (bands live only in the KPI Library, not copied into the template slot), so `scoreFromRaw` takes the "no bands → treat as pre-scaled points" path.
5. Why didn't a guard catch this? There is no write-path invariant `stored ≤ weight` and no read-path normaliser that rescales rating-like values into the pool. Only ADR-125 (CLU) and ADR-123 (FAD) touched the two "manual" slots, so the mismatch stayed hidden.

## Root cause (ADR-127)

Two problems compound:

- **RC-A (writer)**: safety/HR/env resolvers write the **0..5 rating** into `annual_review_instances.system_scores` while manual slots write **weight-scaled points**. There is no SSOT normaliser at the boundary.
- **RC-B (template snapshot)**: `annual_review_templates.sections.system_scores[]` snapshots `weight` but not `scoring_rules.bands`, so the client can never re-derive points from `system_scores_raw` at read time.

Result: `Σ system_scores` overflows the pool cap for every employee where a safety/HR/env slot's rating > that slot's weight (i.e. almost everyone).

## Blast radius (to be measured before we write)

Instances where `Σ values(system_scores) > Σ weight(template.system_scores)`. Read-only diagnostic first — no writes until numbers are confirmed.

## Fix plan (POLICY §AR-SYSTEM-SCORE-SCALE)

### Step 1 — Read-only diagnostic (no writes)

`SELECT ...` to count affected instances grouped by department/template, and to prove per-slot rescale = `min(weight, round(stored/5 × weight, 2))` when `stored ≤ 5` AND `weight < 5`, else `min(weight, stored)`.

**Verification**: publish the counts back in chat before Step 2.

### Step 2 — SSOT normaliser (client)

New module `src/lib/annualReview/systemScoreNormalise.ts`:

```
normaliseSystemScoreValue(stored, rawMeasurement, slot):
  if slot.scoring_rules.bands present  → scoreFromRaw(raw, rules, weight).points
  else if stored ≤ 5 AND weight < 5    → (stored / 5) * weight     // rating stored
  else                                 → min(weight, stored)        // clamp
```

Called from `SystemScoresPanel`, `AppraisalCompositionCard`, `RunningFinalScoreCard`, `EmployeeResultsView`, and `useResolvedSystemScores` so **every** surface displays the same normalised points. Add unit tests covering all three branches + Ujjwal's exact matrix.

### Step 3 — Server-side one-shot backfill (ADR-127 migration)

RPC `annual_review_normalise_system_scores(cycle_id, dry_run boolean)`:

- For each instance in the cycle, rebuild `system_scores` from `system_scores_raw` + template slot config using the same three-branch rule.
- Cap each slot at its `weight`.
- Recompute `total_score` and `final_rating` via existing `annual_review_compute_final_summary` (ADR-124) for completed / late-stage rows.
- Write an audit row per instance to `system_audit_logs` (`action='annual_review.system_scores_normalise'`, `performed_by=NULL`, metadata = before/after per slot).
- Dry-run first, then live. Only touches `system_scores`, `total_score`, `final_rating`.

### Step 4 — Write-path guard (prevent regression)

DB trigger `trg_ar_system_scores_within_weight` on `annual_review_instances` BEFORE INSERT/UPDATE: for each key in NEW.system_scores, clamp to slot weight from the resolved template; if a value looks like a 0..5 rating (`value ≤ 5 AND weight < 5 AND system_scores_raw[key] IS NOT NULL`), rescale as `(value/5)*weight`. Logged as `SYSTEM_SCORE_CLAMPED` when it fires so we can watch for offenders.

### Step 5 — Template snapshot repair (RC-B)

One-shot: for every `annual_review_templates.sections.system_scores[]` slot whose `source_kpi_id` (or matching library entry by name) has `scoring_rules.bands`, copy the bands into the slot so future edits + client rescale work uniformly. No behaviour change for slots that already have bands.

### Step 6 — Docs

- `POLICY.md` — new section §AR-SYSTEM-SCORE-SCALE (SSOT rules + write-path guard).
- `DOCUMENTATION.md` — v2.66.119 entry for ADR-127.
- New `docs/adr/ADR-127.md`.

## UI impact

- `System Scores` panel per-KPI "Contributes" numbers change for safety/HR/env slots (e.g. LTI 5.00 → 2.00). Nothing moves visually except the numbers becoming correct.
- Overall pill in `EmployeeResultsView` drops from over-inflated `54.00 / 50` to the correct value ≤ 50 (Ujjwal → 42.4 / 50).
- `RunningFinalScoreCard` and BU/Dept detail pages reflect the corrected system total.
- No layout or navigation change.

## Risk & rollback

- **Regression risk**: total_score / final_rating shift downward for completed rows with over-count. That is the correction users asked for; each change is logged in `system_audit_logs` for reversal.
- **Rollback**: the audit row includes the old `system_scores` map; a companion RPC `annual_review_revert_system_scores_normalise(instance_id)` restores the pre-migration snapshot.
- **Scalability**: RPC batches 500 instances per statement; ~2k instances → seconds. No API hot path affected.

## Tests

- Unit: three-branch normaliser (rating stored, bands present, already-scaled).
- Unit: `RunningFinalScoreCard` after normaliser wired in.
- Unit: `computeScoreComposition` uses normalised map.
- Regression: Ujjwal's exact matrix → system 42.4 / 50, criteria 0 / 50, overall 42.4 / 100.
- DB: dry-run RPC on one cycle, compare before/after counts.

## Sign-off gates

1. Post the read-only diagnostic counts in chat.
2. Ship Steps 2 (client normaliser) + 5 (template band snapshot repair) together.
3. Ship Step 3 dry-run, share results, then live backfill.
4. Ship Step 4 guard trigger last so it doesn't reject in-flight repairs.

Awaiting approval to proceed with Step 1 (diagnostic).
