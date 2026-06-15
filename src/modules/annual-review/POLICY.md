# Annual Review Module — Policy

_Business rules. Update in the same PR as any logic change._

## Eligibility
- Seeding scopes to `is_active = true AND is_dummy_employee = false`.
- Rule matching is priority-ordered (lower wins). Empty filter set matches all.
- Filter dimensions: designation, pms_grade, level, department, business unit (joined via department).
- Seeder MUST page the `profiles` read via `fetchAllPaged` (POLICY §94 / `mem://architecture/profiles-query-policy`). The active roster exceeds the 1000-row PostgREST cap; an unranged read silently drops >60% of employees.

### Single-employee template assignment
There is no per-employee template field today — assignment is purely rule-based.
To target one individual:
1. Open **Admin → Rules**, pick the active cycle.
2. Create a new rule whose filters uniquely identify that employee
   (e.g. their exact `designation` + `department`, or `designation` + `pms_grade` + `level`).
3. Set **priority = 1** so this rule wins before any broader rule.
4. Pick the desired template and save.
5. Click **Seed instances by rules**.

Caveats:
- The seeder upsert is idempotent on `(employee_id, cycle_id)` but does **not** rewrite `template_id` on an already-seeded instance. To change a template post-seed today, delete the instance row (admin SQL) and re-seed, or wait for the per-employee override feature (see `.lovable/plan.md` Part B).
- If your filter combo also matches other employees, they will receive the same template. Tighten filters or add a higher-priority "exclude" rule below it.

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