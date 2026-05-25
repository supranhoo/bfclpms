# Complete Bulk Sign-off Rating-on-Achievement

Three pending items from the previous implementation pass. No new UI changes — only wiring, DB, and SSOT.

## 1. Wire `BulkReviewDashboard` → preview data

**File:** `src/pages/review/BulkReviewDashboard.tsx`

- When the user opens the Bulk Approve dialog, collect the selected `{ submission_id, kpi_id, employee_id }` triples from the snapshot.
- Batched fetch (500 IDs/page) from `kpis`: `id, name, weightage, formula_type, is_lower_better, r0..r5, achieved_value, is_na, employee_id`.
- Batched fetch carried scores via existing `carriedScoreResolver` (already mirrors DB cascade).
- Build `ImpactSummary` via `bulkSignoffImpact()` and pass as the `preview` prop to `BulkApproveDialog`.
- Loading state: dialog renders skeleton (already supported in `BulkSignoffPreview`).
- Error state: toast + keep CTA enabled with a warning (matches existing dialog error pattern).

**No visual change** — preview UI was built in the previous pass.

## 2. DB Migration — extend `bulk_write_stage_scores`

**File:** new timestamped migration under `supabase/migrations/`.

- Add helper `public.fn_compute_rating_from_achievement(p_kpi public.kpis) RETURNS numeric` mirroring `src/lib/ratingCalculation.ts`:
  - Qualitative → passthrough
  - Percentage formula → `(achieved/target)*100` projection onto R0–R5
  - Absolute formula → direct R0–R5 lookup
  - Honors `is_lower_better` (inverts comparisons, caps at R0)
  - Returns NULL when `achieved_value IS NULL` or `is_na = true`
- Extend cascade inside `bulk_write_stage_scores` with a **5th rung** after HR PMS lookup:
  ```
  IF v_score IS NULL THEN
    SELECT * INTO v_kpi FROM public.kpis WHERE id = v_cur.kpi_id;
    v_score := public.fn_compute_rating_from_achievement(v_kpi);
    IF v_score IS NOT NULL THEN
      v_inherited_from := 'computed_from_achievement';
    END IF;
  END IF;
  ```
- Per-employee row (NOT shared rule) — uses `v_cur.kpi_id` directly.
- Skip write when `v_score IS NULL` (no prior + no achievement) — record audit row with `action = 'skipped_no_data'`.
- Audit `bulk_signoff_audit` already records `inherited_from`; no schema change needed.

**Rollback:** migration is additive (new function + replaced function body). Down path = restore prior `bulk_write_stage_scores` body kept in migration comment.

## 3. SSOT Updates

- **`POLICY.md` §111.7.a** — Document the 5th-rung "compute from achievement" rule, per-employee scope, and `final_score` immutability boundary.
- **`DOCUMENTATION.md`** — Bump to v2.66.13.9; add Version History entry referencing the new RPC behavior and impact preview.
- **`mem://architecture/pms/universal-scoring-logic`** — Append `computed_from_achievement` to the canonical cascade chain.
- **`mem://features/review/weighted-score-calculation-logic`** — Note that bulk preview excludes `is_na` and uses per-employee formula.
- **`mem://features/review/bulk-review-dashboard`** — Create new memory describing impact-preview contract.

## Risk & Impact

- **Data:** Additive RPC change; new audit `inherited_from` value. No schema mutation. No backfill.
- **Workflow:** Cells previously skipped (NULL cascade) may now be stamped with computed rating. Reviewer sees this explicitly in preview before approving.
- **UI:** None (preview built previously).
- **Regression:** Existing 4-rung cascade unchanged for cells that already have prior scores. New rung only fires when all prior stages NULL.
- **Scalability:** Batched 500/page KPI fetch; preview computation O(cells). Tested up to ~2000 cells in single dialog.
- **Mitigation:** Unit tests for new RPC helper (qualitative/percentage/absolute, lower-better, NULL achievement); existing `bulkSignoffImpact.test.ts` covers per-employee math.

## Out of Scope

- Grid cell visual changes
- Single-cell Admin Data Entry
- `final_score` immutability changes
- Auditor-stage rule changes beyond the new fallback

Approve to proceed with wiring + migration + SSOT.