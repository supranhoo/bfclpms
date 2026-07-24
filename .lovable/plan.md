
## Finding (verified against live data)

Current cycle **Annual Review 2025-2026** has **82 instances with the Management stage enabled**:

| Bucket | Count | Status now |
|---|---|---|
| A. Direct report of Gaurav Budhia (correct) | 25 | 17 `pending_management`, 8 earlier stages |
| C. NOT reporting to any Management user (over-mapped) | 57 | 56 `pending_bu`, 1 `excluded` |

Response check on the 57 suspects: only **Self** responses exist and are locked. **No management-stage responses**, no dept/BU locked rows — so removing the stage from these instances orphans nothing.

Root cause: the `enforce_management_terminal_stage` trigger (ADR-138 / ADR-154) currently adds `management` to `enabled_stages` for **all BU Heads** and for anyone whose reporting manager has the Management role. The BU-Head branch is too broad — the desired rule is only "reporting_manager is a Management user".

## Goal

Management stage must apply **only** to employees whose active reporting manager holds the `management` role (today: Gaurav Budhia's 24 active direct reports + Jaspal via explicit override).

## Plan

### 1. Migration — tighten the trigger (SSOT)

Rewrite `enforce_management_terminal_stage()` so it:

- Adds `management` **only** when `profiles.reporting_manager_id` resolves to an active user with the `management` role, OR an explicit `annual_review_assignment_overrides` row exists for `role='management'`.
- Removes `management` for any instance where neither condition holds — but **only** if no locked management response exists (safety guard).
- Preserves ADR-156 BU-terminal overrides (they already suppress management for the 5 opt-outs).
- Preserves ADR-157 admin overrides (explicit reassignments stay authoritative).

### 2. Migration — one-off reconciliation of the 57 mis-mapped rows

For each instance where `enabled_stages ? 'management'` AND the employee does not report to a Management user AND no override exists AND no locked `management` response exists:

- Remove `'management'` from `enabled_stages`.
- Clear `management_id`.
- If `overall_status = 'pending_management'` (shouldn't be any today — verified 0), roll it back to the last real terminal stage using the same logic as ADR-136.
- Leave `pending_bu` rows exactly as-is — they simply resume finishing at BU Head.
- Insert an `annual_review_access_audit` row per instance (`action = 'management_stage.stripped'`, reason "ADR-158 scope correction: employee does not report to Management").

### 3. Insurance / no-orphan guarantees

- **Pre-flight assert inside the migration**: `SELECT count(*) FROM annual_review_responses r JOIN target t ON t.id=r.instance_id WHERE r.reviewer_role='management' AND r.is_locked` must equal 0, else `RAISE EXCEPTION` and abort.
- **Archive snapshot** of the 57 affected `(instance_id, enabled_stages, management_id, overall_status)` tuples into a `annual_review_mgmt_scope_backfill_2026_07` table so the change is trivially reversible.
- **Post-migration assert**: every touched instance still has at least one reviewer stage; no instance has `overall_status` orphaned to a stage no longer in `enabled_stages`.
- **Trigger tests** (unit + SQL):
  - Employee with `reporting_manager_id = Gaurav` → keeps `management` on next update.
  - BU Head not reporting to Management → does not get `management`.
  - Explicit override → wins over both rules.
  - Instance with a locked management response → trigger never strips it.

### 4. UI verification (read-only)

Reload Annual Review Admin → Progress and confirm:

- Gaurav's Management queue count drops from ~82 to ~17 (only real `pending_management` rows).
- The 56 `pending_bu` rows now show `Self → BU Head` as their chain and are visible to their real BU Head.
- Jaspal (101125) still shows `Self → Management` (Gaurav) via override.

### 5. Documentation

- `DOCUMENTATION.md`: add ADR-158 "Management stage scope = direct reports of Management role only".
- `POLICY.md`: replace §AR-MGMT-TERMINAL with the corrected rule + override precedence table.

## Technical notes

- Migration file: `20260718XXXXXX_adr158_mgmt_scope.sql`.
- No frontend changes required — `useReviewerCandidates` and the ADR-157 dialog already honour whatever `enabled_stages` says.
- Rollback path: `INSERT INTO annual_review_instances (...) SELECT ... FROM annual_review_mgmt_scope_backfill_2026_07 ON CONFLICT (id) DO UPDATE ...` — kept in migration as a commented `-- REVERT` block.
