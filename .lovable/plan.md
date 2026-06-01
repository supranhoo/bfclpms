## Problem

In the Bulk Sign-off dialog (e.g. *Bulk sign off 18 cells as HR PMS*):

1. **Submit blocked** — when the reviewer ticks "N/A" on rows with no prior-stage score, the button stays disabled showing **"Sign off 0 cells"** with *"Enter an Achieved value for each row marked ●"*. The 18 N/A rows are also counted as **"18 skipped"** / **"18 need score"** in the header chips.
2. **N/A from prior stages not visible** — rows where Self / Manager / Skip-Level have already marked the KPI as N/A render as a dash (`—`) in those stage columns. The reviewer cannot tell that the prior stage's score was intentionally N/A vs simply unscored.

### Root cause

1. `resolveWithInputs` returns `{ score: null, source: 'none' }` for both `inputs.isNa === true` and `submission.is_na === true`. `buildBulkSignoffImpact` then counts every cell whose `source === 'none'` into `requiredUnfilled` + `skippedCount`, and `BulkApproveDialog` computes `actionableCount = cellCount − requiredUnfilled` → 0 → button disabled.
2. The `BulkSignoffPreview` stage-score cell renderer only checks `stageScore != null` and shows `—` otherwise. There is no per-stage `is_na` flag carried in `SnapshotCell` / `CellPreview.stageScores`, so the UI cannot distinguish "stage didn't score" from "stage explicitly marked N/A".

## Risk & Impact Report

- **Data**: No schema change. Server-side write contract for N/A already exists (sign-off mode supports `p_is_na`). Per-stage `is_na` flags are display-only — derived from existing review-history rows.
- **Workflow**: Restores the intended N/A path and surfaces prior-stage N/A intent to the next reviewer.
- **UI**: Submit button label, helper text, header chips, and stage cell render update. Same visual N/A pill is reused.
- **Regression risk**: Low. Adds a new explicit `'na'` source so existing branches on `'none'` keep their meaning for truly unscored rows. Stage cell render adds a fallback when prior-stage N/A is known; otherwise unchanged.
- **Mitigation**: Unit tests on `resolveWithInputs`, `buildBulkSignoffImpact`, and a snapshot test on the stage-cell renderer.

## Plan

### 1. `src/lib/carriedScoreResolver.ts`
- Extend `CarriedSource` union with `'na'`.
- `resolveWithInputs`: return `{ score: null, source: 'na' }` when `inputs.isNa === true` **or** `submission.is_na === true`.
- `resolveCarriedScore`: same — return `'na'` for `submission.is_na === true` (was `'none'`).

### 2. `src/lib/bulkSignoffImpact.ts`
- Extend `SnapshotCell` with optional per-stage N/A flags read from the existing review-history snapshot:
  `self_is_na?: boolean | null`, `manager_is_na?: boolean | null`, `skip_level_is_na?: boolean | null`, `hr_pms_is_na?: boolean | null`, `auditor_is_na?: boolean | null`, `management_is_na?: boolean | null`.
- Extend `CellPreview.stageScores` with mirror keys: `selfNa`, `managerNa`, `skipLevelNa`, `hrPmsNa`, `auditorNa`, `managementNa` (booleans).
- Add `naCount: number` to `ImpactSummary.totals`.
- `requiredUnfilled` filter: count `source === 'none'` **and** `source === 'override' && score == null`; **exclude** `'na'`.
- `skippedCount` filter: count `'none'` only (N/A is an intentional write, not a skip).
- `naCount`: count `source === 'na'`.
- Per-employee `skippedInBatch`: increment only for `source === 'none'` (rows already excluded from weighted totals by the existing `r.is_na` guard remain so).

### 3. Snapshot loader (caller of `buildBulkSignoffImpact`)
- Where `loadedRows` are assembled (the hook/page that feeds the dialog — `BulkReviewDashboard` / `useBulkReview`), populate the new per-stage N/A flags from the same review-history row already fetched. No new query.

### 4. `src/components/review/BulkSignoffPreview.tsx`
- **Stage cells (Self / Manager / Skip-Lvl / HR PMS / Auditor / Mgmt)**: when the corresponding `stageScores.*Na === true`, render the existing `N/A` pill (muted) instead of `—`. When score is present, render score (unchanged). Only render `—` when both score is null and `*Na` is false.
- **Required-● marker**: do not render for `source === 'na'` rows.
- **Header chips**: split the existing red badges so N/A rows do not inflate "skipped" / "need score". Use `naCount` for a neutral chip *"N N/A"* alongside `skippedCount` / `requiredUnfilled` chips.

### 5. `src/components/review/BulkApproveDialog.tsx`
- `actionableCount` already derives from `requiredUnfilled`, so it will naturally include N/A rows once step 2 lands.
- Button label: when `naCount > 0` and `requiredUnfilled === 0`, show `Sign off X cells (includes Y N/A)`.
- Helper line *"Enter an Achieved value for each row marked ●"* renders only when `requiredUnfilled > 0`.
- `handleConfirm` already builds the `isNa` / `naReasons` maps — no change.

### 6. Tests / mocks
- `resolveWithInputs`: returns `'na'` for `inputs.isNa === true` and for `submission.is_na === true`.
- `buildBulkSignoffImpact`:
  - All-N/A batch → `requiredUnfilled = 0`, `skippedCount = 0`, `naCount = N`, `cellCount = N`.
  - Mixed batch (N/A + unfilled + scored) → counts split correctly.
  - Per-stage `*Na` flags propagate to `CellPreview.stageScores`.
- `BulkSignoffPreview` snapshot: stage cell renders `N/A` pill when `selfNa === true`, `—` when both score null and `selfNa` falsy.

## Acceptance

1. Reviewer ticks N/A on every row of an 18-cell batch → button shows **"Sign off 18 cells (includes 18 N/A)"**, no red helper, submission succeeds, every row written as `is_na = true` with the shared remark. Header chips show *"18 N/A"* instead of *"18 skipped / 18 need score"*.
2. Mixed batch (3 N/A + 5 unfilled + 10 scored) → button shows **"Sign off 13 of 18"**, helper *"5 rows marked ● will be skipped"*, chip *"3 N/A"*.
3. A KPI marked N/A by Self / Manager / Skip-Level shows the muted **N/A** pill in those stage columns (not `—`), so the next reviewer sees the prior intent.
4. Existing flows with no N/A — no behavioral change.

## Out of scope

- Per-row N/A remarks (still reuses the shared dialog remark).
- Management bulk-approve N/A (RPC does not accept it; mode='approve' already hides the N/A column).
- Server-side RPC changes.
- New queries — per-stage N/A flags are read from existing review-history rows.
