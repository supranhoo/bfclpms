# Annual Review Module — Technical Documentation

_Single source of technical truth for the Annual Review module. Update in
the same PR as any code or schema change._

## Routes
| Path | Page | Roles |
| --- | --- | --- |
| `/annual-review` | `EmployeeAnnualReview` | all authenticated |
| `/annual-review/team` | `TeamAnnualReview` | manager, hr_pms, skip_level, management, admin |
| `/annual-review/calibrate` | `ManagerCalibration` | manager, hr_pms, skip_level, management, admin |
| `/annual-review/admin` | `AnnualReviewAdmin` | admin, hr_pms |
| `/reports/annual-review` | `AnnualReviewReport` | manager, hr_pms, skip_level, management, admin |

## Schema
- `annual_review_cycles` — cycle metadata + stage windows + HR deadline. `status ∈ {draft, active, closed}`. Reopen columns: `reopened_at`, `reopened_by`, `reopened_reason`.
- `annual_review_templates` — versioned via `parent_template_id` + `version`.
- `annual_review_assignment_rules` — priority-ordered filter rules per cycle.
- `annual_review_instances` — one row per employee × cycle. Holds the full reviewer chain, system scores, final rating, acknowledgment. `template_override_id` (nullable FK) is the per-employee template override; resolution is `COALESCE(template_override_id, template_id)`.
- `annual_review_responses` — one row per (instance, reviewer_role).
- `annual_review_assignment_overrides` — per-instance reviewer reassignments (mid-cycle).

## RPCs
- `advance_annual_review_status`, `send_back_annual_review_status`
- `close_annual_review_cycle`, `reopen_annual_review_cycle` (HR/admin, reason mandatory)
- `bulk_finalize_annual_reviews`, `override_annual_review_rating`, `acknowledge_annual_review_instance`
- `clone_annual_review_template`, `clone_annual_review_cycle`
- `reassign_annual_review_reviewer`
- `set_annual_review_template_override(instance_id, template_id|null, reason)` — admin/hr_pms only, allowed in `not_started`/`pending_self`, reason >= 3 chars, audit-logged as `annual_review.template_override_set`.

## Template resolution SSOT
Every UI path resolves the effective template via `resolveTemplateId(instance)` in `annualReviewService.ts`:
`override > seeded`. Direct reads of `instance.template_id` are forbidden in render
code. Already updated: `HrFinalizationSheet`, `TeamAnnualReview`, `EmployeeAnnualReview`,
`ManagerCalibration`, Admin Progress tab.

## Seeder safety
`writeSeedRowsPreservingOverrides` partitions seed rows into insert (new instances) and
per-row update (existing instances, updating only seeded columns). It NEVER writes
`template_override_id`, so overrides survive re-seed. Both `seedInstancesForCycle` and
`seedInstancesByRules` go through this helper.

## Pagination contract
- `listInstancesPaginated({ cycleId, page, pageSize, search, status, sort })`. `pageSize` capped at 100.
- Search resolves via a `profiles.full_name ilike` pre-fetch (cap 500). PostgREST cannot `ilike` across an embedded resource.
- Summary cards use `getCycleStatusCounts(cycleId)` — one-column projection, ~few KB even at 5k rows.
- **Seeding (`seedInstancesByRules`, `seedInstancesForCycle`)** reads the active roster via `fetchAllPaged` (POLICY §94). Department→BU lookup chunks `.in(id, …)` at 500 ids/page.

## Hooks / services / components
UI → hooks (`useAnnualReview.ts`) → services (`annualReviewService.ts`) → Supabase. No component touches the supabase client directly.

## Feature flag
`admin_feature_flags.annual_review_enabled` (resolved via `is_feature_flag_enabled_for_me`).

## Version history
- 2026-06-14 — Initial docs. Server-side pagination, standalone report, cycle reopen, mid-cycle reassignment.
- 2026-06-15 — Seeder now pages `profiles` via `fetchAllPaged`; previously capped at 1000 rows ("Seeded 1000 instances" bug).
- 2026-06-15 — Part B: per-employee template override (`template_override_id` + `set_annual_review_template_override` RPC + `resolveTemplateId` SSOT + override-safe seeder writer + Progress "Change template" dialog).
- 2026-06-15 — Part C: bulk CSV/XLSX template assignment dialog (`BulkTemplateAssignmentDialog` + `bulkSetTemplateOverrides` service helper). Thin client-side wrapper over the Part B RPC; no new schema, no new RPC — server-side gates are unchanged.
- 2026-06-15 — `getCycleStatusCounts` switched to `head: true, count: 'exact'` per-status queries. The prior implementation read `overall_status` rows unpaged and was silently capped at 1000 by the Data API, so Progress summary cards stalled at 1000 on cycles with >1k employees.