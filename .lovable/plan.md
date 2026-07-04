## Root cause

Two independent server-side defects — the previous frontend patch only masked #1:

1. **`weighted_score` is never computed on submit.** `advance_annual_review_status` locks the response row (`is_locked=true`, `submitted_at=now()`) but never derives `weighted_score` from `criteria_scores × template.criteria.weight`. Any client-side "compute and upsert before advance" is a workaround — it depends on the frontend behaving correctly, breaks for admin/proxy submissions, and leaves historical rows (like `test003`) with `NULL`.
2. **`block_when_annual_cycle_closed` trigger references `NEW.employee_id` unconditionally.** The guard `TG_TABLE_NAME='annual_review_instances' AND TG_OP='UPDATE' AND NEW.employee_id = v_caller` is a single SQL expression sent to SPI; Postgres does not short-circuit AND across record-field lookups, so when the trigger fires on `annual_review_responses` it errors with `record "new" has no field "employee_id"`. This blocks all non-admin/HR updates to responses — including any future backfill or admin correction.

## Fix (server-side, SSOT)

### A. Compute `weighted_score` in the RPC

Add SSOT PL/pgSQL helper `public.compute_annual_review_weighted_score(instance_id, reviewer_role) → numeric`:

- Reads the response's `criteria_scores` and the template's `sections->'criteria'` (id + weight).
- Returns `Σ (weight_i × score_i)` for criteria that (a) exist on the template, (b) list `reviewer_role` in their `reviewer_stages`, (c) have a numeric score in `criteria_scores`.
- Mirrors `src/lib/annualReview/scoring.ts::computeCriteriaScore` exactly, so client and server agree.

Modify `advance_annual_review_status` to call the helper and persist the result in the same `UPDATE` that sets `is_locked`/`submitted_at`. This makes the score authoritative regardless of client path (self, reviewer, admin, proxy, bulk).

### B. Fix the trigger bug

Rewrite `block_when_annual_cycle_closed` so the responses branch never touches `NEW.employee_id`:

```text
IF TG_TABLE_NAME = 'annual_review_instances' THEN
  -- existing acknowledgment exemption + cycle lookup on NEW.cycle_id
ELSE
  -- responses: look up cycle via instance_id, no NEW.employee_id access
END IF;
```

Behavior otherwise unchanged (admin/HR bypass, closed-cycle block, acknowledgment exemption).

### C. Backfill existing rows

One-time `UPDATE` inside the migration that recomputes `weighted_score` for every response where `is_locked = true AND weighted_score IS NULL`, using the new helper. Fixes `test003` and any other historical gaps without manual intervention.

### D. Revert the frontend workaround

Remove the direct `svc.upsertResponseDraft({ weighted_score })` calls added in the previous turn from:
- `src/pages/annual-review/EmployeeAnnualReview.tsx`
- `src/components/annual-review/TeamReviewDetailContent.tsx`

Keep the existing `flush()` (persists criteria_scores) and `advance.mutateAsync()`. The RPC now handles the score. Also drop the `arSvc` / `computeCriteriaScore` imports that become unused.

### E. Tests + docs

- New `src/test/annualReview/computeWeightedScoreRpc.test.ts` — asserts that after `advance('self')` the response row has the expected `weighted_score` (uses seeded template + response fixture).
- Update `src/lib/annualReview/scoring.test.ts` to include a parity note: TS and SQL implementations use the same formula.
- `DOCUMENTATION.md` §Annual Review — document that `weighted_score` is server-computed on advance; clients no longer need to send it.
- `POLICY.md` §AR-WEIGHTED-SCORE — SSOT rule: reviewer weighted score is derived by the database on stage advance and is immutable thereafter (only recomputed if send-back reopens the stage).
- `mem/features/annual-review/overview.md` — note the RPC responsibility change.

## Risk & impact

- **Data:** additive. One backfill UPDATE gated to `weighted_score IS NULL`. No column changes.
- **Workflow:** unchanged — same advance semantics, just fills a previously-null column.
- **UI:** admin Progress grid + `RunningFinalScoreCard` + `computeFinalScore` start reading real numbers where they saw `—`. No layout change.
- **Regression:** the previous turn's client compute is removed; server compute is the only writer, eliminating drift.
- **Rollback:** migration is reversible (drop helper + restore prior RPC body); `weighted_score` values would remain but be recomputed on next advance.

## Files touched

Migration (single call):
- `CREATE OR REPLACE FUNCTION public.compute_annual_review_weighted_score`
- `CREATE OR REPLACE FUNCTION public.advance_annual_review_status` (call helper in the lock UPDATE)
- `CREATE OR REPLACE FUNCTION public.block_when_annual_cycle_closed` (guard NEW.employee_id)
- Backfill `UPDATE public.annual_review_responses SET weighted_score = ... WHERE is_locked AND weighted_score IS NULL`

Code:
- Revert `src/pages/annual-review/EmployeeAnnualReview.tsx`
- Revert `src/components/annual-review/TeamReviewDetailContent.tsx`
- Add `src/test/annualReview/computeWeightedScoreRpc.test.ts`
- Update `DOCUMENTATION.md`, `POLICY.md`, `mem/features/annual-review/overview.md`
