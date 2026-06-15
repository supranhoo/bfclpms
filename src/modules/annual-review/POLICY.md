# Annual Review Module — Policy

_Business rules. Update in the same PR as any logic change._

## Eligibility
- Seeding scopes to `is_active = true AND is_dummy_employee = false`.
- Rule matching is priority-ordered (lower wins). Empty filter set matches all.
- Filter dimensions: designation, pms_grade, level, department, business unit (joined via department).
- Seeder MUST page the `profiles` read via `fetchAllPaged` (POLICY §94 / `mem://architecture/profiles-query-policy`). The active roster exceeds the 1000-row PostgREST cap; an unranged read silently drops >60% of employees.

### Single-employee template assignment
There are two ways to assign a template to one employee:

**Recommended — per-employee override (post-seed):**
1. Open **Admin → Progress**, find the employee.
2. While they are still in `not_started` or `pending_self`, click **Change template**.
3. Pick the new template, enter a reason (min 3 chars), Save.
4. The override is audit-logged. It survives re-seeds and only affects that one employee.

The override is stored on `annual_review_instances.template_override_id` and resolved via the
`resolveTemplateId(instance)` helper — UI components MUST go through that helper, never read
`template_id` directly. Once the review has progressed past `pending_self`, the override
is locked (RPC raises).

**Rule-based (pre-seed) — useful when targeting an exact filter combination:**
1. Open **Admin → Rules**, pick the active cycle.
2. Create a new rule whose filters uniquely identify that employee.
3. Set **priority = 1** so this rule wins before any broader rule.
4. Pick the desired template and save.
5. Click **Seed instances by rules**.

Caveats:
- The seeder writer (`writeSeedRowsPreservingOverrides`) updates seeded columns
  (`template_id`, reviewer chain, `assigned_rule_id`) on re-seed but **never touches
  `template_override_id`**. Any per-employee override survives re-seed.
- If your filter combo also matches other employees, they will receive the same template.
  Tighten filters or use the per-employee override instead.

**Bulk CSV/XLSX (many employees at once):**
1. Admin → Progress → **Bulk template assignment** → Download template.
2. In the workbook, fill `New Template` and `Reason` only for rows you want to change.
   Use the literal value `CLEAR` in `New Template` to remove an existing override.
3. Upload → preview classifies every row as Apply / Skip / Error → click **Apply**.
4. Each successful row hits the same `set_annual_review_template_override` RPC so
   stage gate, role gate, and audit log are identical to the single-row UI.

## Reviewer chain
- Snapshotted at seed time from `profiles.reporting_manager_id` (manager → skip → bu_head). HR is the configured HR user.
- Mid-cycle change: HR/admin inserts an `annual_review_assignment_overrides` row. Overrides take precedence over the snapshot for that instance + role.

## Per-employee workflow override
- Each instance has `enabled_stages` (subset of `self / manager / skip_manager / bu_head / hr`).
  `self` is always required; any of the other four can be disabled per employee.
- Disabled stages are **skipped entirely** — the next reviewer in the
  surviving chain becomes active immediately. If the last enabled stage is
  not `hr`, completing that stage finalizes the review (sets `completed`
  and stamps `finalized_at`).
- Mutation gate: only admin / hr_pms, only while `overall_status ∈ {not_started, pending_self}`,
  reason ≥ 3 chars. Server-side RPC `set_annual_review_enabled_stages` enforces all three and writes an
  `annual_review.enabled_stages_set` audit row.
- Two UI paths in **Admin → Progress**:
  - **Change workflow** row action (per employee, 4 checkboxes + reason).
  - **Bulk workflow assignment** XLSX dialog
    (columns: Employee Code, Full Name, Current Stages, Manager (Y/N), Skip (Y/N), BU (Y/N), HR (Y/N), Reason).
- The seeder (`writeSeedRowsPreservingOverrides`) never writes
  `enabled_stages`, so per-employee workflow overrides survive re-seed —
  identical guarantee to `template_override_id`.
- Resolver SSOT: `src/lib/annualReview/stageChain.ts` (`enabledChain`,
  `nextStatus`, `prevStatus`). UI must render the stepper through the
  resolver — never hardcode the 5-stage chain.

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
- Summary/status counts MUST use count-only queries (`head: true, count: 'exact'`) or a paged read. Unpaged `.select(column)` reads are forbidden for cycle-wide aggregates — the Data API caps payloads at 1000 rows and silently undercounts large cycles.

## Version history
- 2026-06-14 — Initial policy. Documented reopen, reassignment override precedence, and export scope.
- 2026-06-15 — Added per-employee configurable workflow (`enabled_stages` + bulk XLSX + override-safe seeder).