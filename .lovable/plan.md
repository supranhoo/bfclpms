## Root Cause

The server RPC `bulk_write_stage_scores` requires `p_batch_reason` to be non-null and ≥10 characters (migration `20260525094723…sql` line 48–49, re-asserted in `20260525110631…` and `20260525121610…`). It throws `remark required (min 10 characters)` otherwise.

`src/components/review/BulkCellDrawer.tsx` `handleWrite` only sends `remarks` inside the per-cell payload — it never sets the top-level `reason` argument that `useBulkWriteStageScores` forwards as `p_batch_reason`. So even when the user types a long remark in the Remarks textarea, the RPC sees a null batch reason and rejects the save.

This is purely a frontend wiring bug in the bulk single-cell drawer; no schema/RPC change.

## Fix (surgical, UI/wiring only)

In `src/components/review/BulkCellDrawer.tsx`:

1. In `handleWrite`, before calling `write.mutateAsync`:
   - Compute `trimmedRemarks = remarks.trim()`.
   - If `trimmedRemarks.length < 10`, show a destructive toast (`"Remarks required"`, `"Please enter at least 10 characters explaining the score."`) and return — matches server contract, prevents round-trip.
2. Pass `reason: trimmedRemarks` to `write.mutateAsync(...)` alongside the existing `cells` / `achieved_values`. Keep `cells[0].remarks = trimmedRemarks` so the per-cell remark is also stored (current behavior preserved).
3. Update the Remarks UI label/placeholder to reflect the requirement:
   - Label: `"Remarks (required, min 10 characters)"`
   - Placeholder: `"Required — visible in review trail (min 10 characters)"`
   - Keep `Textarea rows={2}`.
4. Add a small helper line under the textarea showing live character count when < 10 (muted text), so the user sees why the Save button stays disabled.
5. Extend the Save button `disabled` predicate to also require `remarks.trim().length >= 10` (in addition to the existing `effectiveScore === null` and `write.isPending` checks).

No other behavior changes (manual mode toggle, achievement scoring, reopen flow, management approve flow, single-cell scope) are touched.

## Risk & Impact Report

- Data impact: None. No schema/RPC change. Same payload shape, only one new field (`reason`) populated.
- Workflow impact: HR PMS / Manager / Skip-Level / Auditor single-cell saves through the bulk drawer will now succeed when a ≥10-char remark is entered (currently always fail with this error).
- UI impact: Remarks textarea label/placeholder change, optional char-count helper, Save button gated by remark length. Scope limited to `BulkCellDrawer`.
- Regression risk: Low. Other bulk write call sites (`BulkActionBar`, etc.) already pass `reason` independently — unchanged.
- Mitigation: Add a unit test that asserts the drawer's payload builder requires ≥10-char remarks and forwards `reason` to the RPC mutation. (Pure helper extraction or hook-level mock; no DB.)

## Test

- New `src/lib/bulkCellDrawerRemarks.test.ts` (or co-located util) covering:
  - `< 10` chars → validation fails, no mutate.
  - `>= 10` chars → mutate called with `reason` matching the trimmed remark and cell `remarks` equal to the same.
  - Whitespace-only → fails.

## Files to change

- `src/components/review/BulkCellDrawer.tsx` — validation + reason wiring + UI copy / disabled state.
- `src/lib/bulkCellDrawerRemarks.ts` (+ `.test.ts`) — tiny pure validator extracted for testability.
- `.lovable/plan.md` — log this fix.

No DOCUMENTATION.md / POLICY.md changes needed (server contract unchanged; this only aligns the UI to it).
