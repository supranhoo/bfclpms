
## Status of yesterday's work (ADR-138 + ADR-148)

Both pieces are shipped and live:

- **ADR-138** — `management` reviewer role, `pending_management` status, auto-assign triggers, and RPC advancement to the management terminal stage.
- **ADR-148** — Admin backfill for historic instances that pre-date ADR-138. Ships as:
  - RPCs `get_management_seeding_gaps(mgmt_uid)` and `backfill_management_stage_for_manager(mgmt_uid, reopen_completed, dry_run, reason)`.
  - Admin UI card **Annual Review → Access Control → "Management stage backfill (ADR-148)"** with preview + audited execute.

Yesterday's session only demonstrated it against Jaspal. The rest of the population was not yet backfilled.

## Current data (verified now)

Across the org there are **2 Management users** (Gaurav Budhia, and a "Dummy" test account) with **20 active BU Heads** reporting directly into them:

| Instance state | Count | `enabled_stages` has `management` | `management_id` populated |
|---|---|---|---|
| `pending_self` | 5 | no | no |
| `pending_dept` | 1 | no | no |
| `completed`    | 14 | no | no |

Not a single one of the 20 BU-Head instances has the management stage on it today — including 14 that already reached `completed` at the BU-Head stage (Jaspal is one of them; the screenshot shows exactly this: "1 stage auto-skipped: BU Head" with `Completed`).

Reason they are not auto-mapped: the ADR-138 trigger only fires on writes. These 20 rows were seeded before ADR-138 landed and have not been touched since.

## What "map to Management for final review" means operationally

For each of the 20 BU Heads we need to:

1. Append `'management'` to `enabled_stages`.
2. Set `management_id = <their reporting_manager_id>` (Gaurav / Dummy).
3. For the 14 `completed` rows: demote to `pending_management`, null `final_rating` / recompute-eligible fields, snapshot old row to `annual_review_reset_archive`, and audit-log the reopen.
4. For the 6 in-flight rows: just stamp the terminal stage — no status change; they will naturally flow to `pending_management` when the current stage completes.

All of the above is exactly what `backfill_management_stage_for_manager` already does. No new RPC required.

## Plan

### Step 1 — Run the existing backfill for each Management user (no code change)

Admin flow via **Access Control → "Management stage backfill (ADR-148)"**:

1. Select **Gaurav Budhia** → Preview gaps (expect 19 rows: 4 pending_self, 1 pending_dept, 14 completed) → tick **Reopen completed rows** → reason: "ADR-148 rollout to all BU Heads under Gaurav" → Execute.
2. Repeat for **Dummy** (1 row — Jaspal) if that is a real management account; otherwise skip and instead point Jaspal's reporting manager to Gaurav in User Management, then run Gaurav's backfill again. (Confirmation needed — see question below.)

Post-run verification query: re-check the state table above — expect all 20 rows to have `has_mgmt_stage=true`, `mgmt_id_set=true`, and the 14 previously-completed rows to be `pending_management`.

### Step 2 — Small UX addition: "Backfill all Management users" bulk button

Right now the admin has to pick each management user one by one from the dropdown. Add one button beside the existing card that:

- Calls a new thin RPC `backfill_management_stage_all(p_reopen_completed boolean, p_dry_run boolean, p_reason text)` which iterates every user with `role='management'` and calls the existing per-user RPC in a single transaction, aggregating the counters.
- Returns a per-manager breakdown for the toast.
- Reuses the same audit + archive plumbing (no new audit table).

Rationale: prevents future drift when a new Management user is granted the role — one click covers everyone.

### Step 3 — Documentation

- Append an "Operations" note to `docs/adr/ADR-148.md` describing the rollout event (date, executor, counts) and the new bulk RPC.
- Update `POLICY.md` §AR-MANAGEMENT-TERMINAL to explicitly state: whenever a user is granted the `management` role, admin must run the bulk backfill so historic instances are captured (the on-write trigger only handles new instances).

## Risk & Impact

- **Data**: 14 completed rows for Gaurav's BU-Head reports will move back to `pending_management`. Original values are snapshotted to `annual_review_reset_archive`, so rollback is a single archive-restore call. No score data is destroyed.
- **Workflow**: BU Heads who were "done" will see their row reopen; Gaurav's Management queue will jump by ~19 items. Notify Gaurav before running.
- **UI/UX**: No change to reviewer screens — the management stage already renders (ADR-138). The new bulk button is additive.
- **Regression**: Low. Bulk RPC is a loop over an already-hardened per-user RPC.
- **Rollback**: `annual_review_reset_archive` rows written during backfill can be restored per-instance.

## Open question before build

The database shows a second management user labelled **"Dummy"** who currently owns Jaspal's reporting line. Do you want me to:

- **(a)** treat "Dummy" as a real management account and include it in the bulk backfill, or
- **(b)** first repoint Jaspal's `reporting_manager_id` to Gaurav Budhia (via User Management), remove the `management` role from "Dummy", and then run only Gaurav's backfill?

I recommend **(b)** — one Management user is easier to govern and matches the intent that "all BU Heads roll up to Management (Gaurav)".

## Technical notes (for engineering)

- Existing RPC signature (do not change): `backfill_management_stage_for_manager(p_management_uid uuid, p_reopen_completed boolean, p_dry_run boolean, p_reason text)` — migration `20260723161413`.
- New RPC signature: `backfill_management_stage_all(p_reopen_completed boolean DEFAULT false, p_dry_run boolean DEFAULT true, p_reason text DEFAULT 'ADR-148 bulk rollout') RETURNS TABLE(management_uid uuid, management_name text, gap_count int, backfilled_count int, reopened_count int)`. SECURITY DEFINER, `search_path=public`, GRANT EXECUTE to `authenticated, service_role`, admin-only guard via `has_role(auth.uid(),'admin')`.
- New hook: extend `src/hooks/useAccessControlAdmin.ts` with `useBackfillAllManagement()` mirroring the existing per-user mutation.
- UI: add a secondary button in the ADR-148 card in `src/components/annual-review/AccessControlTab.tsx` next to the per-user "Execute", opening the same reason+reopen dialog.
- Tests: `src/test/annualReview/backfillManagementBulk.test.ts` covering dry-run aggregation, no-op when no management users, and reopen counter correctness (RPC mocked).
