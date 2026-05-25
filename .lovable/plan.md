
## Problem

`bulk_write_stage_scores` cascades **Self → Manager → Skip → HR PMS**. If all are NULL the cell silently drops (`skipped: no_prior_score`). The reviewer sees no impact preview, and per-employee Wt%/formula are ignored in the UX even though every employee has their own `kpis` row.

## Risk & Impact

| Area | Impact |
|---|---|
| Data | New stamped scores in `manager_score`/`hr_pms_score`/etc. for previously-skipped cells. Final/locked/N/A untouched. |
| Workflow | Cells previously skipped now advance. Intended. |
| UI/UX | Dialog gains a per-cell preview + per-employee rollup. Grid unchanged. |
| Per-employee correctness | Every cell uses **its own `kpi_id` row** (Wt%, formula, R0–R5). |
| Regression | `bulk_management_approve` and Admin Data Entry untouched. |
| Scalability | Snapshot already cached; +1 batched `kpis` fetch (500 ids/chunk). RPC adds 1 SELECT/cell inside existing loop. |
| Rollback | Additive SQL — revert restores old behaviour. |

## UI / UX — Bulk Sign-off Dialog (new layout)

Width grows to `max-w-3xl`. Order: **title → impact summary strip → per-cell preview table → per-employee rollup → remark → evidence → CTA**.

### 1. Impact summary strip (above remark)

```text
┌───────────────────────────────────────────────────────────────────────┐
│  🛡  Bulk sign off  4 cells  as HR PMS                          ✕     │
│  Previous stage's score is carried forward. 1 cell will use the       │
│  rating computed from its achievement value.                          │
├───────────────────────────────────────────────────────────────────────┤
│  [ 4 cells ]  [ 2 employees ]  [ Δ +0.82 weighted ]  [ ⚠ 0 skipped ]  │
└───────────────────────────────────────────────────────────────────────┘
```
- 4 chips, `Badge` variant `secondary`, `h-7`, `tabular-nums`.
- Last chip turns `destructive` if `skipped > 0`.

### 2. Per-cell preview table  ( `▾ Show 4 cells` collapsible, open by default )

```text
┌─────────────────┬──────────────────────────────┬─────┬────────┬───────────────┬────────┐
│ Employee        │ KPI                          │ Wt% │ Score  │ Source        │ Impact │
├─────────────────┼──────────────────────────────┼─────┼────────┼───────────────┼────────┤
│ Aakash Roy      │ Cost Centre Verification     │ 10% │  4.0   │ manager       │ +0.40  │
│ Rahul Prasad    │ Cost Centre Verification     │  8% │  5.0   │ computed (R3) │ +0.40  │
│ Sourav Jaiswal  │ Cost Centre Verification     │ 12% │  3.0   │ self          │ +0.36  │
│ Priya Sharma    │ Cost Centre Verification     │  6% │   —    │ ⚠ no data     │   —    │
└─────────────────┴──────────────────────────────┴─────┴────────┴───────────────┴────────┘
```
- shadcn `Table`, sticky header, zebra `hover:bg-muted/50`, virtualised after 50 rows.
- **Source badge** colours: `self / manager / skip / hr_pms` → `secondary`; `computed` → `outline` with `Calculator` lucide icon + tooltip showing this row's R0–R5 and formula (re-uses `KpiLogicModal` body); `no data` → `destructive`.
- Impact column tabular-nums, `+` sign, dim when null.
- Skipped row dimmed (`opacity-60`), checkbox would be needed to deselect — out of scope; row is informational only.

### 3. Per-employee rollup (Dashboard parity)

```text
┌─────────────────┬──────────┬──────────┬─────────────┬─────────────────┐
│ Employee        │ Cells    │ Σ Wt%    │ Current Σ   │ Projected Σ     │
├─────────────────┼──────────┼──────────┼─────────────┼─────────────────┤
│ Aakash Roy      │  2       │  18%     │   62.4      │   62.8  ▲ +0.40 │
│ Rahul Prasad    │  1       │   8%     │   71.0      │   71.4  ▲ +0.40 │
│ Sourav Jaiswal  │  1       │  12%     │   58.2      │   58.56 ▲ +0.36 │
└─────────────────┴──────────┴──────────┴─────────────┴─────────────────┘
```
- Same math as `useDashboard*` weighted-score helpers (`N/A` and unscored excluded).
- ▲ green `text-emerald-500`, ▼ red `text-destructive`, `—` muted.

