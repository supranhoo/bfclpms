## Assumptions
- Employee: Atul Singh (200414), profile `34dd3f55-b364-4ddd-98ae-201f275df95b`.
- Instance `662da035-ae3f-4d0c-8b5c-14a2d06a0fee`, cycle `b82a935f…`.
- Current state: `overall_status = pending_self`, `template_id = fcf38994 (FAD- M - Mech)`, `template_override_id = fcf38994 (same)`, `enabled_stages = [self, dept_head, bu_head]`, `annual_review_responses` for this instance = 0 rows.
- Target: keep him on `FAD- M - Mech` but force the form to re-hydrate against the current template definition (Option 1 chosen).

## RCA (why he is stuck on the "old" version)
1. On 2026-07-13 a Form Mapping rule wrote `template_override_id = fcf38994` (FAD- M - Mech), replacing the seeder's `af2a2c7c`.
2. Since then, the template `fcf38994` has been edited (criteria added/renamed). The `is_active` template row was updated 2026-07-16.
3. Trigger `trg_guard_ar_template_id_stability` (ADR-117) correctly prevents the seeder from touching `template_id` while an override exists, so any re-mapping to the same override is a no-op.
4. His draft rendering is anchored to a stale in-memory snapshot of criteria (the pre-edit set). With no `annual_review_responses` row he still sees the "old" form and cannot save because the client-side score keys don't match the current template criteria set that the submit-guard validates against (ADR-115 / ADR-122 remap only fires when responses exist).
5. Net effect: read-only-feeling form with validation failing on submit — matches the reported symptom.

## Risk & Impact Report
- Data impact: none destructive. 0 response rows exist for this instance — nothing to archive or wipe.
- Workflow impact: instance stays in `pending_self`; reviewer chain (`enabled_stages`) unchanged.
- UI/UX: employee's self-review page re-fetches the template, criteria list matches the current definition, submit guard passes.
- Regression risk: low — using the existing, audited RPC `set_annual_review_template_override` twice (clear, then re-apply) is the sanctioned non-destructive path.
- Mitigation: verify post-state and criteria count; keep audit trail via mandatory reasons on both RPC calls.

## Fix (single instance, no code change)
Two audited RPC calls on the same instance:

1. `set_annual_review_template_override(p_instance_id := '662da035-ae3f-4d0c-8b5c-14a2d06a0fee', p_template_id := NULL, p_reason := 'RCA-Atul-200414 step 1: clear stale override so template snapshot re-hydrates.')`
2. `set_annual_review_template_override(p_instance_id := '662da035-ae3f-4d0c-8b5c-14a2d06a0fee', p_template_id := 'fcf38994-e641-44c8-8b73-a396886562a2', p_reason := 'RCA-Atul-200414 step 2: re-apply FAD- M - Mech so the self-review form loads the current criteria set.')`

Both are allowed by the RPC because `overall_status = pending_self`.

## Verification
- Re-read `annual_review_instances` row: `template_override_id = fcf38994`, `overall_status = pending_self`, response count still 0.
- Read `annual_review_templates` → `sections->'criteria'` count matches what Atul will see.
- Confirm two `annual_review.template_override_set` rows in `system_audit_logs` with the reasons above.
- Ask HR/PMS to have Atul reopen his self-review page; expected: fresh criteria list, radio options selectable, submit succeeds.

## What is NOT changed
- No code, migration, RLS, or trigger change.
- No other employees are touched.
- No responses, evidence, or system scores modified.
- ADR-117 trigger stays in place.

## Rollback
If Atul's page still shows the old form after refresh: repeat the clear step (step 1 only) and ask him to hard-reload. If a genuinely different template is intended, re-run `set_annual_review_template_override` with the new template id — same non-destructive path.

## Documentation
- Append a one-line entry to `DOCUMENTATION.md` Version History: "v2.66.117-hotfix — Atul Singh (200414) template snapshot refresh via clear-then-reapply override (RCA-Atul-200414)."
- No POLICY.md change needed: policy `§AR-TEMPLATE-OVERRIDE` already sanctions this path.
