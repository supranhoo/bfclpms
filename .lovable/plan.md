Hybrid plan: single-employee template assignment (doc-only fix today) + per-employee template override feature (scoped for later).

Summary
-------
You asked how to assign an Annual Review template to a single employee. The system today only supports rule-based assignment (filter matching). This plan delivers (A) an immediate documentation + UI help-text fix that shows HR how to target one employee via a narrow filter rule, and (B) a full Risk & Impact plan for a future per-employee template override feature so you can decide whether to build it.

Part A — Immediate Fix (No Code Change)
---------------------------------------
Goal: Make it obvious to HR/Admin users how to assign a template to exactly one employee using the existing rule engine.

What to change:
1. POLICY.md — Add a "Single-employee template assignment" subsection under Eligibility:
   - Explain that rules support empty filters (matches all) OR fully-qualified filters.
   - To target one employee, create a rule with filters that uniquely identify them (e.g. designation + department + employee_code, or just employee_code if added as a filter dimension).
   - Set priority = 1 so it wins before broader rules.
   - Seed instances; the employee will match this rule first.
   - Note: If the employee already has an instance, the upsert is idempotent — but the template will NOT change on an already-seeded instance. To change a template post-seed, delete the instance and re-seed, or wait for Part B.

2. Rules tab help text (AnnualReviewAdmin.tsx, RulesTab) — Expand the existing one-line help into a collapsible info block:
   - "Rules are evaluated in priority order (lower number first)."
   - "The first matching rule assigns the template."
   - "Leave all filters empty to match every employee."
   - NEW: "To assign a template to a single employee, set filters that uniquely match them (e.g. their designation + department) and give that rule the lowest priority number."

Risk for Part A: None. Text-only changes.

Part B — Per-Employee Template Override Feature (Future)
----------------------------------------------------------
Goal: Allow HR/Admin to directly change the template on an already-seeded instance without deleting/re-seeding the entire cycle.

1. SCHEMA CHANGE (Migration)
   - Add `template_override_id uuid REFERENCES annual_review_templates(id) ON DELETE SET NULL` to `annual_review_instances`.
   - Rationale: Column is simpler than a new table; keeps the override co-located with the instance it affects.
   - Default NULL → no override, normal rule-matching template stays.
   - Existing `template_id` remains the "seeded" template (audit trail).

2. SCORING / TEMPLATE RESOLUTION LOGIC
   - Resolution order: `template_override_id` (if not null) → `template_id` (seeded value).
   - All UI that reads criteria, system scores, eligibility fields must call a shared `resolveTemplate(instance)` helper.
   - The `HrFinalizationSheet`, `TeamAnnualReview` review form, and any report exports must use this helper.

3. SEEDING LOGIC UPDATE
   - `seedInstancesByRules` and `seedInstancesForCycle` must NOT overwrite `template_override_id` on upsert.
   - The current upsert uses `onConflict: 'employee_id,cycle_id'` with all columns. We need to ensure upsert does not touch `template_override_id` (either split into insert-only + update-excluding-override, or use Postgres `COALESCE`).
   - POLICY implication: Document that re-seeding respects overrides and does not revert them.

4. ADMIN UI — "Change Template" Action
   - Location: Progress tab table row (gear/menu or inline button next to "Finalize").
   - Dialog: Employee name (read-only), current template, new template dropdown (active templates only).
   - Action: `updateInstanceTemplateOverride(instanceId, newTemplateId)` → sets `template_override_id`.
   - Validation: Only HR/Admin can invoke. Instance status must be `not_started` or `pending_self` (before any reviewer has submitted). If status > pending_self, block with clear message: "Cannot change template after reviews have begun."
   - Audit: Log to `system_audit_logs` with action `annual_review.template_override`.

5. BACKEND SERVICE / RPC
   - Option 1 (preferred): Direct update via service layer (`updateInstance`) with RLS check.
   - Option 2: New RPC `set_annual_review_template_override` (SECURITY DEFINER, admin/hr_pms only).
   - Either way, RLS UPDATE policy must allow admin/hr_pms to update `template_override_id` on any instance.

6. RLS POLICY UPDATE
   - Existing `instances_stage_update` allows updates by employee/manager/etc based on stage.
   - Admin/HR already have broad UPDATE via `instances_stage_update` because it includes `has_role(..., 'admin') OR has_role(..., 'hr_pms')`.
   - Verify this covers `template_override_id` — it should, since the policy is not column-restricted.

Risk & Impact Report for Part B
--------------------------------
Data Impact:
- Schema: additive column (NULL default) — safe, no data migration needed.
- Backward compatibility: Existing instances work unchanged (override NULL → uses seeded template_id).
- Historical integrity: `template_id` preserved as "originally assigned" value. `template_override_id` is the effective value.

Workflow Impact:
- Seeder behavior changes: must not clobber overrides on re-seed. This is the highest-risk area — if we get it wrong, HR re-seeds and loses manual template assignments.
- UI resolution order: every template-consuming component must use the override-aware helper. Missing one component means the user sees the old template's criteria while the DB stores a new override.

UI/UX Impact:
- Progress tab gains one more action per row → consider a row-action dropdown (⋯) to avoid clutter.
- Template change validation (only before review starts) prevents accidental mid-cycle swaps.

Regression Risk: Medium.
- Any component that reads `template_id` directly instead of `resolveTemplate()` will show stale criteria/scores.
- Seeder regression: if upsert logic touches override column, manual assignments get wiped.

Mitigation Plan:
1. Introduce `resolveTemplate(instance)` in ONE place (`annualReviewService.ts`) and enforce via code review that all consumers use it.
2. Seeder: change upsert to explicitly exclude `template_override_id` from the insert row, or use `ON CONFLICT DO UPDATE SET … EXCLUDE template_override_id`.
3. Add regression test: seed instances → set override → re-seed → assert override survives.
4. Feature-flag gate the UI action behind `admin_feature_flags.annual_review_template_override` (default false), so it can be enabled per-client after QA.

Scalability Impact:
- Single-column addition, no index needed (FK already indexed by Postgres).
- `resolveTemplate` is a client-side null-coalesce (`override_id ?? template_id`), zero DB overhead.

Rollback Strategy:
- Drop column `template_override_id`. All instances revert to `template_id`. No data loss because `template_id` was never modified.
- Remove the UI action button. Revert seeder to previous upsert logic.

Part C — Alternative: Bulk CSV-Driven Assignment
-------------------------------------------------
If the real need is "assign templates to 500 employees based on a spreadsheet from HR", a CSV upload on the Rules tab is more efficient than per-employee UI clicks.

Scenario: HR exports a list of employees + desired template names, you add a "Bulk template assignment" CSV upload.

How it would work:
1. CSV with columns: employee_code (or employee_id), template_name.
2. Upload → validation step: show matched/unmatched rows, template existence check.
3. Apply → sets `template_override_id` on each matched instance (same Part B mechanics).
4. Requires Part B schema (template_override_id) as prerequisite.

Verdict: Implement Part B first. Once Part B exists, a bulk CSV upload is a thin UI wrapper (validation grid + batch update) that reuses the same backend.

Deliverables
------------
- Part A: Updated POLICY.md + Rules tab help text (this PR).
- Part B: Full Risk & Impact report (this PR, for approval before coding).
- Part B implementation: Deferred to a follow-up PR after your approval.

No tests needed for Part A (documentation only). Part B will include: unit test for `resolveTemplate`, seeder regression test, and RLS policy validation test.