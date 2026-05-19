# Schema Diff — Production Safety Tables

## Authoritative tables (`public.safety_*`)

```
safety_asset_calibrations         safety_incident_evidence       safety_quizzes
safety_asset_evidence             safety_incident_progress_logs  safety_quiz_questions
safety_assets                     safety_incident_timeline       safety_settings
safety_audit_log                  safety_incidents               safety_severity_sla
safety_audit_run_responses        safety_module_access           safety_sla_escalations
safety_audit_runs                 safety_notifications           safety_sops
safety_audit_template_items       safety_permit_approvals        safety_training_assignments
safety_audit_templates            safety_permit_evidence         safety_training_attempts
safety_drill_findings             safety_permit_hira             safety_user_roles
safety_drill_participants         safety_permit_loto_steps
safety_emergency_contacts         safety_permit_type_config
safety_emergency_drills           safety_permits
safety_hours_worked
```

Total: 33 tables. All carry RLS (verified in Phase 1 deliverable).

## Enums (authoritative)

- `safety_app_role` — Safety RBAC (do NOT merge with `public.app_role`).
- Incident stage constants live in code (`src/lib/safetyIncidents.ts`) and are
  consumed by `transition_safety_incident` RPC. **Stage name is `rca`, not
  `root_cause_analysis`.**

## Prototype-derived schema requests

| Object | Disposition | Phase |
|---|---|---|
| `safety_feature_flags` (additive) | **Accept** | 5 |
| `safety_import_batches` (additive) | **Accept** | 6 |
| Rename `safety_incidents.client_submission_id` → `idempotency_key` | **Reject** | — |
| Replace `safety_app_role` with prototype roles | **Reject** | — |
| Rename stage `rca` → `root_cause_analysis` | **Reject** | — |

## Stop conditions

- Any non-additive migration to existing `safety_*` tables.
- Any DROP/RENAME on enums or stage constants.
- Any change to `safety_user_roles` shape (RBAC contract).