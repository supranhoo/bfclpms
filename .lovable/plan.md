## Phase 3A.5 — Retention Policy registry (config only, no enforcement)

### Assumptions
- Platform-owner writes; authenticated reads.
- One row per **data domain** (logical dataset, not one per table). Captures *how long records must be kept, when to archive, and when to purge*. No job consults it yet.
- Lives under **Data Governance** as the fifth sub-tab.
- Complements 3A.4: audit policies cover *event logs*, retention policies cover *business data*.

### Risk & Impact
- **Data**: 1 new table `public.retention_policies`. No FK to existing data tables.
- **Workflow / reports / backup**: zero impact — no current job reads this. Backup engine (`get_backup_table_order`) continues to back up everything; this registry only documents intent.
- **Regression**: negligible (additive table + isolated sub-tab).
- **Scalability**: ~20-30 domains total. Small.
- **Rollback**: drop table, remove sub-tab.

### Schema — `public.retention_policies`
- `id uuid pk`
- `module_key text not null` (`pms`, `hrms`, `lms`, `safety`, `incentive`, `platform`)
- `domain_key text not null` — short slug, e.g. `pms.review_submissions`, `hrms.employee_master`, `safety.incidents`, `platform.notifications`
- `domain_label text not null` — human label
- `retention_days integer` (null = keep forever)
- `archive_after_days integer` (null = no archive stage)
- `purge_strategy text not null default 'soft_delete'` — `soft_delete` | `hard_delete` | `anonymize` | `archive_only`
- `legal_hold boolean not null default false` (overrides purge intent)
- `regulatory_basis text` (free text, e.g. "IT Act 2000, 7y")
- `owner_role text` (e.g. `hr_pms`, `platform_owner`)
- `notes text`
- `is_active boolean not null default true`
- standard audit cols
- UNIQUE `(domain_key)`
- CHECK `retention_days IS NULL OR retention_days >= 0`
- CHECK `archive_after_days IS NULL OR archive_after_days >= 0`
- CHECK `archive_after_days IS NULL OR retention_days IS NULL OR archive_after_days <= retention_days`
- CHECK `purge_strategy IN ('soft_delete','hard_delete','anonymize','archive_only')`

GRANTs: `SELECT` to `authenticated`, `ALL` to `service_role`.
RLS: read = authenticated; write = `platform_owner`.
Trigger: standard `updated_at`.
Index: `(module_key)`.

### Seed (idempotent, `ON CONFLICT (domain_key) DO NOTHING`)
| domain_key                       | module    | retention | archive | strategy      | legal hold | regulatory |
|----------------------------------|-----------|-----------|---------|---------------|------------|------------|
| pms.review_submissions           | pms       | 2555 (7y) | 730     | archive_only  | true       | IT/CompanyAct 7y |
| pms.kpi_observations             | pms       | 1825      | 365     | soft_delete   | false      |  |
| pms.kpi_queries                  | pms       | 1825      | 365     | soft_delete   | false      |  |
| pms.audit_logs                   | pms       | 2555      | 1095    | archive_only  | true       | 7y |
| hrms.employee_master             | hrms      | null      | null    | archive_only  | true       | Active employment |
| hrms.employment_history          | hrms      | 2555      | null    | archive_only  | true       | 7y post-exit |
| hrms.email_change_audit          | hrms      | 1825      | null    | soft_delete   | false      |  |
| safety.incidents                 | safety    | 3650 (10y)| 1825    | archive_only  | true       | OSHA-equiv 10y |
| safety.audit_runs                | safety    | 1825      | 730     | archive_only  | false      |  |
| safety.permits                   | safety    | 1095      | 365     | soft_delete   | false      |  |
| incentive.records                | incentive | 2555      | 730     | archive_only  | true       | Payroll 7y |
| incentive.eligibility            | incentive | 1825      | 730     | soft_delete   | false      |  |
| platform.notifications           | platform  | 180       | 90      | hard_delete   | false      |  |
| platform.email_logs              | platform  | 365       | 180     | hard_delete   | false      |  |
| platform.entitlement_audit       | platform  | 2555      | 1095    | archive_only  | true       | 7y |
| platform.backup_logs             | platform  | 730       | 365     | soft_delete   | false      |  |
| lms.training_attempts            | lms       | 1825      | 730     | soft_delete   | false      |  |

(17 seed rows. Policy *intent* only; no system reads them yet.)

### UI — `DataGovernanceTab.tsx`
Add fifth sub-tab **Retention Policy**:
- Filter bar: module + show-inactive.
- Table: Module · Domain · Retention · Archive After · Strategy · Legal Hold · Owner · Active · Edit.
- Add and Edit dialogs (no Delete — toggle `is_active`).
- `domain_key` immutable after creation (server-enforced unique).
- Reuse "Config only — not enforced yet" banner.
- Display "Forever" when `retention_days IS NULL`.

### Audit
`entitlement_audit` per create/update:
- `event_type`: `create` | `update`
- `entity_type`: `retention_policy`
- `entity_key`: `domain_key`
- `before` / `after` JSON snapshots
- `reason`: `platform_settings_retention_policy_(create|update)`

### Out of scope
- No archival job, no purge job, no anonymizer.
- No backup integration (backup_denylist remains the only mechanism that affects backup coverage).
- No legal-hold enforcement on delete operations. All deferred to enforcement phase.

### Files
- New migration `<ts>_create_retention_policies.sql` — table + RLS + grants + seed.
- `src/components/platform/DataGovernanceTab.tsx` — add `RetentionPolicySubTab` + tab trigger.
- `CHANGELOG_2026.md` — 3A.5 entry.

### Verification
- `platformFoundation` smoke 12/12 still pass.
- Manual: platform_owner can add + edit; non-platform_owner read-only.
- One `entitlement_audit` row per save.
- No change in any PMS / audit / reports / export / backup surface.

Ready to implement on approval.
