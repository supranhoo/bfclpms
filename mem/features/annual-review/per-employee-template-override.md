---
name: Annual Review Per-Employee Template Override
description: template_override_id column, resolveTemplateId SSOT, override-safe seeder, set_annual_review_template_override RPC
type: feature
---

`annual_review_instances.template_override_id` (nullable FK → `annual_review_templates`) is the per-employee template override. Resolution everywhere: `COALESCE(template_override_id, template_id)` via the `resolveTemplateId(instance)` helper in `src/services/annualReview/annualReviewService.ts`. UI MUST go through the helper — never read `instance.template_id` directly for rendering.

## Mutation path
RPC `set_annual_review_template_override(p_instance_id, p_template_id|null, p_reason)`:
- admin / hr_pms only (enum `app_role`)
- allowed only when `overall_status IN ('not_started', 'pending_self')`
- `p_reason` mandatory, min 3 chars
- target template (when not clearing) must be `is_active = true`
- audit-logged as `annual_review.template_override_set` with previous_override_id, new_override_id, seeded_template_id, reason

Service wrapper: `setTemplateOverride({ instanceId, templateId, reason })`.

## Seeder safety
Both `seedInstancesForCycle` and `seedInstancesByRules` write through `writeSeedRowsPreservingOverrides`, which:
1. Reads existing `(id, employee_id)` for the cycle (paged via `fetchAllPaged`).
2. INSERTs net-new rows.
3. UPDATEs existing rows ONLY on seeded columns (`template_id`, `manager_id`, `skip_id`, `bu_head_id`, `hr_id`, `assigned_rule_id`).

`template_override_id` is NEVER written by the seeder, so overrides survive every re-seed. Do not revert to plain `upsert(..., { onConflict: 'employee_id,cycle_id' })` — it silently nulls overrides via EXCLUDED.

## UI surface
Progress tab in `AnnualReviewAdmin.tsx` exposes a per-row "Change template" button (only when status ∈ not_started / pending_self) → `ChangeTemplateDialog` (current vs new template select, mandatory reason, "Clear override" option when an override is set).

## Test
`src/test/annualReview/resolveTemplateId.test.ts` — 5 cases covering null/undefined, override-wins, null override fallback, missing seed.

## Rollback
`ALTER TABLE public.annual_review_instances DROP COLUMN template_override_id;` + `DROP FUNCTION public.set_annual_review_template_override(uuid, uuid, text);` + revert service helpers + remove dialog. Resolver fallback is naturally safe (returns `template_id`).