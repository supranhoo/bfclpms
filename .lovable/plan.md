## Root cause

The Dept Head cannot act because `STAGE_FOR_REVIEWER` in `src/components/annual-review/TeamReviewDetailContent.tsx` (lines 48–54) maps `pending_manager`, `pending_skip`, `pending_bu`, `pending_hr` — but **omits `pending_dept` → `dept_head`**. When the instance is at `pending_dept`, `stageRole` resolves to `null`, so `locked = true`, the scoring matrix renders in `readOnly` mode, and no Submit / Send Back bar appears. Every other Dept Head reviewer in this cycle is hitting the same dead-end.

The employee-vs-reviewer comparison (`comparison` prop) is already wired for previous stages, but with `role = null` the criteria list falls back to the full template and comparison values render as chips only; there is no explicit "Employee proposed X" summary or a justification prompt when scores diverge.

## Fix scope

### 1. Restore Dept Head write access (critical, single line)
`src/components/annual-review/TeamReviewDetailContent.tsx` — add the missing branch inside `STAGE_FOR_REVIEWER`:

```ts
if (inst.overall_status === 'pending_dept' && inst.dept_head_id === uid) return 'dept_head';
```

Keep ordering consistent with `stageChain.ts`. No other reviewer paths change.

### 2. Show what the employee submitted, side by side
`src/components/annual-review/CriteriaScoringMatrix.tsx` — enhance the existing `comparison` render:
- For each criterion, surface a compact "Employee: <score> · <label>" line (and the same for Manager / Skip when present) directly under the criterion header, using the already-passed `comparison` prop. No new query — pure presentation.
- If a self-review qualitative remark exists for the criterion, show it in a muted, collapsible block so the Dept Head can read the employee's justification before rating.

### 3. Optional justification when the reviewer differs from the employee
Same file. When `reviewerLabel !== 'self'` and the reviewer's score differs from the Self score for that criterion:
- Render a small, non-required `Textarea` labelled "Justification for score difference (optional)" bound to a new `variance_note` field in `qualitative_responses` under key `${criterionId}__variance` (piggybacks the existing JSONB — no schema change, no migration).
- The field is optional. Submit is never blocked. Textarea is hidden when scores match or when there is no Self entry yet.

### 4. Tests
- `src/lib/annualReview/stageForReviewer.test.ts` (new) — extract `STAGE_FOR_REVIEWER` into `src/lib/annualReview/stageForReviewer.ts` and add unit tests covering all six stage → reviewer id mappings, including the new `pending_dept` case and negative case (wrong uid → null).
- `src/components/annual-review/CriteriaScoringMatrix.variance.test.tsx` (new) — render with a Self comparison entry and a differing reviewer score; assert the justification textarea appears and calls `onChangeRemark` with the `__variance` key. Assert it stays hidden when scores match.

### 5. Docs & policy
- `DOCUMENTATION.md` — add `v2.66.74` entry: "Dept Head review write access restored + optional variance justification."
- `POLICY.md` — new clause under Annual Review Governance: "When a reviewer's score differs from the employee's self-score, an optional justification may be captured. It is never mandatory and never blocks submission."
- `mem://features/annual-review/overview.md` — one-liner appended: `STAGE_FOR_REVIEWER` must map every `pending_*` status in `stageChain.ts`; regression-guarded by `stageForReviewer.test.ts`.

## Risk & impact

- **Data:** none. No schema/RLS change. `variance_note` reuses existing `qualitative_responses` JSONB.
- **Workflow:** Dept Head can now advance / send back as designed; behaviour matches Manager / Skip / BU / HR paths already in production.
- **UI:** Adds a small comparison block + a conditional textarea inside each criterion row. No layout of other stages changes.
- **Regression risk:** low. Change is additive; other stage mappings untouched. Locked by new unit test.
- **Rollback:** revert the one-line map addition and the CriteriaScoringMatrix hunk; JSONB entries under `__variance` are harmless if left behind.

## Not applicable
Backup coverage, pagination, offline resilience — unchanged.
