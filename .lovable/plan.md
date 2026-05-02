# Fix: Misleading "Nothing to propagate — past initial stage" message

## Root Cause Analysis

**KPI**: "Completion of Mandated Average Training Hours" — April 2026, 13 employees, scope per-employee.

**Forensic timeline** (from `kpi_audit_logs` + `org_kpi_values` + `review_submissions`):

| Time         | Event                                                                                   |
|--------------|-----------------------------------------------------------------------------------------|
| 12:34:41–45  | Data owner clicked **Propagate** the first time. RPC advanced all 13 KPIs `kra_set` → `self_review`, wrote `review_submissions` (achieved=100, self_score=5). All `org_kpi_values.status = 'propagated'`. |
| 12:36:23–39  | Data owner clicked **Propagate** again (~2 min later). Every employee KPI was already `self_review`, so the RPC skipped all 13 and emitted `PROPAGATION_PARTIAL` audit rows. The UI fired 13 destructive toasts; the user only sees the last one: *"All 1 matching KPI(s) are already past the initial stage."* |

**Nothing is actually stuck.** All 13 review submissions are present with achieved_value=100 and self_score=5. The second Propagate click was a no-op. The error message is misleading because:

1. The toast variant is `destructive` (red) — looks like a failure.
2. The text "past the initial stage" implies a problem the data owner needs to fix, when in reality the propagation is already complete.
3. The card UI ("1 Pending" badge, red completion bar) reinforces the impression that something is broken, even though the system is in the correct end state.

The underlying RPC behaviour is **correct and intentional** (POLICY §88 Submission Snapshot Immutability — a data owner's edit must not silently overwrite an in-flight self-review). The bug is purely in **how the result is communicated to the user**.

## What to Build

### 1. Re-classify the toast — informational, not destructive

In `src/hooks/usePropagateOrgKpiValue.ts`:

- When `propagatedCount === 0 && skippedCount > 0` AND every skip reason is `not_in_kra_set` (i.e. employees have already moved past self-review), change the toast from `variant: 'destructive'` to default and rewrite the copy:

  > **"Already propagated"**
  > "All N matching KPI(s) have already advanced past the data-owner stage. The previously propagated values are still in place — re-propagation is blocked once an employee has self-reviewed (POLICY §88)."

- Keep `destructive` variant only for genuine failures (`kpi_not_found`, `race_lost_during_advance`).

### 2. Per-batch toast dedup

In `executeSaveAndPropagate` (`src/pages/admin/OrgKpiDataEntry.tsx`), the per-employee loop fires `propagate.mutateAsync` once per scope, each emitting its own toast. For a 13-employee batch this is 13 stacked toasts. Suppress per-call toasts during a batch and emit a single summary toast at the end:

- Add `silent?: boolean` flag to `usePropagateOrgKpiValue` (skips its own `onSuccess` toast when set).
- Aggregate `{ propagated, skipped, alreadyDone }` totals across the loop and emit one summary: *"Propagated to N employees. M already up to date."*

### 3. Card status — recognise "already propagated, employees moved on"

In `OrgKpiDataEntry.tsx > getKpiStatus`, the current logic flags `'stuck'` only when child KPI is still `kra_set`. It does NOT recognise the legitimate "all OKVs propagated, all employees self-reviewing" state. Add a `'in_review'` (or merge with `'propagated'`) bucket so the card shows green / completed instead of red 0% — and the category badge stops counting it as "1 Pending".

Specifically: when scope=employee/department, OKVs are all `propagated`/`approved`, AND every child KPI is at `self_review` or beyond, the card status should be `'propagated'` (not `'stuck'`).

### 4. Documentation + memory sync

- POLICY.md §88: append clarification that re-propagation is blocked once a child KPI has advanced past `kra_set`, and that this is by design (snapshot immutability) — not a recoverable error.
- mem `org-kpi-management-suite`: note the toast re-classification rule for "already propagated" vs "failure".

### 5. Regression tests

`src/test/` — add tests for `usePropagateOrgKpiValue`:
- All-past-kra_set result → informational toast, NOT destructive.
- Mixed (some kra_set, some not) → "Partial: N propagated, M already past stage" — still informational.
- True race-loss / kpi_not_found → destructive toast preserved.

## Risk & Impact Report

| Area              | Impact / Mitigation                                                                                                     |
|-------------------|-------------------------------------------------------------------------------------------------------------------------|
| Data Impact       | None. No DB writes change. RPC behaviour preserved (still blocks overwrite — POLICY §88 intact).                         |
| Workflow Impact   | None. Re-propagation remains blocked once self-review starts — only the user-facing message and card state change.        |
| UI/UX Consistency | Card no longer falsely flags propagated rows as red "Pending"; toast no longer falsely flags as failure.                  |
| Regression Risk   | Low — only message + status-classification logic changes. Existing tests for propagation success path are unaffected.    |
| Mitigation        | New unit tests cover all three result branches; `'silent'` flag is opt-in and defaults preserve current behaviour.        |

## Files to Change

- `src/hooks/usePropagateOrgKpiValue.ts` — toast re-classification + `silent` option
- `src/pages/admin/OrgKpiDataEntry.tsx` — batch summary toast + `getKpiStatus` recognises `in_review`/`propagated`
- `POLICY.md` — §88 clarification
- `mem/features/admin/org-kpi-management-suite` — re-propagation messaging rule
- `src/test/` — new tests for propagation result classification

Approve to implement.
