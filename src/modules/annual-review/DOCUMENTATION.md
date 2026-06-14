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
- `annual_review_instances` — one row per employee × cycle. Holds the full reviewer chain, system scores, final rating, acknowledgment.
- `annual_review_responses` — one row per (instance, reviewer_role).
- `annual_review_assignment_overrides` — per-instance reviewer reassignments (mid-cycle).

## RPCs
- `advance_annual_review_status`, `send_back_annual_review_status`
- `close_annual_review_cycle`, `reopen_annual_review_cycle` (HR/admin, reason mandatory)
- `bulk_finalize_annual_reviews`, `override_annual_review_rating`, `acknowledge_annual_review_instance`
- `clone_annual_review_template`, `clone_annual_review_cycle`
- `reassign_annual_review_reviewer`

## Pagination contract
- `listInstancesPaginated({ cycleId, page, pageSize, search, status, sort })`. `pageSize` capped at 100.
- Search resolves via a `profiles.full_name ilike` pre-fetch (cap 500). PostgREST cannot `ilike` across an embedded resource.
- Summary cards use `getCycleStatusCounts(cycleId)` — one-column projection, ~few KB even at 5k rows.

## Hooks / services / components
UI → hooks (`useAnnualReview.ts`) → services (`annualReviewService.ts`) → Supabase. No component touches the supabase client directly.

## Feature flag
`admin_feature_flags.annual_review_enabled` (resolved via `is_feature_flag_enabled_for_me`).

## Version history
- 2026-06-14 — Initial docs. Server-side pagination, standalone report, cycle reopen, mid-cycle reassignment.