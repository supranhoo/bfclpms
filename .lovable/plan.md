## Issue
Jai Prakash Kumar Das (102044) — instance `b58a9e27` in cycle "Annual Review - 2025-2026" is stuck at `overall_status = 'not_started'`. He is the **only** instance in this state across 2,580 rows (all others are `pending_self`/`pending_dept`/`pending_bu`/`pending_management`/`completed`/`excluded`).

## Verified state
- Employee active, has manager (dept_head mapped to Md Humayun, bu_head mapped to Jitendra Kumar Dwivedi).
- `enabled_stages = ["self","dept_head","bu_head"]` — correct BU-terminal chain for JE-SE.
- Template attached: `036143d1-…` (FAD E&I variant).
- Zero rows in `annual_review_responses` for the instance — employee never got to open the self-review form because the status never advanced past `not_started`.
- Cycle is `active`.

## Root cause (unconfirmed, needs one query in build)
`not_started → pending_self` transition normally happens at cycle activation / seeder finalize. This one instance was created 2026-07-06 but the transition trigger/RPC missed it (likely a seeder run that partially failed on this row — no override, no audit event for advance). Since it is a single-row outlier, this is a data-repair case, not a systemic bug requiring a new migration.

## Fix plan
1. **Read-only verify** (one query): confirm no `annual_review_responses` rows and no `annual_review_access_audit` entries indicating a prior manual regression for this instance. If a regression exists, treat as ADR-155-style rewind and stop for review.
2. **Repair migration** — single-row `UPDATE`:
   - `overall_status = 'pending_self'`
   - `updated_at = now()`
   - Insert one `annual_review_access_audit` row: `action = 'annual_review.stage_repair'`, `metadata = { from: 'not_started', to: 'pending_self', reason: 'seeder-missed transition, single-instance repair' }`.
3. **Verify** after migration: re-query the row, confirm `pending_self`, and confirm Jai can now see the editable self-review form (queue RPC will surface it to him).

## Not doing
- No trigger / RPC change. One stuck row out of 2,580 is not a systemic defect — introducing a "sweep `not_started` on cycle activation" job would risk re-seeding legitimately excluded rows and violates the surgical-change rule.
- No ADR — repair only. Note added to the existing operations memory under a one-line entry if you want it recorded.

## Rollback
Repair is a single `UPDATE` + one audit-log row. Rollback = set status back to `not_started` and delete the audit row by its id.
