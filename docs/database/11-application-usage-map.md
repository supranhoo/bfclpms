# 11 — Application Usage Map

Method: static scan of 1,607 `.ts`/`.tsx` files under `src/` and `supabase/functions/` for `.from('x')`, `.rpc('f')`, `storage.from()`, `functions.invoke()` and `.channel()`, cross-referenced against 919 KB of live `pg_proc.prosrc` bodies and 202 trigger definitions. Per-object results in `data/table_usage.csv` and `data/function_usage.csv`.

## Tables (248)

| Classification | Count |
|---|---:|
| Actively used from the frontend | 194 |
| Historical repair/audit ledger (`*_2026_*`, `*_repair_*`, `*_archive_seed`) | 19 |
| Referenced only by database functions/triggers | 14 |
| Edge-function only | 5 |
| Audit/compliance write-only | 3 |
| No reference found anywhere | 13 |

**No reference found (13)** — confirm before retiring; several look like forward-declared registries: `ai_feature_registry`, `capability_registry`, `dashboard_registry`, `integration_connector_registry`, `notification_event_registry`, `report_registry_v2`, `employee_master_custom_fields`, `employee_master_custom_field_values`, `import_field_settings`, `annual_review_self_review_bundle_items`, `org_kpi_owner_key_backup`, `review_action_notes`, `safety_permit_evidence`.

`review_action_notes` and `safety_permit_evidence` are the two that warrant a closer look — both have documented features behind them (`mem/features/hr/review-action-notes.md`, the permit evidence flow), so a zero-reference result suggests either a dead feature or an access path that bypasses the scanner.

**DB-internal only (14):** `annual_review_assignment_overrides`, `annual_review_role_capabilities`, `annual_review_self_review_library`, `auth_lookup_attempts`, `backup_denylist`, `bulk_review_batches`, `kpi_registry_audit_log`, `okv_migration_history`, `registry_suggestion_dismissals`, `safety_severity_sla`, `safety_sla_escalations`, `workflow_config_migration_log`, `workflow_final_score_rules`, `annual_review_reviewer_resync_audit`. All are legitimately reached through RPCs rather than direct table reads — this is the desired shape.

## Functions (457 distinct names)

| Classification | Count |
|---|---:|
| Called as RPC from the frontend | 174 |
| Bound to a trigger | 120 |
| No determinable caller | 100 |
| Internal helper (called by other functions) | 47 |
| Called as RPC from an edge function | 16 |

The 100 undetermined functions are the largest single cleanup opportunity in the schema. They are predominantly one-shot repair routines from the ADR-155 → ADR-196 remediation wave (`admin_rescale_*`, `repair_*`, `backfill_*`, `*_diagnostic`). Each is a SECURITY DEFINER surface that remains callable; they should be inventoried, and any that mutate data should have EXECUTE revoked or be dropped once their audit ledger is archived.

## Storage buckets

`avatars`, `branding-assets`, `database-backups`, `review-evidence`, `safety-media` — all five are referenced from code and all five appear in the `create-backup` bucket list.

## Realtime and edge invocation

Channel subscriptions and `functions.invoke()` targets are enumerated in `data/app_usage_misc.json`.
