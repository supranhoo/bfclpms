# 04 — Annual Review & Safety ERDs

## Annual Review

```text
annual_review_cycles (23 cols)
        |
        v
annual_review_instances (38 cols)  <-- the state machine
   employee_id, cycle_id, template_id, template_override,
   status (annual_review_status), enabled_stages[],
   self/manager/skip/dept/bu/hr/management reviewer ids,
   criteria_scores jsonb, weighted_score, total_score, final_score
        |
        +--> annual_review_responses  (one row per reviewer_role)
        |        reviewer_id, reviewer_role (annual_reviewer_role),
        |        criteria_scores jsonb, recommendation, locked
        |
        +--> annual_review_proxy_submissions   (assisted submission trail)
        +--> annual_review_directory_overrides (assisted-search scope)
        +--> annual_review_assignment_rules / _overrides
        |
templates:  annual_review_templates -> annual_review_template_archetypes
            annual_review_criteria_library -> _criteria_assignments
            annual_review_system_kpis -> _system_kpi_weights
```

Stage order (canonical, ADR-138): `self → manager → skip_manager → dept_head → bu_head → hr → management`.
Status semantics: `status` records the stage **currently pending**, `pending_*`; the terminal role is whichever enabled stage is highest, and BU-Head-terminal / Management-terminal collapses are enforced by triggers (ADR-109, ADR-138, ADR-155).

## Safety

```text
safety_user_roles (safety_app_role)  -- isolated from public.app_role
        |
        v
safety_incidents --+-- safety_incident_evidence
     |             +-- safety_incident_timeline
     |             +-- safety_incident_progress_logs
     |             +-- safety_sla_escalations  <- safety_severity_sla
     +-> view safety_incidents_with_sla

safety_permits --+-- safety_permit_approvals
                 +-- safety_permit_hira
                 +-- safety_permit_loto_steps
                 +-- safety_permit_evidence
                 +-- safety_permit_type_config

safety_assets --+-- safety_asset_calibrations
                +-- safety_asset_evidence

safety_audit_templates -> _template_items -> safety_audit_runs -> _run_responses
safety_emergency_drills -> _participants, _findings ; safety_emergency_contacts

analytics: 8 mv_safety_* materialized views, refreshed 2-hourly
```

Incident stage constants live in `src/lib/safetyIncidents.ts` and are consumed by the `transition_safety_incident` RPC. The stage name is `rca` — never `root_cause_analysis`.
