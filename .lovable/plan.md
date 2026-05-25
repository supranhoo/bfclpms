## Goal

Make the admin "Override carried scores" toggle behave as a **single-stage override that always completes**, with a clear breakdown in the result toast/dialog of what was processed vs. what was skipped (and why).

Two distinct user complaints to fix:

1. **Override scope is too wide.** Today, even with Override ON, the RPC still blocks cells on prior-stage gates (`final_locked`, `self_not_submitted`, `auditor_takes_precedence`). The toggle should override **only the selected stage's column** (e.g. `hr_pms_score`), independent of self/manager/skip/auditor state. Final-stage immutability remains protected by POLICY §88 — we never overwrite `final_score`.
2. **Process keeps "failing".** Today the toast says "0 of 4 signed off, 4 skipped" and the batch feels broken. With Override ON, every selected cell should be written (subject only to `final_locked` & `not_found`), so the run completes successfully. The dialog/toast must always show a per-reason summary, never an all-or-nothing failure.

## Risk & Impact Report

- **Data Impact**: Override path can now write `<stage>_score` even when `self_score IS NULL` or an earlier stage is missing. We will NOT touch `final_score` (POLICY §88) and we will NOT overwrite an already-set higher-priority stage column unless that's the column being signed off.
- **Workflow Impact**: Workflow advancement after Override remains unchanged — same reconcile call as today; status simply reflects the new highest completed stage.
- **UI/UX Impact**: Override checkbox label is reworded to clarify single-stage scope. Result toast becomes a structured summary (`processed: N, skipped: M`) with a breakdown by reason.
- **Regression Risk**: Non-admin path and non-override path are unchanged (early `p_is_override := false` for non-admins is preserved). Manual + achieved precedence is unchanged. Reconciler is untouched.
- **Scalability**: No new queries per cell; same single `FOR UPDATE` lookup and single `UPDATE`. No N+1 introduced.
- **Mitigation**: Add unit tests for the override path covering `final_locked` (still blocked), `self_not_submitted` (now allowed under override), and `auditor_takes_precedence` (now allowed under override, only when stage is `hr_pms`).

## Step-by-step Plan

1. **New migration** (forward-only — never edit `20260525125538_*.sql`) replacing `public.bulk_write_stage_scores` with identical signature. Inside the gate block, when `p_is_override = true`:
   - Keep blocking on `not_found` and `final_locked` (POLICY §88 — immutable).
   - Skip the `self_not_submitted`, `auditor_takes_precedence`, and `row_version_conflict` gates.
   - When Override is on AND neither `manual_score` nor `achieved_value` is provided for a cell, raise `override_requires_input` (already exists) so the UI can mark that row.
   - When written, force `v_inherited_from := 'admin_override'` and write **only** the target stage column (already the case via `dynamic SQL` UPDATE — verify).
2. **Skip-reason audit metadata** — include each skip reason in the existing return payload (already returned as `v_skipped jsonb`); no schema change needed.
3. **Frontend (`BulkApproveDialog.tsx`)**:
   - Reword the override checkbox copy to: *"Override **HR PMS** score only — bypasses prior-stage requirements. Final scores remain immutable."* (stage label is dynamic.)
   - Replace the current "Sign off N of M" wording with two-line copy: primary count + helper "M cells will be skipped (X final-locked, Y not found)".
4. **Result toast (`BulkReviewDashboard.tsx`)** — render structured summary from RPC response: `Signed off N · Skipped M (breakdown by reason)`. Never throw when M > 0.
5. **Tests**:
   - `src/lib/carriedScoreResolver.test.ts` — already covers override; add a case asserting override input still required for self-null rows.
   - New `src/test/bulkWriteStageScoresOverride.test.ts` SQL-contract test asserting the migration text bypasses `self_not_submitted` / `auditor_takes_precedence` when `p_is_override = true` and still blocks `final_locked`.
6. **Docs & policy**:
   - `DOCUMENTATION.md` — describe single-stage override semantics + structured summary toast.
   - `POLICY.md` — add §111.7.b: "Admin Override is single-stage; final scores remain immutable; admin must supply manual/achieved value per row."
   - `.lovable/plan.md` — append change log entry.

## UI Changes

- **Bulk sign-off dialog**: override checkbox label reworded; skip count helper shows reasons.
- **Bulk sign-off result toast**: switches from short text to a multi-line summary card (title = "Sign-off complete", body = "Processed N · Skipped M" with reason chips).
- **No new pages / no nav changes.**

## Technical Details

```text
RPC gate matrix (after change)
                       p_is_override=false   p_is_override=true (admin)
final_score not null   skipped(final_locked) skipped(final_locked)   ← POLICY §88
not_found              skipped(not_found)    skipped(not_found)
self_score IS NULL     skipped(self_not_…)   ALLOWED
auditor pre-empts hr   skipped(auditor_…)    ALLOWED
row_version conflict   skipped(row_version)  ALLOWED
manual / achieved      use as score          REQUIRED (else override_requires_input)
```

Files to touch:
- `supabase/migrations/<new>.sql` — new `bulk_write_stage_scores`.
- `src/components/review/BulkApproveDialog.tsx` — copy only.
- `src/pages/review/BulkReviewDashboard.tsx` — toast rendering of structured summary.
- `src/lib/bulkSignoffImpact.ts` / `carriedScoreResolver.ts` — preview already mirrors override; verify gate-skip parity so the preview's `requiredUnfilled` count matches what the RPC will actually skip.
- `src/test/bulkWriteStageScoresOverride.test.ts` — new.
- `DOCUMENTATION.md`, `POLICY.md`, `.lovable/plan.md`.

## Rollback

The migration is a `CREATE OR REPLACE FUNCTION` with unchanged signature — rollback = re-apply previous migration body. No schema or RLS change. UI copy changes are trivially revertible.

## Open question (1)

Should Override on stage **auditor** also be allowed to bypass `self_not_submitted`? It's the same logical rule, but auditors rarely act before self-review. Default plan: **yes, allow** (consistent matrix). Tell me if you want auditor stage excluded.
