# Confirming reviewer Achieved entry for Manager / Skip-Level / HR PMS / Auditor — and flagging Functional Manager

You and the last shipped fix agree: **typing an Achieved value (engine computes the score)** and **admin Override (bypass gates / re-stamp frozen rows)** are two different features. The behaviour you described is now the contract — this plan just confirms which roles are covered today and which one isn't, so we don't ship a half-fix.

## What's already live (v2.66.13.14)

In sign-off mode (`/review/bulk-scoring` → "Sign off N cells") the per-row Achvd / N/A inputs are editable for every active-stage reviewer the platform supports today:

| Reviewer role | Achvd editable | N/A editable | Override toggle |
|---|---|---|---|
| Manager (`manager`) | ✅ | ✅ | ❌ (admin only) |
| Skip-Level (`skip_level`) | ✅ | ✅ | ❌ (admin only) |
| HR PMS (`hr_pms`) | ✅ | ✅ | ❌ (admin only) |
| Auditor (`auditor`) | ✅ | ✅ | ❌ (admin only) |
| Management (`management`) — terminal Approve flow | read-only (POLICY §88) | n/a | ✅ admin only |
| Admin | ✅ everywhere | ✅ everywhere | ✅ |

- Empty Achvd → previous stage's score carries forward (unchanged default).
- Typed Achvd / Yes-No / tier → engine recomputes 0–5 from the row's OWN KPI thresholds — identical to the dashboard scorecard (`kpiHasScoringLogic`, POLICY §BULK-REVIEW-SCORING-PARITY).
- Admin Override stays the **only** path that bypasses prior-stage gates, row-version conflicts, already-scored rows, and final-unlock.

Regression test: `src/test/bulkReview/bulkSignoffPreviewEditable.test.tsx` (3 cases).

## What is NOT covered today — Functional Manager

You also mentioned Functional Manager. The current bulk pipeline does **not** plumb that stage end-to-end:

- `src/lib/bulkActionForStage.ts` defines `BulkStage = 'manager' | 'skip_level' | 'hr_pms' | 'auditor'` — `functional_manager` is missing, so no bulk sign-off button is rendered for that role.
- `BulkSignoffPreview` already has a `'fn-mgr'` source label but the stage-write RPC (`public.bulk_write_stage_scores(p_stage…)`) only accepts the four stages above. Adding FM there is a separate, larger ticket (RPC signature + cascade ordering + audit type + workflow advancement + tests). I will NOT silently piggy-back it on this change.

If you want Functional Manager included, I'll spec it as its own plan with the RPC + workflow + audit work — say the word and I'll draft it.

## What I'll do in this plan (build mode)

Verification-only, no new code:

1. Run the existing reviewer-editable regression suite to confirm the four roles above are green.
2. Open the live Bulk Sign-off dialog as a non-admin reviewer (using the test harness) and assert in a new test that the Achvd input is rendered for `mode='signoff' + isAdmin=false`, and that the admin Override panel is NOT rendered — guards against a future regression that re-locks reviewers.

### Tests to add
- `src/test/bulkApproveDialogSignoffMode.test.tsx` → extend with one case: non-admin sign-off mode renders the Per-cell preview with editable Achvd inputs AND does NOT render the "Override … score only (admin)" panel.

## Risk & Impact

- Data / RLS / RPC / scoring / workflow / audit / backup: no change.
- UI: no change (test-only addition).
- Regression risk: none — pure assertions over already-shipped behaviour.

## Out of scope (separate tickets if you want them)

- Functional Manager bulk sign-off (RPC + role plumbing).
- Letting Management override the Final on terminal approve without the admin role.
- Inline editing directly in the bulk-scoring grid (no drawer / dialog).

## Rollback

Delete the added test case. No app code changes.
