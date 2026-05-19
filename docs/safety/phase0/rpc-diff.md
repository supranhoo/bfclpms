# RPC Diff — Safety SECURITY DEFINER Functions

## Authoritative RPCs (in `public`)

| Function | Purpose | Contract notes |
|---|---|---|
| `has_safety_role(uid, role)` | Per-role check | RLS-safe, SECURITY DEFINER |
| `has_any_safety_role(uid)` | Any-role check | Used by module gate |
| `has_safety_module_access(uid)` | Module gate | Combines role + module flag |
| `can_view_safety_incident(uid, incident)` | Row-level reader | Used in RLS |
| `transition_safety_incident(incident, to_stage, payload)` | **Only** allowed status mutator | Enforces FSM via `safety_incident_fsm_guard` |
| `assign_permit_number`, `submit_permit`, `activate_permit`, `suspend_permit`, `close_permit`, `decide_permit_level`, `is_permit_approver`, `expire_overdue_permits` | Permit lifecycle | All status writes go through these |
| `run_safety_sla_escalations` | SLA cron worker | Called by `check-safety-sla` edge fn |
| `refresh_safety_analytics` | Analytics refresh | Called by `safety-analytics` edge fn |
| `get_safety_setting`, `set_safety_setting` | Settings KV | Admin-gated via RLS |
| `enqueue_safety_notification`, `enqueue_safety_compression_on_insert` | Queues | Trigger-driven |
| `log_safety_role_change` | Audit | Trigger on `safety_user_roles` |
| Trigger guards: `safety_incident_before_insert`, `safety_incident_fsm_guard`, `guard_permit_status_write`, `safety_audit_runs_block_status_writes`, `safety_drills_block_status_writes`, `safety_training_block_status_writes` | Defensive FSM | **Must not be removed** |

## Mandatory write-path rules

- Incident status changes: **only** through `transition_safety_incident`. UI
  writes to `safety_incidents.status` directly are blocked by
  `safety_incident_fsm_guard`.
- Permit status changes: **only** through `*_permit` RPCs. Direct UPDATE is
  blocked by `guard_permit_status_write`.
- Audit-run / Drill / Training status: blocked at trigger level.

## Prototype-derived RPC requests

| RPC | Disposition |
|---|---|
| Replace `transition_safety_incident` with multiple stage RPCs | **Reject** |
| Add `safety_bulk_import(payload, dry_run boolean)` | **Accept** (Phase 6) |
| Add `safety_feature_flag_set(key, value)` | **Accept** (Phase 5) |

## Stop conditions

- Any UI/edge function that bypasses the listed write-path RPCs.
- Any removal or signature change of the trigger guards.