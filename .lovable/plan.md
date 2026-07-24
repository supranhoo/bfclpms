# Revert Non-Gaurav-Reporting BU Heads from Management Stage

## Findings (verified)

Only 5 instances currently have the `management` stage stamped on an employee who does not report to Gaurav Budhia (`b796a417-…`). All 5 are pointing at the "Dummy" placeholder user (001), not Gaurav — this is a leftover from the Management backfill that ran before we had a reporting-manager filter.

| Emp Code | Employee | Reports To | overall_status | enabled_stages |
|---|---|---|---|---|
| 101711 | Dhiraj Kumar Chaturbedi | Jaspal (BU Head) | excluded | self, management |
| 100001 | Gaurav Budhia | — (top of org) | excluded | self, management |
| 101125 | Jaspal | — (no real upline) | pending_management | self, management |
| 101963 | Shyam Sundar Hati | Sajid Raza (BU Head) | completed | self, management |
| 100600 | Umesh Kumar Singh | Piyush Bansal (BU Head) | pending_bu | self, management |

## Plan

### 1. Revert the 3 with a real BU-Head upline (Shyam, Umesh, Dhiraj)
For each of `101963`, `100600`, `101711`:
- Strip `management` from `enabled_stages` → chain becomes `["self","bu_head"]` (or `["self"]` if bu_head_id is null; re-resolve via existing seeder helper).
- Null `management_id`.
- Recompute `overall_status` based on locked responses:
  - `101963` Shyam (currently `completed`) → if a `bu_head` response is locked, keep `completed`; otherwise roll back to `pending_bu`. Audit the rollback either way.
  - `100600` Umesh → already `pending_bu`, unchanged.
  - `101711` Dhiraj → `excluded` unchanged.
- Write audit rows to `annual_review_access_audit` with action `management_stage_reverted` and the previous vs new `enabled_stages`/`management_id`.

### 2. Leave Jaspal (101125) and Gaurav (100001) as-is for now
Both genuinely have no upline above them. Reverting Jaspal would remove the only active reviewer (he'd end at `self` → auto-complete without oversight). Gaurav is `excluded` anyway. **Decision needed from user only if they want these two also stripped** — flagged in the closing question.

### 3. Guard future backfills
Update `backfill_management_stage_all` (and the trigger `enforce_management_terminal_stage` used by seeders) to skip employees whose `reporting_manager_id` is NULL or does not resolve to a user with the `management` role. Emit a skip row in the existing audit table so admins can see who was excluded and why.

### 4. Documentation
- New ADR-152 "Management stage is scoped to Management's direct reports".
- Update `POLICY.md §AR-MANAGEMENT-STAGE`.
- Update mem entry for the Management-terminal feature.

## Risk & Impact

- **Data**: 3 instances mutated; 1 (`Shyam`) may roll back from `completed` → `pending_bu`. Fully audited; reversible via the audit rows.
- **Workflow**: Sajid Raza and Piyush Bansal regain their correct terminal reviewer role for these employees; Jaspal regains Dhiraj.
- **UI/UX**: Stepper for the 3 employees will show `Self → BU Head` instead of `Self → Management`.
- **Regression**: The backfill guard prevents recurrence but does not touch other Management-mapped instances (Gaurav's real reports remain intact — verified none in the affected set report to Gaurav).
- **Rollback**: Every change is captured in `annual_review_access_audit`; a single UPDATE reversing the audited row restores prior state.

## Tests
- Unit test on `effectiveChain.ts`: BU Head whose reporting_manager is not Management-role → chain terminates at `bu_head`, no `management` stage.
- SQL test: backfill RPC with a non-Management upline → skip + audit row written, no `enabled_stages` change.

## Open question for user (non-blocking)
Should Jaspal (101125) also be reverted to `self`-only (his ADR-109 BU-head-terminal state)? If yes, his current `pending_management` status disappears and the review auto-completes on self-submit. Default: **leave Jaspal untouched**.
