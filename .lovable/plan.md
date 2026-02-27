

# Update Backup System: Add 10 Missing Tables

## Summary

The scheduled backup edge function (`create-backup`) is missing 10 tables that were added to the database after the backup system was originally built. This plan adds them to the `TABLES_TO_BACKUP` list.

## Missing Tables

| Table | Category | Why It Matters |
|---|---|---|
| `levels` | Organization Structure | Org hierarchy levels |
| `email_logs` | Communications | Email delivery audit trail |
| `audit_kpi_assignments` | Review Workflow | Auditor-to-employee assignments |
| `audit_kpi_level_assignments` | Review Workflow | Auditor level-based assignments |
| `kpi_observation_replies` | Review Data | Threaded replies on observations |
| `kpi_rollback_requests` | Review Data | Rollback request history |
| `org_kpi_data_entry_logs` | Org KPI | Data entry audit trail |
| `org_kpi_value_history` | Org KPI | Value change history |
| `report_access_config` | Admin Config | Report visibility rules |
| `report_access_user_overrides` | Admin Config | Per-user report access overrides |

## Change

**File: `supabase/functions/create-backup/index.ts`**

Add the 10 missing tables to the `TABLES_TO_BACKUP` array in the correct dependency order:

- `levels` -- after parent org tables (no FK dependencies)
- `email_logs` -- after notifications
- `audit_kpi_assignments` -- after profiles
- `audit_kpi_level_assignments` -- after audit_kpi_assignments
- `kpi_observation_replies` -- after kpi_observations
- `kpi_rollback_requests` -- after kpis
- `org_kpi_data_entry_logs` -- after org_kpi_values
- `org_kpi_value_history` -- after org_kpi_values
- `report_access_config` -- standalone config
- `report_access_user_overrides` -- after report_access_config

## Risk Assessment

| Aspect | Risk | Notes |
|---|---|---|
| Data | None | Read-only backup; no schema or data modifications |
| Regression | None | Existing tables unaffected; only adds new entries to the array |
| Performance | Minimal | 10 additional table reads during backup; negligible impact |
| Restore | Compatible | The restore function already handles arbitrary table keys from the JSON file |

## Technical Details

### File Changed

| File | Change |
|---|---|
| `supabase/functions/create-backup/index.ts` | Add 10 missing tables to `TABLES_TO_BACKUP` array |

### Documentation Updates

| File | Change |
|---|---|
| `DOCUMENTATION.md` | Update backup section to reflect 10 new tables (total ~50 tables) |

