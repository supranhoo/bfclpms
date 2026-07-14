## Issue

Employee 101896 gets **"Submission Failed — Employees cannot modify reviewer or workflow fields on review_submissions (self-guard)"** when submitting/updating a self-review.

## Root Cause

The self-guard trigger `tg_review_submissions_self_column_guard` (migration `20260713084902`) blocks any UPDATE on `review_submissions` from a non-privileged user when certain columns change — including `kpi_status` and `is_na`.

The self-submit path goes through the SECURITY DEFINER RPC `submit_self_review` (migration `20260713134241`), which does:

```
INSERT INTO review_submissions (... kpi_status='submitted' ...)
ON CONFLICT (kpi_id) DO UPDATE SET ... kpi_status = EXCLUDED.kpi_status ...
```

When a `review_submissions` row **already exists** (typical for a re-submit after admin step-back, or for a KPI that had a KRA-set draft row), the ON CONFLICT branch fires an UPDATE. Inside the trigger, `auth.uid()` still returns the calling employee (SECURITY DEFINER does not change `auth.uid()`), the employee is not privileged, and `kpi_status` transitions from e.g. `open`/`self_review` → `submitted` — so `IS DISTINCT FROM OLD.kpi_status` is true and the trigger raises.

Employee 101896's row already existed (evident from prior period activity in the screenshot — several months already `APPROVED`), so every re-submit attempt hits the UPDATE branch and fails.

This is a regression introduced by the July-13 self-guard trigger against the July-13 v2 atomic RPC — the two migrations were not aware of each other.

## Fix Plan

Introduce a session-scoped bypass flag that only `submit_self_review` (and other trusted SECURITY DEFINER writers) can raise, and teach the trigger to honor it. This keeps the guard intact for all client-side writes while unblocking the legitimate atomic RPC.

### Migration

1. Trigger patch — `tg_review_submissions_self_column_guard`:
   - At the top, read `current_setting('app.self_submit_bypass', true)`. If it equals `'on'`, `RETURN COALESCE(NEW, OLD)` immediately (skip all checks). Everything else stays identical.

2. RPC patch — `submit_self_review`:
   - At the start of the function body: `PERFORM set_config('app.self_submit_bypass', 'on', true);` (transaction-local — `true` means LOCAL, auto-cleared at txn end, cannot leak to other statements outside the RPC's txn).
   - No signature change, no behaviour change for callers.

3. No schema changes, no data changes.

### Verification

- Reproduce 101896's scenario in a scratch txn (existing row + employee UID) and confirm the RPC succeeds.
- Confirm a direct client-side UPDATE that tries to change `kpi_status` / `manager_score` / etc. from the employee's session still raises (guard intact).
- `supabase--read_query` a quick check on 101896's row before/after.

### Tests

- Add SQL comment + policy note in `POLICY.md` §SELF-REVIEW-SUBMIT-ORDER cross-referencing §REVIEW-SUBMISSION-SELF-UPDATE-GUARD, documenting the bypass GUC contract (name, scope=LOCAL, only settable inside vetted SECURITY DEFINER functions).
- Extend existing self-guard test (if present) with a case that runs through `submit_self_review` on an existing row and asserts success.

### Risk & Impact

- Data: none. No schema changes.
- Security: bypass is a transaction-local GUC set only inside `submit_self_review`; client-side writes cannot set it in a way that survives to the trigger's evaluation without going through a definer function we control. RLS unchanged.
- Regression: minimal — the trigger's behaviour is unchanged for every path except the vetted RPC.
- Rollback: revert the two `CREATE OR REPLACE` bodies to their previous versions.

## Follow-up (documentation)

- `POLICY.md` — annotate §SELF-REVIEW-SUBMIT-ORDER and §REVIEW-SUBMISSION-SELF-UPDATE-GUARD with the shared bypass GUC contract.
- `DOCUMENTATION.md` — Version History entry: "Self-submit RPC bypasses self-column guard via LOCAL GUC `app.self_submit_bypass`."
