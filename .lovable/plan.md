# Plan — Non-destructive bulk system-score update (incl. completed reviews)

## Goal
Let Admin re-upload the "Annual Production Target vs Actual" (and any other system-KPI column) from the bulk sheet and have new values **apply even when the review status is `completed`/`finalized`**, provided the new score is **≥ the currently locked score** (no downgrades). Rows where the incoming value equals the stored value are silent no-ops.

## Current behavior (verified)
- `SystemScoresUploadDialog` and the Bulk Data Upload dry-run (screenshot) skip any instance whose `Locked stage: completed` — hence the 1597 skips in the preview.
- `system_scores` is a JSONB on `annual_review_instances`; final rating is computed from it + criteria on advancement/finalize.
- POLICY §88 (Submission Snapshot Immutability) forbids silent mutation of approved history — so we need an **explicit, audit-logged, admin-only** override path with a no-downgrade guard.

## Approach
Two-track, minimal change:

### 1. Backend RPC — `admin_apply_system_scores_bulk(cycle_id, rows[], allow_completed, no_downgrade)`
SECURITY DEFINER, admin-only. Per row:
1. Load instance + template.
2. Diff each incoming `system_scores[key]` vs stored.
   - equal → skip (report `unchanged`)
   - new < old and `no_downgrade=true` → skip (report `downgrade_blocked`)
   - new > old OR old is null → stage change
3. If `status IN ('completed','finalized')` and `allow_completed=true`:
   - Update `system_scores` in place.
   - Recompute `total_score`, `final_rating`, `criteria_weighted_score` using the existing scoring helper (same one used at finalize).
   - **Only persist the recomputed rating if it is ≥ the stored `final_rating`** (guard against downgrades from cross-effects).
   - Write a row per instance to `annual_review_access_audit` (action `system_scores.admin_override`) with before/after JSON.
   - Leave `finalized_at`/`finalized_by` intact so the review stays "Completed".
4. Non-completed rows: apply as today (write to `system_scores`, no recompute of final rating).
5. Return `{ applied, unchanged, downgrade_blocked, upgraded_completed, errors }` per row for the UI summary.

### 2. UI — extend the existing Bulk Data Upload dry-run
In the dry-run preview (the dialog in the screenshot):
- Replace the blanket `Locked stage: completed → skip` with a three-way classification for completed rows:
  - `unchanged` (grey) — value equals stored
  - `upgrade` (blue) — new value would raise the score; eligible to apply
  - `downgrade_blocked` (amber) — new value is lower; will not be applied
- Add an Admin-only checkbox **"Apply to completed reviews (upgrades only)"** — default OFF. When ON, completed `upgrade` rows are included in the commit count and the button reads e.g. `Commit 1 + 42 completed upgrades`.
- Post-commit summary lists per-employee before → after for every changed cell, grouped by (Applied / Upgraded completed / Downgrade blocked / Unchanged / Errors), with CSV export.

No changes to non-admin flows, no changes to Self/Manager/Auditor pipelines, no schema changes beyond the audit rows already supported by `annual_review_access_audit`.

## Risk & impact
- **Data**: only `system_scores`, `total_score`, `final_rating`, `criteria_weighted_score` on targeted instances; every write audited; strict no-downgrade guard.
- **Policy**: preserves §88 (change is explicit + audited + admin-only + monotonic upward).
- **Workflow**: completed reviews stay completed; employees are not re-notified unless the score actually changes (optional toast/email — off by default; happy to wire in if you want).
- **Regression**: existing dry-run behavior for non-completed rows is byte-identical; new branch is gated by the new checkbox.
- **Rollback**: audit row stores the previous JSON; a one-click "revert this override" action can be added later using that snapshot.

## Deliverables
1. Migration: `admin_apply_system_scores_bulk` RPC + audit action enum value.
2. `SystemScoresUploadDialog` and Bulk Data Upload dialog: new classification + admin checkbox + post-commit summary.
3. Tests: RPC (upgrade / equal / downgrade-blocked / non-admin denied / completed-flag off), UI classification unit tests.
4. ADR-171 + POLICY §AR-SYSTEM-SCORE-ADMIN-UPGRADE (monotonic, admin-only, audited).
5. DOCUMENTATION.md + Version History bump.

## Open questions before I build
1. **Scope of "no negative impact"**: block any row whose new value would decrease the KPI's contribution, or only block if the recomputed **final rating** would drop? (Cell-level is safer; final-level allows benign offsetting swaps.) Default in this plan: **cell-level**.
2. **Notify employees** when a completed review's score is upgraded? Default: **no email**, only in-app audit trail visible to Admin/HR.
3. **All system KPI columns** in the sheet, or **only Annual Production Target vs Actual** for this run? Default: **all columns**, since the same guard makes it safe.

If those defaults are fine, say "go" and I'll build it; otherwise tell me which to flip.