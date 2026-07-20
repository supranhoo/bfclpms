
## Confirmed root cause (verified against live data for 100972)

Instance `d7b9c891…` for **Sourav Kumar Jaiswal (100972)**:

- `enabled_stages = ["self","dept_head","bu_head"]` — HR stage is **not** part of this employee's chain (per POLICY §AR-BU-HEAD-TERMINAL / ADR-109).
- Terminal locked response: `bu_head` on 2026-07-20 → status went to `completed`.

The RPC `rollback_annual_review_completed` (migration `20260705120009`) hardcodes the exit state:

```
UPDATE annual_review_responses SET is_locked=false … WHERE reviewer_role = 'hr';
UPDATE annual_review_instances SET overall_status = 'pending_hr', … ;
RETURN 'pending_hr';
```

So for 100972 the rollback:

1. Sets status to `pending_hr` — a stage that isn't in this instance's chain (dead-end; the HR sheet isn't reachable).
2. Unlocks a non-existent `hr` response row → 0 rows updated, nothing actually reopened.
3. The dialog copy also promises "returns the instance to **pending HR**", which contradicts the BU-Head-terminal policy.

Net effect: the review appears "rolled back" but is stuck in a phantom state with no reviewer able to act. Same bug affects every BU-Head-terminal (ADR-109) or Dept-Head-terminal instance, and any future instance where HR is disabled.

## Fix — target the actual terminal stage

Introduce a resolver that picks the terminal reviewer stage from the instance's `enabled_stages`, then unlock that stage's response and set `overall_status` to its matching `pending_*`. HR-terminal instances continue to behave exactly as today.

### 1. Migration `20260721000000_rollback_to_actual_terminal_stage.sql`

Replace `public.rollback_annual_review_completed(uuid, text)`:

- Compute `v_terminal_stage` = the highest-seniority stage present in `enabled_stages`, walking `hr → bu_head → dept_head → skip_manager → manager → self`.
- Map to status: `hr→pending_hr`, `bu_head→pending_bu`, `dept_head→pending_dept`, `skip_manager→pending_skip`, `manager→pending_manager`. Refuse to roll back if terminal is `self` (nothing to unlock upstream).
- Unlock the terminal-stage response (`UPDATE … WHERE reviewer_role = v_terminal_stage`).
- Set `overall_status = v_new_status`, clear `final_rating / hr_remarks / finalized_at / finalized_by / total_score / criteria_weighted_score` (aligns with ADR-124 which now populates these on `completed`).
- Audit-log includes `terminal_stage`, `to_status`, previous scores + reason (extends existing `annual_review.rollback_finalized` payload — no new action name so downstream notification mapping is untouched).
- Keep admin / hr_pms authorization and 3-char reason guard.

Regression guards inside the RPC:

- If `enabled_stages` is empty or malformed → `RAISE EXCEPTION 'enabled_stages missing on instance %'`.
- If the terminal response row is missing → `RAISE EXCEPTION` (don't silently leave the instance half-open).

### 2. UI — `AnnualReviewAdmin.tsx` rollback dialog (lines 1240-1290)

- Read the terminal stage from the selected `rollbackFor` instance (same resolver, TS mirror in `src/lib/annualReview/terminalStage.ts` — new file, ~15 lines).
- Replace the hardcoded "returns the instance to **pending HR**" copy with `returns the instance to **{terminalStageLabel}**` (e.g. "pending BU Head review").
- Disable the "Roll back" button when terminal stage is `self` (rare; nothing to roll back to).

### 3. Tests

- `src/lib/annualReview/terminalStage.test.ts` — covers HR-enabled, BU-terminal (ADR-109), Dept-terminal, and manager-only chains.
- `supabase/tests/rollback_annual_review_completed.spec.sql` (via `pgTAP`-style asserts in a repair script or a dedicated Vitest against a seeded fixture) — asserts:
  - HR-enabled chain → status `pending_hr`, HR response unlocked.
  - BU-terminal chain (100972 shape) → status `pending_bu`, BU response unlocked, HR row untouched.
  - Dept-terminal chain → status `pending_dept`.
  - Non-completed instance → raises.
  - Missing reason → raises.

### 4. One-shot repair for 100972 (and any similar drift)

Same migration, at the tail:

```sql
-- Repair instances that were rolled back to pending_hr but have no HR in
-- enabled_stages (they are the ones stranded by the old RPC).
WITH stranded AS (
  SELECT id FROM annual_review_instances
   WHERE overall_status = 'pending_hr'
     AND NOT (enabled_stages ? 'hr')
)
UPDATE annual_review_instances i
   SET overall_status = CASE
     WHEN enabled_stages ? 'bu_head'   THEN 'pending_bu'
     WHEN enabled_stages ? 'dept_head' THEN 'pending_dept'
     WHEN enabled_stages ? 'skip_manager' THEN 'pending_skip'
     WHEN enabled_stages ? 'manager'   THEN 'pending_manager'
     ELSE overall_status
   END,
       updated_at = now()
  FROM stranded WHERE i.id = stranded.id;
```

Paired with an `UPDATE annual_review_responses … is_locked = false` for the matching terminal role, and an audit-log row per repaired instance (`action = 'annual_review.rollback_repair_terminal_stage'`, metadata cites this ADR).

### 5. Docs / POLICY

- New **ADR-129 — Rollback lands on effective terminal stage**.
- **POLICY §AR-ROLLBACK-TERMINAL-STAGE**: rollback always returns to the highest-seniority reviewer in `enabled_stages`; HR is only the target when HR is part of the chain.
- Update `DOCUMENTATION.md` v2.66.119 change log.

## Risk & Impact

- **Data**: additive migration + one-shot repair. No destructive schema change. Audit trail preserved and extended.
- **Workflow**: HR-terminal reviews behave identically (regression-tested). BU/Dept-terminal reviews now correctly reopen to the right person.
- **UI**: dialog copy is dynamic; button is disabled only in the degenerate `self`-only case.
- **Regression risk**: low — the RPC surface stays the same (same name, same args, same return type).
- **Rollback of this fix**: revert migration → old RPC restored; repaired instances stay in the correct `pending_*` state (which is what they should have been all along).

## Out of scope (explicit)

- Not touching `send_back_annual_review_status`, notifications, or the KPI-side `RollbackRequestDialog`.
- Not changing who is authorized to trigger rollback.
