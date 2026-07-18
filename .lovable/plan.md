
## Assumptions
- "Reset" = `force_reset_annual_review_instance` RPC (confirmed in audit log for instance `422f7062…`, action `annual_review.instance_force_reset` at 2026-07-18 03:44 UTC, prior template `a6e88cd5` → new `0a815c39`).
- "System Scores data vanished" refers to the two System Score cards (`Departmental Status of 5S`, `Traiining Attended`) showing `0.00 / 5` after reset.

## Verified current state
- Nikunj's instance now uses template override `0a815c39` (Generic M - Support function without KRA). That template has 2 system-score items: `sys_rkb6lnd` (source=`safety`, weight 5) and `sys_zg03c3h` (source=`hr`, weight 5). Both are **raw-input KPIs**: HR must enter a raw number via `SystemScoresUploadDialog`, which the migration `20260707132102` bands into `system_scores`.
- On the instance row: `system_scores = {}` and `system_scores_raw = {}` — no raw values have ever been entered against the *new* template's item IDs (`sys_rkb6lnd`, `sys_zg03c3h`).
- Prior template `a6e88cd5` had a single carry_kra item `sys_bgd6797` (weight 100). Its persisted map was also empty — carry_kra items compute live and don't need persisted raw.
- `force_reset_annual_review_instance` (verified via `pg_get_functiondef`) explicitly clears `criteria_weighted_score`, `total_score`, `final_rating`, responses and proxy rows — but does **NOT** touch `system_scores` or `system_scores_raw`, and does **NOT** carry over library-keyed raw values.

## Root Cause (RCA)
The System-Score cards render **template-item IDs**, not stable library keys. When the template is swapped by force-reset:
1. Old raw values (keyed by old template's `sys_XXX` IDs) become orphaned relative to the new template's item IDs.
2. The reset RPC does not re-key or migrate `system_scores_raw` across templates, and does not warn HR that new raw entry is required.
3. For source ∈ {`safety`,`hr`,`env`,`manual`} items, no live overlay hook exists (unlike `carry_kra` in `useResolvedSystemScores`), so an empty `system_scores` map falls straight to `0.00`.
4. HR has no prompt/task after a template swap that the raw values must be re-entered, so scores silently show as 0.

## 5-Why
1. Why 0.00? Persisted `system_scores` map is empty.
2. Why empty? Raw values not entered under the new template's item IDs.
3. Why not carried over? Reset RPC swaps template but doesn't remap raw values.
4. Why can't they be remapped? Raw values keyed by template-specific `sys_XXX` IDs, not by stable `library_key` (which we already store on each system-score item).
5. Why did this design ship? The `carry_kra` overlay solved the display side for KRA-sourced items; the `safety`/`hr`/`env`/`manual` path was assumed to be re-entered manually after any template change and no key stability was enforced.

## Systemic impact (verified via SQL)
- Total AR instances: 2,580
- Instances whose current template requires raw entry: 2,411
- Instances with template requiring raw entry but `system_scores_raw = {}`: **235**
- Force-reset instances with empty raw after swap: **2** (Nikunj is one)
- The bug affects any employee whose template was force-reset (60 to date) OR whose template was changed via override, whenever the new template has safety/hr/env/manual system-score items.

## Risk & Impact Report
- **Data impact:** Additive backfill of `system_scores_raw` / `system_scores` from `library_key` matches. No destructive writes; original raw values preserved in the reset archive `wiped_responses` are unrelated (raw isn't stored there).
- **Workflow impact:** BU Head / HR reviewers see correct system scores; running-final-score projections stop under-counting.
- **UI impact:** New "System Scores require re-entry" banner on the Employee Annual Review page when the template requires raw and none is present.
- **Regression risk:** Low. Guarded by `library_key` equality; no change to scoring math or scoring rules.
- **Scalability:** Backfill is one shot, indexed on `instance_id`. Trigger fires only on template swap (rare).
- **Mitigation:** Dry-run backfill first (report affected rows), then apply; UI banner is read-only.

## CAPA
### Corrective (immediate)
1. **SQL migration `ar_system_scores_carry_over_on_template_swap.sql`**
   - New function `remap_system_scores_by_library_key(p_instance uuid, p_new_template uuid)`: rebuilds `system_scores_raw` and `system_scores` maps on the instance by matching `library_key` across old→new template item IDs, using each new template item's `scoring_rules` to re-band. `carry_kra` items pass through untouched.
   - Update `force_reset_annual_review_instance` to call the remapper right after the `UPDATE annual_review_instances … SET template_id = p_new_template_id …` block.
   - Update `annual_review.template_override_set` code path (RPC `set_annual_review_template_override` — same treatment).
2. **One-shot backfill** for the 235 instances where the current template has raw-requiring items but `system_scores_raw = {}`: attempt library-key rehydration from the most recent prior template on the same cycle/employee (source: audit-log trail + reset archive). Log every rehydrated row into `system_audit_logs` (action `annual_review.system_scores_rehydrated`).

### Preventive
3. **Contract test** (`src/test/annualReview/systemScoresRemap.test.ts`): swap template A→B where B shares a `library_key` with A; assert `system_scores_raw` and `system_scores` survive the swap.
4. **UI banner** in `EmployeeAnnualReview.tsx`: when the template has raw-requiring system-score items and `system_scores_raw` is empty, show a non-blocking amber banner "HR needs to enter raw System Score values (5S, Training, …) before this appraisal can be finalized." Links HR to `SystemScoresUploadDialog`.
5. **POLICY §AR-SYSTEM-SCORES-KEY-STABILITY** (new) + **ADR-116**: raw system-score values are keyed by `(library_key, source)` and MUST be remapped on any template swap; the reset RPC MUST call the remapper.

## Files to change (build phase)
- `supabase/migrations/<ts>_ar_system_scores_key_stability.sql` — new remap function + patched `force_reset_annual_review_instance` + one-shot backfill + audit log.
- `src/pages/annual-review/EmployeeAnnualReview.tsx` — banner insertion (presentation only).
- `src/lib/annualReview/systemScoresStatus.ts` (new) — pure helper `needsRawEntry(template, systemScoresRaw)` for the banner + tests.
- `src/test/annualReview/systemScoresRemap.test.ts` — regression tests.
- `docs/adr/ADR-116.md`, `POLICY.md` §AR-SYSTEM-SCORES-KEY-STABILITY, `DOCUMENTATION.md` version history entry.

## Rollback
- All new SQL is additive (new function + one `CREATE OR REPLACE` on the reset RPC). Revert = restore prior `force_reset_annual_review_instance` body from git; the backfilled rows are correct data and can be left in place. UI banner is a pure render change.

## Not Applicable
- Auth / RLS — unchanged.
- Storage buckets — unchanged.

## Verification (post-implementation)
- Re-run the "235 empty raw" query — expect drop to 0 (or a small residual of instances that never had a matching library_key upstream, listed explicitly for HR follow-up).
- Nikunj 100357: run `SELECT system_scores, system_scores_raw FROM annual_review_instances WHERE id='422f7062-…'` — expect populated maps if the archive has the prior library_key values, else the banner surfaces on the page.
- New unit tests green.