### 4. CTA states

```text
  [ Cancel ]                       [ Sign off 4 cells ]   ← enabled
  [ Cancel ]                       [ Sign off 3 of 4 ]    ← if 1 skipped
  [ Cancel ]                       [ Sign off 0 cells ]   ← disabled, all-skip
```
Sub-label under disabled CTA: *"All cells are missing prior scores and achievement values."*

### 5. Empty / loading

- While `kpis` batch loads: replace preview tables with `Skeleton` rows matching the same column shape (`h-10` per row).
- If preview fails: keep dialog usable but show `Alert` *"Preview unavailable — sign-off still works"*. CTA stays enabled (preserves today's behaviour).

### 6. Mobile (< 768px)

- Tables become stacked `Card` per row (Employee headline; Wt / Score / Source / Impact as label-value pairs). Touch targets ≥ `h-10`.

## Plan

### A. Helpers
1. `src/lib/carriedScoreResolver.ts` — pure: `(stage, scores, achieved, kpiRow) → { score, source }`. Reuses `calculatePercentageRating` / `calculateAbsoluteRating`.
2. `src/lib/bulkSignoffImpact.ts` — pure: builds per-cell + per-employee rollup (Dashboard math). Excludes `is_na`.

### B. UI
3. `src/components/review/BulkSignoffPreview.tsx` — renders strip + 2 tables (desktop/mobile). Strictly presentational.
4. `BulkApproveDialog.tsx` — accepts new `preview` prop; widens to `max-w-3xl`; mounts `BulkSignoffPreview` above the remark when `mode='signoff'`.
5. `BulkReviewDashboard.tsx` — selected `submission_id`s → snapshot rows → batched `kpis` fetch → `bulkSignoffImpact()` → pass to dialog.

### C. Database
6. Migration: extend `bulk_write_stage_scores` cascade with a 5th rung — when `v_score IS NULL`, fetch the row's own `kpis` and compute via new `public.fn_compute_rating_from_achievement(public.kpis)`. Audit `inherited_from = 'computed_from_achievement'`.

### D. Tests
7. `carriedScoreResolver.test.ts` — 14 cases (every stage × cascade-hit / computed / none; ↑↓ direction; R0 cap; qualitative).
8. `bulkSignoffImpact.test.ts` — **two employees, same KPI, different Wt% + different formula** → each cell uses its own rule; projected totals match Dashboard; `is_na` excluded.
9. `bulkSignoffPreview.test.tsx` — strip chips, source badges, skip warning, all-skip disables CTA, mobile stacked cards.

### E. SSOT
10. `POLICY.md` §111.7.a — cascade 5th rung (per-employee `kpis`); impact preview mandatory UX.
11. `DOCUMENTATION.md` v2.66.13.9 — Bulk Sign-off + Preview component + helpers.
12. `mem/architecture/pms/universal-scoring-logic`, `mem/features/review/weighted-score-calculation-logic`, `mem/features/review/bulk-review-dashboard`.

## Out of scope

Grid cell visual changes · Admin Data Entry path · `final_score` immutability · cell-level deselect inside the dialog.

## Flow

```text
selected cells
  ├─ fetch kpis(id ∈ cellKpiIds)    [batched 500]
  ├─ resolveCarriedScore × cell      ──► { score, source }
  ├─ bulkSignoffImpact               ──► per-employee current → projected
  └─► BulkApproveDialog
        · strip · per-cell table · rollup · remark · evidence · CTA

confirm
  └─► bulk_write_stage_scores RPC
        per-cell DB cascade using THIS row's kpi:
          self → manager → skip → hr_pms/auditor
            → NEW: rating from achieved_value × this row's R0–R5
              → skip 'no_prior_score_and_no_achievement'
```
