## Phase 3A.4 — Audit Policy registry (config only, no enforcement)

### Assumptions
- Platform-owner only writes; authenticated reads.
- One row per **module × event category**. Captures *what should be audited and how long it should be kept*. No existing audit writer reads this yet.
- Lives under **Data Governance** as a fourth sub-tab.

### Risk & Impact
- **Data**: 1 new table `public.audit_policies`. No FK to existing audit tables.
- **Workflow / audit / reports**: zero impact — no current audit code path is touched.
- **Regression**: negligible (additive table + isolated sub-tab).
- **Scalability**: ~6 modules × ~8 categories ≈ small. Pre-seed only common pairs.
- **Rollback**: drop table, remove sub-tab.

### Schema — `public.audit_policies`
- `id uuid pk`
- `module_key text not null` (`pms`, `hrms`, `lms`, `safety`, `incentive`, `platform`)
- `event_category text not null` (`auth`, `data_read`, `data_write`, `export`, `permission_change`, `score_change`, `workflow_change`, `config_change`, `admin_action`, `notification`)
- `enabled boolean not null default true`
- `retention_days integer` (null = forever)
- `min_severity text not null default 'info'` — `info` | `notice` | `warn` | `critical`
- `include_payload boolean not null default true` (intent flag — do we keep before/after JSON)
- `pii_redaction boolean not null default false` (intent flag — strip PII fields before persisting)
- `alert_on_failure boolean not null default false` (intent flag — page someone when audit insert fails)
- `notes text`
- `is_active boolean not null default true`
- audit cols `created_at`/`updated_at`/`created_by`/`updated_by`
- UNIQUE `(module_key, event_category)`
- CHECK `retention_days IS NULL OR retention_days >= 0`
- CHECK `min_severity IN ('info','notice','warn','critical')`

GRANTs: `SELECT` to `authenticated`, `ALL` to `service_role`.
RLS: read = authenticated; write = `platform_owner`.
Trigger: standard `updated_at`.
Indexes: `(module_key)`, `(event_category)`.

### Seed
Seed a sensible default matrix so the table is usable on day one. Inserted with `ON CONFLICT (module_key, event_category) DO NOTHING` so it's idempotent and never overwrites user changes on re-apply.

| module     | category           | retention | severity  | payload | redact PII | alert |
|------------|--------------------|-----------|-----------|---------|------------|-------|
| platform   | auth               | 365       | notice    | false   | true       | true  |
| platform   | permission_change  | 730       | warn      | true    | false      | true  |
| platform   | config_change      | 730       | notice    | true    | false      | false |
| platform   | admin_action       | 730       | warn      | true    | false      | true  |
| pms        | score_change       | 1825      | notice    | true    | false      | false |
| pms        | workflow_change    | 1825      | notice    | true    | false      | false |
| pms        | data_write         | 365       | info      | true    | true       | false |
| pms        | export             | 365       | warn      | true    | true       | true  |
| hrms       | data_write         | 730       | info      | true    | true       | false |
| hrms       | export             | 730       | warn      | true    | true       | true  |
| safety     | data_write         | 1825      | notice    | true    | false      | false |
| safety     | export             | 1825      | warn      | true    | false      | true  |
| incentive  | score_change       | 1825      | notice    | true    | false      | false |
| incentive  | data_write         | 1825      | info      | true    | true       | false |
| lms        | data_write         | 365       | info      | true    | true       | false |

(15 seed rows. Numbers are policy *intent*; no system reads them yet.)

### UI — `DataGovernanceTab.tsx`
Add fourth sub-tab **Audit Policy**:
- Filter bar: module + category + show-inactive.
- Table: Module · Category · Enabled · Retention · Severity · Payload · PII Redact · Alert · Active · Edit.
- Add and Edit dialogs (no Delete — toggle `is_active`).
- `(module_key, event_category)` immutable after creation (server enforces unique).
- "Config only — not enforced yet" banner reused.

### Audit
`entitlement_audit` write per create/update:
- `event_type`: `create` | `update`
- `entity_type`: `audit_policy`
- `entity_key`: `${module_key}.${event_category}`
- `before` / `after` JSON (null on create)
- `reason`: `platform_settings_audit_policy_(create|update)`

### Out of scope
- No audit writer (e.g. `entitlement_audit`, `iac_audit_log`, `kpi_audit_logs`, `safety_audit_log`) is rewired to consult this table.
- No retention purge job.
- No PII redactor.
- No alerting pipeline. All four are deferred to the enforcement phase.

### Files
- New migration `<ts>_create_audit_policies.sql` — table + RLS + grants + seed.
- `src/components/platform/DataGovernanceTab.tsx` — add `AuditPolicySubTab` + tab trigger.
- `CHANGELOG_2026.md` — 3A.4 entry.

### Verification
- `platformFoundation` smoke 12/12 still pass.
- Manual: platform_owner can add + edit a row; non-platform_owner gets read-only.
- One `entitlement_audit` row per save.
- No change in any PMS / audit / reports / export surface.

Ready to implement on approval.