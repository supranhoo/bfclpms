## Problem (verified against DB)

**Prabhat Kumar Singh (101757)** — dept head of `Admin-Pollution` (39 active employees). Queue = **39**, correctly matches master data. Previously **~120** because instances still carried his id in `manager_id`/`dept_head_id`/`bu_head_id` for stages that were **not** in `enabled_stages`. Migration `20260717062346` (ghost-reviewer CAPA) nulled those columns → queue shrank to the truthful set.

**Umesh Kumar Mehta (100316)** — dept head of 7 departments. DB currently shows him mapped as `dept_head_id` on **79 instances** (59 `pending_dept`, 17 `pending_self`, 3 `pending_bu`). If his dashboard shows **zero**, this is **not** the same root cause as Prabhat — the mapping in the DB is intact. Likely a client-side or auth-context bug (needs live verification when logged in as him).

**Reviewer master data model** — a single profile can already be dept head of many departments (`departments.head_user_id` is 1:N with the profile). Prabhat is head of 1 dept today; if the business intent is that he heads more, that must be entered as master data — that is the SSOT the seeder reads.

## Two different bugs, one policy

| # | Symptom | Root cause | Fix |
|---|---------|------------|-----|
| 1 | Prabhat 120 → 39 | Ghost reviewer slots removed. 39 IS the truth per master data. He's mapped to only 1 dept. | **Master-data patch** + admin UI to map him (and any HOD) to additional departments; a **resync** re-seeds `dept_head_id` on open instances. |
| 2 | Umesh sees 0 despite 79 in DB | Not a data bug — client/auth issue. | Reproduce as Umesh in Playwright, capture RLS/API response, then patch the actual gap (RLS, auth.uid mismatch, or client filter). |

## Plan

### Phase 1 — RCA & impact scan (read-only, no data changes yet)
- **Diagnostic RPC** `annual_review_reviewer_slot_diagnostic(p_cycle_id)` returning, per active cycle instance:
  - resolved-from-master: `expected_manager_id`, `expected_dept_head_id`, `expected_bu_head_id`, `expected_hr_id` (from `profiles.reporting_manager_id`, `departments.head_user_id`, `business_units.head_user_id`, `org_head_config`)
  - actual columns
  - `mismatch_kind[]` (`missing_slot`, `wrong_person`, `stage_disabled_but_expected`, `orphan_head`)
- **Admin page** `AR Reviewer Coverage` (HR PMS / Admin only) — grouped by reviewer, shows before-fix count, expected count after resync, and downloadable CSV.
- Deliverable: exact list of every reviewer whose queue changed on 17-Jul and by how much. No writes.

### Phase 2 — Master-data completeness (Prabhat's case)
- Verify whether "Prabhat is dept head of additional departments" is a business fact. If yes:
  - Use existing `Departments` admin UI to assign `head_user_id = Prabhat` on the intended departments. Master data is SSOT.
  - No hardcoded per-person patch.
- If Umesh / others also need additional department assignments, they go through the same UI.

### Phase 3 — Idempotent resync
- **RPC** `resync_annual_review_reviewer_slots(p_cycle_id, p_dry_run boolean)`:
  - For each instance in cycle where `overall_status NOT IN ('completed','excluded')`:
    - Compute expected slots from master data + `enabled_stages` (a disabled stage stays NULL — 17-Jul rule preserved).
    - Update only the slots that differ.
  - Skips instances that have already advanced past the affected stage.
  - Full audit row per change into a new `annual_review_reviewer_resync_audit` table.
  - Dry-run mode returns diff without writing.
- **Trigger** on `departments`, `business_units`, `org_head_config` `AFTER UPDATE OF head_user_id / hr_head_user_id`: cascade the new head into open annual-review instances (only slots the trigger-audit hasn't manually overridden, and only if the stage is enabled). Prevents future drift.

### Phase 4 — Umesh case (client/auth investigation)
- Run Playwright as Umesh (via managed session injection) against `/annual-review/team`. Capture:
  - the actual `useReviewerInstancesPaginated` request / response
  - RLS-visible count with his JWT
  - client-side filter chain (scope, status, search)
- Fix the specific gap surfaced (only after evidence — could be RLS, could be `directoryAccess` denying, could be a stale query key).

### Phase 5 — Policy & tests
- **POLICY.md §AR-REVIEWER-SLOT-RESOLUTION**: rules for reviewer id columns
  1. `enabled_stages` is authoritative — disabled stage's id column MUST be NULL (17-Jul rule preserved).
  2. Enabled stage's id column MUST equal the master-data resolver's output at seed time, and must be cascaded on master-data change while status is still pre-that-stage.
  3. Manual overrides via `set_annual_review_reviewer_slot` audit-log the override reason; the trigger honors the override flag.
- **ADR-108** — Reviewer slot cascade contract.
- **Regression tests**:
  - `resync_annual_review_reviewer_slots.test.ts` — happy path, no double-writes, dry-run correctness, past-stage skip
  - `department_head_change_cascade.test.ts` — head change re-seeds only enabled + pre-that-stage rows
  - `reviewerRoleCounts.test.ts` — asserts counts match diagnostic RPC for known fixtures

### Out of scope
- Rolling back the 17-Jul ghost-slot null-out (that CAPA was correct and stays).
- Changing `enabled_stages` for existing instances (business owns that decision).
- Auto-enabling `manager` stage where the workflow doesn't include it.

## Deliverables
1. Diagnostic RPC + admin coverage page (Phase 1)
2. `resync_annual_review_reviewer_slots` RPC + cascade triggers (Phase 3)
3. Umesh-specific fix once Playwright evidence identifies the actual gap (Phase 4)
4. POLICY §AR-REVIEWER-SLOT-RESOLUTION + ADR-108 + regression tests (Phase 5)

## What I need from you before Phase 2 writes anything
- Confirm which **additional departments** Prabhat is supposed to head (so you or Admin can enter them via master data — I won't hardcode names).
- Any other reviewers currently showing wrong queue counts you already know about (helps prioritize Phase 4 reproduction list).