## Problem
Sajid Raza (100264) is a BU Head of "1050 TPD" and "3X100 TPD DRI", yet his Annual Review still lists **Dept Head → Jyoti Prakash Dwivedi (101789)** as stage 2. Per **POLICY §AR-BU-HEAD-TERMINAL (ADR-109)**, the `dept_head` stage must be stripped for any employee who heads at least one BU — self review is terminal for them (like Jaspal).

Same regression affects **19 BU-Head instances** in the active cycle. `is_bu_head()` still returns TRUE for them, but a later cascade/reset (rows updated today at 11:00 and 11:38 UTC) re-added `dept_head` to `enabled_stages` and re-populated `dept_head_id` from the department master.

## Root Cause (5-Why)
1. Why does Sajid see Dept Head? — `enabled_stages` includes `dept_head` and `dept_head_id` is set.
2. Why is it set on a BU Head? — Because a recent write path re-seeded stages from `annual_review_cycles.default_enabled_stages` without consulting `is_bu_head`.
3. Why did that write path skip the ADR-109 guard? — The BU-Head strip logic lives only in the initial seed RPC + the ADR-109 one-shot patch. The cascade triggers introduced with ADR-108/113 (department/BU cascades) and the template/cycle reset RPCs write `enabled_stages` and reviewer IDs directly, bypassing the guard.
4. Why isn't the guard enforced at DB level? — There is no `BEFORE INSERT/UPDATE` invariant trigger on `annual_review_instances` that removes `dept_head` (+ nulls `dept_head_id`) when `is_bu_head(employee_id)` is TRUE.
5. Why did QA not catch it? — Regression test for ADR-109 only exercised the seed RPC, not the cascade/reset paths.

## Fix Plan (surgical, additive)

### 1. DB — enforce invariant at the source
- New migration `20260718_ar_bu_head_terminal_invariant.sql`:
  - `CREATE OR REPLACE FUNCTION public.enforce_bu_head_terminal_stage()` — `BEFORE INSERT OR UPDATE OF enabled_stages, dept_head_id, employee_id ON annual_review_instances`. If `is_bu_head(NEW.employee_id)` then remove `'dept_head'` from `NEW.enabled_stages` (JSONB) and set `NEW.dept_head_id = NULL`. No-op otherwise.
  - Attach `trg_enforce_bu_head_terminal_stage`.
  - Repair the 19 affected rows in the same migration (idempotent UPDATE), and log to `annual_review_bu_head_terminal_audit_2026_07`.
- Rollback: `DROP TRIGGER` + revert UPDATE using audit table.

### 2. RPCs — belt & suspenders
- Patch cascade RPCs (`cascade_department_change`, `cascade_bu_change`, `resync_annual_review_dept_head`) and any cycle-reset RPC to call a helper `_strip_dept_stage_if_bu_head(instance_id)` after they write reviewer chains.

### 3. Tests
- `src/test/annualReview/buHeadTerminalStage.test.ts`:
  - Seed BU-Head instance → assert `enabled_stages` has no `dept_head`, `dept_head_id` NULL.
  - Simulate cascade RPC re-write → assert invariant re-holds.
  - Non-BU-Head unaffected (regression guard).
- DB regression in `src/tests/canSendNotificationToSchema.test.ts` style: SELECT count of BU-Head rows carrying `dept_head` — must be 0.

### 4. UI verification
No UI code change. `TeamReviewDetailContent`/stepper already renders from `enabled_stages`; once the array no longer contains `dept_head`, the "auto-skipped: BU Head (no reviewer mapped)" line disappears and Self Review becomes the terminal stage — matching Jaspal's flow.

### 5. Documentation & Policy
- `docs/adr/ADR-109.md`: append "v2 — 2026-07-18: promoted from one-shot patch to DB-enforced invariant after regression via cascade/reset RPCs." 
- `POLICY.md` §AR-BU-HEAD-TERMINAL: add "Invariant is enforced by trigger `trg_enforce_bu_head_terminal_stage`; any write path that populates `enabled_stages` or `dept_head_id` for a BU Head is auto-corrected."
- `DOCUMENTATION.md` version history: v2.66.121.

## Risk & Impact
- **Data:** 19 rows updated (nulling `dept_head_id`, removing `dept_head` from `enabled_stages`). All in `pending_self`/pre-dept-head status, no completed dept-head reviews will be discarded (verified via status check). Audit row per change.
- **Workflow:** BU Heads whose reviews were incorrectly queued to a subordinate Dept Head will now terminate at Self. This matches the stated policy.
- **UI:** Stepper drops the Dept Head node for these employees. No component changes.
- **Regression risk:** Low — trigger is scoped to `is_bu_head=TRUE` rows only; non-BU-heads untouched. Existing ADR-109 tests plus new invariant tests protect the guarantee.
- **Rollback:** `DROP TRIGGER` restores prior behaviour; audit table lets us re-apply old chains if ever needed.

## Verification after build
- Re-query: `SELECT COUNT(*) FROM annual_review_instances WHERE enabled_stages ? 'dept_head' AND is_bu_head(employee_id)` → expect **0**.
- Reload Sajid Raza's review page → stepper shows only "Self Review" as active stage, no auto-skip banner for BU Head, no Dept Head node.
