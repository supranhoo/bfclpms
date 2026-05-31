# Revert Per-Stage Value Cascade in Bulk Override

## Assumptions
- The screenshot shows Self / Manager / Skip-Level / HR PMS all displaying the same `Value: 16.66` after an admin override that the user only intended to apply at one stage (HR PMS / Management).
- The cause is the previous change (migration `20260531111057` + backfill `20260531111218`) which overwrote `<stage>_achieved_value` and `<stage>_score` for **every** completed stage whenever an override happened.
- Earlier stage values (Self, Manager, Skip-Level) belong to the original reviewer and **must not** be rewritten by an admin override at a later stage.

## Root Cause
The previous "ADR-067 addendum" cascaded a single override into all completed `<stage>_*` columns. This violates stage ownership: each reviewer's recorded value at their stage must stay intact.

The correct behavior:
- An admin override updates the **top-level** `achieved_value` + `final_score` (single source of truth for the approved outcome).
- The per-stage columns (`manager_*`, `skip_level_*`, `hr_pms_*`, `auditor_*`) record what *that reviewer* entered and must remain immutable from outside that stage.
- Only the stage where the admin is currently acting (Management, in bulk approve) may be stamped — and even then only if that stage is the one being executed.

## Risk & Impact Report
- **Data**: Backfill rewrote historical per-stage columns for rows touched since 2026-05-29. We must restore them from the audit-log snapshots (`STAGE_VALUES_BACKFILLED.old_value` and `STAGE_VALUES_OVERWRITTEN.old_value`).
- **Workflow**: No status / final_score changes — only per-stage display columns are reverted.
- **UI**: Review Journey cards will once again show each reviewer's own entered value (e.g., Self may show original employee submission, not 16.66).
- **Regression**: The original complaint ("Score changed but Value didn't") will resurface unless we also keep the **top-level** `achieved_value` in sync (which we already do via the existing override path). The Review Journey UI must fall back to the top-level value where the stage column is the same as before the cascade — confirmed by current selector logic.
- **Mitigation**: One-shot reversal driven by audit log; idempotent (uses earliest old_value per submission); wrapped with trigger disable/enable; dry-run COUNT logged.

## Plan

### Step 1 — Code: stop cascading in `bulk_management_approve` override
Replace the override branch so it only:
- Sets top-level `achieved_value = v_ach_num`
- Leaves all `<stage>_achieved_value` / `<stage>_score` columns untouched
- Continues to write `STAGE_VALUES_OVERWRITTEN` audit (renamed semantics → `TOP_LEVEL_VALUE_OVERWRITTEN`) for traceability
- Keeps the existing `org_kpi_values` back-write and final_score restamping (those remain correct)

### Step 2 — Data repair: restore per-stage columns for affected rows
For every `review_submissions` row that has a `STAGE_VALUES_BACKFILLED` **or** `STAGE_VALUES_OVERWRITTEN` audit entry created after `2026-05-31 11:10 UTC`:
- Find the **earliest** such audit row per submission (its `old_value` holds the pre-cascade snapshot).
- `UPDATE review_submissions SET manager_achieved_value = old.manager_achieved_value, …, manager_score = old.manager_score, …` from that JSONB snapshot.
- Insert a new audit row `STAGE_VALUES_REVERTED` capturing old (current cascaded) and new (restored) per-stage values; `performed_by = NULL` (system repair).
- Disable `check_period_lock_on_submission_update` trigger for the duration, then re-enable.

### Step 3 — Verification
- `SELECT id, achieved_value, manager_achieved_value, skip_level_achieved_value, hr_pms_achieved_value FROM review_submissions WHERE id = 'd11f4f08…';`
- Confirm Self/Manager/Skip-Level values revert to original reviewer values; HR PMS/Management still reflect their own entries; top-level `achieved_value` and `final_score` still equal the admin-approved 16.66.
- Review Journey UI for the sample employee shows distinct per-stage values where reviewers actually entered different numbers.

## UI Changes
None. UI selectors already read `<stage>_*` columns and fall back to top-level `achieved_value` — once the per-stage columns are restored, each card will show its original value automatically.

## Documentation / Policy Updates
- `DOCUMENTATION.md` → Bulk Approve section: remove the "cascade per-stage values" note; document the corrected single-stage ownership rule.
- `POLICY.md` → §88.1 / ADR-067 addendum: mark addendum as **reverted**; restate: *"An admin override updates `achieved_value` and `final_score` only. Per-stage `<stage>_achieved_value` / `<stage>_score` are owned by the reviewer who recorded them and are immutable from later stages."*
- `mem://features/admin/submission-score-integrity` → add note: per-stage columns are stage-owned; do not cascade.

## Files Touched
- `supabase/migrations/<new>_revert_per_stage_cascade.sql` — function rewrite + data repair (single migration, transactional).
- `DOCUMENTATION.md`, `POLICY.md`, `.lovable/plan.md`.
- No frontend changes.

## Rollback
If repair misfires, the audit table retains the cascaded snapshots (`STAGE_VALUES_OVERWRITTEN.new_value` and `STAGE_VALUES_BACKFILLED.new_value`); a reverse migration can re-stamp them. Function change is a `CREATE OR REPLACE` — previous body is in git history.
