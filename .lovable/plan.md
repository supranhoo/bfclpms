# Bulk Sign-off — let the active-stage reviewer enter their own Achieved value

## Why Aayush can't type anything in the dialog

In `src/components/review/BulkSignoffPreview.tsx` the Achvd / N/A inputs are gated by:

```
isRowEditable(c) = c.source === 'none' || isOverride
```

For the 5 rows in your screenshot the Self stage already scored 5.0, so the snapshot returns `source = 'self'` (Self's value is **carried forward** into the Auditor column). The predicate therefore returns `false`, the input becomes read-only, and the only way to type a value today is the **admin-only** "Override" checkbox — which Aayush, as Auditor, doesn't have.

So the behaviour is by design, but the design is wrong: it forces every reviewer to either rubber-stamp the previous stage or open the single-cell drawer one row at a time. That contradicts the dashboard (where each stage can re-enter the Achieved value and the engine recomputes the score) and breaks parity with `POLICY §BULK-REVIEW-SCORING-PARITY`.

## Goal

In the Bulk Sign-off dialog, the **active-stage reviewer** (Auditor / Manager / HR PMS / Skip-Level / Management) can, per row:

1. Leave Achvd blank → previous stage's score is carried forward (today's default — unchanged).
2. Type an Achieved value (or pick a Yes-No / tier option) → engine computes 0–5 from KPI thresholds, exactly like the dashboard. Written to **their own stage column only**.
3. Tick N/A → row recorded as not-applicable with the shared remark (today this is admin-only when source≠'none' — will be opened to reviewers too).

Admin "Override stage score only" stays exactly as it is — it is the only path that bypasses prior-stage gates / row-version conflicts / already-scored rows / final-unlock.

## Risk & Impact Report

- **Data impact:** none on schema. Same RPC, same audit columns. Reviewers can already write their stage column via the per-cell drawer — this just lets them do it in bulk.
- **Workflow impact:** zero new bypass. Eligible rows are still only the ones already in the reviewer's sign-off selection (i.e. already at their active stage and passing scope filters). No change to RLS, no change to advancement rules.
- **POLICY §88 (immutability):** unchanged. Approved/final rows are not in the selection set and remain unreachable without admin override.
- **UI:** Achvd input becomes editable for all rows in sign-off mode; an empty input still means "carry forward". Helper copy under the table is updated to describe the three options.
- **Regression risk:** medium-low. Only the `isRowEditable` predicate and the `allowNa` gate in sign-off mode change. Admin override path and approve-Final path are untouched.
- **Scalability:** no extra queries; per-row state already exists in the `inputs` Map.

## Changes (surgical)

### 1. `src/components/review/BulkSignoffPreview.tsx`
- Replace `isRowEditable` with:
  ```
  // In sign-off mode the active-stage reviewer can always type their own
  // Achieved value; an empty input means "carry forward the previous stage".
  // Admin override additionally unlocks rows that were skipped by gates.
  const isRowEditable = (_c) => editable; // editable = !!onCellInputChange
  ```
  (`source === 'none'` rows are already covered because `editable` is true; `isOverride` keeps its current meaning for admins.)
- Pass `allowNa = true` for sign-off mode in the parent (see #2) and keep the existing approve-Final behaviour unchanged.

### 2. `src/components/review/BulkApproveDialog.tsx`
- In `<BulkSignoffPreview …/>` pass `allowNa={isSignoff}` so reviewers can mark N/A in bulk too (today only admin override exposes it).
- No change to the admin "Override" panel.

### 3. Helper copy (under the preview table, sign-off mode only)
Replace the current single-line hint with:
> Leave **Achvd** blank to carry the previous stage's score forward. Type a value (or pick a Yes/No/tier option) to let the engine compute your stage's score from the KPI thresholds. Tick **N/A** to mark the row not-applicable. The Remark and Evidence apply to every row you sign off.

### 4. Tests (`src/test/bulkReview/`)
- New `bulkSignoffPreview.editable.test.tsx`:
  - reviewer + `source='self'` row → Achvd input is enabled
  - reviewer + `source='none'` row → Achvd input is enabled
  - approve-Final mode + non-admin → Achvd input is disabled (regression guard)
  - admin override unchanged → still enables every row including frozen / gated ones
- Extend existing `BulkApproveDialog` test (if any) to assert N/A column renders for reviewer signoff.

### 5. Docs / Policy
- `DOCUMENTATION.md` — Bulk Sign-off section: add the three-option contract (blank / typed / N/A) and call out parity with the dashboard.
- `POLICY.md §BULK-REVIEW-SCORING-PARITY` — extend with: "In sign-off mode the active-stage reviewer MAY enter an Achieved value or mark N/A on any row in their selection. Empty Achvd carries the previous stage's score forward. Admin Override remains the only path that bypasses workflow / immutability gates."
- `mem://features/review/bulk-review-auditor-scope-filter` — add a one-liner that the dialog now mirrors the dashboard input for all reviewer roles.

## Out of scope

- Inline editing directly in the bulk-scoring grid (no drawer / dialog) — separate, larger change with its own draft-persistence story.
- Changing the "skipped" cells UX or the admin override semantics.
- Any RPC / schema changes.

## Rollback

Pure UI revert of `isRowEditable` and the `allowNa` prop. No data migrations.
