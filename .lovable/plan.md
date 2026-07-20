
## Assumptions
- Applies to every `annual_review_instance` whose employee's department name starts with `CLU` (CLU-Operation, CLU-MECH, CLU-Elect, CLU-Inst, CLU-Refractory, CLU-RMH) — 185 rows across all statuses.
- Effective template = `template_override_id` when present, else `template_id`; only items keyed by `library_key = 'annual_production' | 'annual_pm'` are touched. Templates that don't expose them are skipped safely.
- Full weight = raw score meets the 100% threshold: Production `104% → weight (25)`, PM `100% → weight (10)`. No scoring_rules will be persisted on the template (per your choice).
- No changes to CLU templates, RLS, workflow, other departments, or any other system_score item.

## Risk & Impact
- **Data**: Overwrites two `library_key` slots per instance in `system_scores` and `system_scores_raw`. All prior values captured in `system_audit_logs` before overwrite (reversible).
- **Workflow**: Advancement / stage state untouched.
- **Completed rows**: `total_score` and `final_rating` are re-derived via the existing `annual_review_compute_final_score` SSOT (ADR-124) so downstream reports stay consistent.
- **Regression**: Zero risk to non-CLU instances — SQL is scoped by department name and by `library_key`.
- **Rollback**: single UPDATE from the audit snapshot restores prior maps.

## Diagnosis (verified pre-plan)
- `sys_3jsce5p` (Annual Production, weight 25) and `sys_2z4e0vw` (Annual PM, weight 10) exist on all CLU templates with `scoring_rules = NULL`.
- Sampled CLU-Operation (`200810`) and CLU-MECH (`201149`) rows show `system_scores_raw.sys_3jsce5p ≈ 1.0356` and `system_scores.sys_3jsce5p = 0` — a legacy fractional raw with no bands → `scoreFromRaw` clamped to 0 points.
- 185 CLU instances need backfill; ADR-123 previously handled FAD identically and left CLU untouched.

## Plan

### Step 1 — Data-only backfill migration (`20260720170000_clu_annual_production_pm_backfill.sql`)
Single transactional block:
1. Snapshot existing `system_scores` / `system_scores_raw` into `system_audit_logs` (action: `annual_review.system_score_backfill`, category: `CLU_ANNUAL_PROD_PM_V1`) — one row per instance so a per-row rollback is possible.
2. For each CLU instance where the effective template exposes `annual_production`: set `system_scores_raw[<id>] = 104` and `system_scores[<id>] = 25`.
3. For each CLU instance where the effective template exposes `annual_pm`: set `system_scores_raw[<id>] = 100` and `system_scores[<id>] = 10`.
4. For any instance already `overall_status IN ('completed','pending_dept','pending_bu_head','pending_hr_pms')` where `criteria_weighted_score IS NOT NULL`, call `public.annual_review_compute_final_score(id)` so `total_score` / `final_rating` reflect the new system total.
5. Emit a summary audit row (`annual_review.clu_prod_pm_backfill_summary`) with counts per sub-department and a list of skipped instances (templates without the slot).

### Step 2 — Verification query (bundled in the migration as `RAISE NOTICE`)
Prints per-sub-department count of updated rows, mean `system_scores.sys_annual_production`, and any residual zeros so we can eyeball the result before HR opens the app.

### Step 3 — Regression test `src/test/annualReview/cluBackfill.test.ts`
Pure TS test (no DB) that pins the SSOT: given a mock CLU instance with `annual_production` weight 25 and raw 104, `scoreFromRaw` used with the "no bands, treat as pre-scaled" contract must round up to `weight` when raw ≥ threshold — plus a locked expectation that `system_scores_raw` now stores integer percentages, not fractions.

### Step 4 — Docs
- `POLICY.md` — add §AR-CLU-ANNUAL-PROD-PM-BACKFILL noting the one-shot 104%/100% grant and the ADR link.
- `DOCUMENTATION.md` — v2.66.119 changelog entry.
- New `docs/adr/ADR-125.md` — decision + rollback SQL (`UPDATE ... FROM system_audit_logs WHERE category = 'CLU_ANNUAL_PROD_PM_V1'`).

## UI Changes
Not applicable — this is data + docs only. Existing `SystemScoresPanel` will render the new values on next load.

## Files to touch
- `supabase/migrations/20260720170000_clu_annual_production_pm_backfill.sql` (new)
- `src/test/annualReview/cluBackfill.test.ts` (new)
- `docs/adr/ADR-125.md` (new)
- `POLICY.md`, `DOCUMENTATION.md` (append)

## Post-implementation notes
- Templates keep `scoring_rules = NULL` per your instruction; future raw uploads for these two slots will still fall through the "treat raw as pre-scaled points" legacy path — flagged for a follow-up ticket if HR wants auto-grading later.
- Rollback: `SELECT * FROM system_audit_logs WHERE metadata->>'category'='CLU_ANNUAL_PROD_PM_V1'` → restore snapshotted JSON per `instance_id`.
