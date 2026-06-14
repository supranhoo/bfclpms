# Annual Review Module — Policy

_Business rules. Update in the same PR as any logic change._

## Eligibility
- Seeding scopes to `is_active = true AND is_dummy_employee = false`.
- Rule matching is priority-ordered (lower wins). Empty filter set matches all.
- Filter dimensions: designation, pms_grade, level, department, business unit (joined via department).

## Reviewer chain
- Snapshotted at seed time from `profiles.reporting_manager_id` (manager → skip → bu_head). HR is the configured HR user.
- Mid-cycle change: HR/admin inserts an `annual_review_assignment_overrides` row. Overrides take precedence over the snapshot for that instance + role.

## Stages & status
- `not_started → pending_self → pending_manager → pending_skip → pending_bu → pending_hr → completed`.
- Send-back reverts to the previous stage and clears `is_locked` on the affected response.

## Scoring
- Criteria score cascades HR → BU → Skip → Manager → Self (first non-empty wins).
- Overall = criteria score + system scores, capped at 100.
- `final_rating` is mutable only via `override_annual_review_rating` (reason ≥ 3 chars, audit-logged) until cycle is closed.

## Acknowledgment & rebuttal
- Employees may acknowledge and optionally add a rebuttal note.
- Allowed even after the cycle is closed (explicit carve-out on `block_when_annual_cycle_closed`).

## Cycle lifecycle
- `draft → active → closed` is the happy path. `closed → active` only via `reopen_annual_review_cycle` (HR/admin, mandatory reason, audit-logged).
- Reopen is always manual.

## Bulk operations
- Bulk finalize affects only `pending_hr` instances.
- Bulk send-back skips `pending_self`, `not_started`, `completed`.
- Both record per-instance audit entries.

## Reporting
- `/reports/annual-review` is read-only. Bulk operations live in Admin → Progress only.
- Exports cover the currently visible page (≤ 100 rows). Narrow filters for wider exports.

## Version history
- 2026-06-14 — Initial policy. Documented reopen, reassignment override precedence, and export scope.