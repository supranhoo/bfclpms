# 05 — Workflow Data Flows

## A. Monthly PMS review cycle

```text
1  KRA Set        admin/manager writes kpis(+weightage) for (employee, period)
2  Self Review    review_submissions.self_achieved_value / self_score / evidence
3  Manager (L1)   manager_* columns              [workflow_config decides presence]
4  Functional Mgr functional_manager_* columns   [ADR-196 column parity]
5  Skip Level     skip_level_* columns
6  HR PMS         hr_pms_* columns
7  Audit          audit_* columns (audit_kpi_assignments scopes the auditor)
8  Management     management_* columns
9  Approved       final_score frozen; final_score_revisions journals any change
```

Invariants enforced in the database, not the UI:
- `kpi_status` is never NULL (`no-null-kpi-status`).
- Stage advance requires a real score for that stage (`trg_ar_stage_score_required` analogue, ADR-172).
- Mid-flight workflow edits must not lose ratings — `workflow_change_step_back()` snapshots `prior_final_score` (ADR-193).
- Scores excluded from aggregates when `is_na` or unscored (POLICY §weighted score).

## B. Annual review cycle

```text
create_or_get_annual_review_instance
   -> seeds enabled_stages from template/archetype + org head resolution
   -> triggers normalise the chain:
        enforce_bu_head_terminal_stage()     strips dept_head for BU heads
        enforce_management_terminal_stage()  appends management for BU heads
        enforce_collapsed_dept_bu_normalise()
advance_annual_review_status  -> next enabled stage, requires stage score
send_back_annual_review_status-> clears downstream responses + total_score
annual_review_compute_final_score / _final_summary -> normalised 0..100 (ADR-187)
finalize -> status=completed, finalized_at/finalized_by
```

Reads for dashboards go through `get_my_annual_review_queue()` (auth.uid()-scoped, ADR: §AR-TEAM-QUEUE-AUTH) and `annual_review_accessible_instances()`; hierarchy visibility of completed reviews goes through `get_hierarchy_completed_reviews` (ADR-162).

## C. Safety incident flow

`reported → management_review → assigned → investigation → rca → corrective_action → safety_head_review → verification → closed`, driven exclusively by the `transition_safety_incident` RPC (RPC-only writes, idempotency key on `client_submission_id`). SLA breaches are swept every 15 minutes by cron job 21 into `safety_sla_escalations`.

## D. Scheduled automation (`pg_cron`, 14 jobs, all active)

| Job | Schedule | Target |
|---|---|---|
| weekly-database-backup | `0 17 * * *` | `create-backup` |
| auto-kra-rollover-monthly | `0 0 1 * *` | `auto-rollover-kpis` |
| monthly-review-reminder | `0 8 1,3,5,7,9 * *` | `send-monthly-review-reminder` |
| daily-query-observation-reminder | `30 3 * * *` | `send-query-observation-reminders` |
| process-scheduled-emails | `*/15 * * * *` | `send-scheduled-emails` |
| asset-calibration-sweep-daily | `30 6 * * *` | `asset-calibration-sweep` |
| bulk-review-auto-revert-daily | `15 2 * * *` | `bulk-review-auto-revert` |
| compress-evidence-daily | `30 3 * * *` | `compress-evidence` |
| check-safety-sla-every-15min | `*/15 * * * *` | `check-safety-sla` |
| safety-analytics-refresh-2h | `0 */2 * * *` | `refresh_safety_analytics()` (SQL) |
| permit-expiry-sweep-hourly | `0 * * * *` | `permit-expiry-sweep` |
| reap-stuck-backups-hourly | `0 * * * *` | `reap-stuck-backups` |
| annual-review-reminders-daily | `30 8 * * *` | `annual-review-reminders` |
| backup-retention-sweep-daily | `30 3 * * *` | `backup-retention-sweep` |

The job named "weekly" actually runs daily at 17:00 UTC — a naming/behaviour mismatch worth reconciling.
