# Fix: BUG-047 Stale Reason Guardrail (Jitendra Bharti — Automation KRA, March 2026)

## Root Cause Analysis

The `enforce_on_behalf_score_or_na` BEFORE INSERT/UPDATE trigger inspects `NEW.auto_advance_reason`. That column is **set once** by `useAdminDataEntry` (`'Scored by Admin on behalf of hr_pms'`) and is **never cleared** by subsequent step-backs, status overrides, send-backs, or score wipes.

Forensic timeline for KPI `2c1a2a54…` (Jitendra Bharti, March 2026, "CLMS implementation"):

| When        | Action                              | Result                                                          |
|-------------|-------------------------------------|-----------------------------------------------------------------|
| Mar 28      | Admin scored on behalf of HR PMS    | hr_pms_score=5, hr_pms_rating=blue, reason="…on behalf of hr_pms"; status → approved |
| Mar 28      | `ADMIN_STATUS_OVERRIDE` ("testing") | Status reverted; hr_pms score/rating eventually cleared by step-back cascade |
| Apr 3–5     | Multiple step-backs / reconciles    | Row now has `hr_pms_score=NULL, hr_pms_rating=NULL`, `is_na=false`, **stale** `auto_advance_reason="Scored by Admin on behalf of hr_pms"` |
| Today       | Auditor tries any update            | Trigger reads stale reason + NULL score ⇒ raises BUG-047        |

The trigger cannot tell the difference between "this current write is the on-behalf write" and "this row carries leftover provenance text from a write that was later undone." Any subsequent UPDATE — auditor scoring, manager re-review, even unrelated column writes — gets blocked.

## What to Build

### 1. Database migration — make the guardrail write-scoped, not row-scoped

Replace `enforce_on_behalf_score_or_na` so it only enforces when the **current write itself** is the on-behalf submission. Two checks must both be true to enforce:

- `NEW.auto_advance_reason` matches the on-behalf pattern, **AND**
- `OLD.auto_advance_reason IS DISTINCT FROM NEW.auto_advance_reason` (it is being set/changed by this write — i.e. this UPDATE is the actual on-behalf event), OR `TG_OP = 'INSERT'`.

This preserves BUG-047 protection on the original write path (admin clicks submit in `AdminDataEntryDialog`) but stops the false positive on every later UPDATE that merely inherits the stale text.

### 2. Database migration — clear stale reasons on cascade-clear paths

In the existing step-back / cascade-clear / send-back triggers and RPCs that null out a stage's score, also null `auto_advance_reason` (or rewrite it to a `Cleared by …` marker). This prevents stale provenance text from accumulating. Scope: only clear when the write also clears the matching `<stage>_score` and `<stage>_rating`.

### 3. Database migration — one-time data repair

For rows currently in the broken state (stale on-behalf reason + null score + not N/A + status no longer at or past the corresponding stage), null `auto_advance_reason` so existing UPDATE attempts unblock immediately. Scoped audit: insert `kpi_audit_logs` rows with `action = 'RECONCILE_STATUS'`, `metadata.reason = 'bug047_stale_reason_repair_v1'`, `performed_by = NULL` per system-performer attribution policy.

### 4. Regression tests

Add to `src/test/bugBountyFixes.test.ts` under `BUG-047`:

- Existing on-behalf write with NULL score + N/A=false → still blocked (positive control).
- INSERT with on-behalf reason + score present → allowed.
- UPDATE that does **not** change `auto_advance_reason` and only modifies an unrelated column (e.g. `auditor_remarks`) on a row with stale on-behalf text → **allowed** (the regression we are fixing).
- Step-back path that clears `hr_pms_score` also clears `auto_advance_reason`.

### 5. Documentation sync

- `POLICY.md` §116: clarify guardrail is write-scoped (only fires on the write that sets the on-behalf reason). Add §116.x noting that cascade-clear paths must also clear `auto_advance_reason`.
- `mem/features/admin/admin-data-entry-workflow-controls`: update the BUG-047 paragraph with the stale-reason caveat and the new "write-scoped" semantics.
- `DOCUMENTATION.md` Version History: append entry "vX.Y.Z — BUG-047 stale-reason guardrail fix".

## Risk & Impact Report

| Area              | Impact / Mitigation                                                                                                      |
|-------------------|---------------------------------------------------------------------------------------------------------------------------|
| Data Impact       | One-time NULL of `auto_advance_reason` on stale rows; preserves all scores. Audit-logged. Scoped WHERE clause.            |
| Workflow Impact   | None for normal flows. AdminDataEntry on-behalf still requires score-or-N/A on the actual submit (POLICY §116 intact).    |
| UI/UX Consistency | None. Timeline ("on behalf of …") rendering uses `kpi_audit_logs` rows, not the live `auto_advance_reason` column.        |
| Regression Risk   | Trigger logic narrows enforcement — covered by new positive + negative unit tests in `bugBountyFixes.test.ts`.            |
| Mitigation        | Write-scoped check (`OLD IS DISTINCT FROM NEW`) + cascade-clear on step-back + tests covering both.                       |

## Files to Change

- `supabase/migrations/<timestamp>_bug047_write_scoped_guardrail.sql` — new
- `src/test/bugBountyFixes.test.ts` — new BUG-047 cases
- `POLICY.md` — §116 clarifications
- `DOCUMENTATION.md` — version history entry
- `mem/features/admin/admin-data-entry-workflow-controls` — updated note

Approve to implement.
