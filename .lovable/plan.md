## Phase 3A.3 — Export Policies registry (config only, no enforcement)

### Assumptions
- Platform-owner only writes; authenticated reads.
- Registry expresses **policy intent** by classification — what *should* happen on export. No exporter reads it yet.
- Lives under the existing **Data Governance** section as a third sub-tab.

### Risk & Impact
- **Data**: 1 new table `public.export_policies`. No FK back-pressure on existing tables.
- **Workflow / UI / Reports**: zero impact. No existing export path is touched.
- **Regression**: negligible (additive table + isolated sub-tab).
- **Scalability**: one row per classification — trivial.
- **Rollback**: drop table, remove sub-tab.

### Schema — `public.export_policies`
- `id uuid pk`
- `classification_key text not null UNIQUE references data_classifications(classification_key)` (one policy per classification — keeps the model simple and matches "policy per sensitivity tier")
- `export_allowed boolean not null default true`
- `allowed_formats text[] not null default '{csv,xlsx,pdf}'` (registry list; no enforcement)
- `max_rows_per_export integer` (null = unlimited)
- `watermark_required boolean not null default false`
- `download_reason_required boolean not null default false`
- `approval_required boolean not null default false`
- `approver_role text` (free text, e.g. `manager`, `hr_pms`, `platform_owner` — not validated against `app_role` to keep loose coupling)
- `retain_export_log_days integer` (null = forever)
- `notes text`
- `is_active boolean not null default true`
- `created_at`, `updated_at`, `created_by`, `updated_by`

GRANTs: `SELECT` to `authenticated`, `ALL` to `service_role`.
RLS: read = authenticated; write = `platform_owner`.
Trigger: standard `updated_at`.

### Seed
Seed one row per existing classification with **defaults derived from `data_classifications`** flags so the registry starts coherent:
- `export_allowed`, `watermark_required`, `download_reason_required`, `approval_required`, `max_rows_per_export` ← copied from the matching `data_classifications` row at seed time.
- `allowed_formats` defaults to `{csv,xlsx,pdf}` for `export_allowed=true`, else `{}`.
- `approver_role` defaults to `platform_owner` when `approval_required=true`, else `null`.
- `retain_export_log_days` defaults to `null`.
- `is_active=true`.

Seed runs once in the migration via `INSERT ... ON CONFLICT (classification_key) DO NOTHING`.

### UI — `DataGovernanceTab.tsx`
Add third sub-tab **Export Policies**:
- Table: Classification · Export · Formats · Max rows · Watermark · Reason · Approval · Approver · Retain log · Active · Edit
- Edit dialog only (no Add / no Delete — registry mirrors classifications, so rows are created automatically when a new classification is added; absence of a row falls back to the classification's own flags conceptually but enforcement comes later).
- `classification_key` read-only in dialog.
- All other fields editable.
- "Config only — not enforced yet" banner reused.

### Audit
`entitlement_audit` on every update:
- `event_type='update'`
- `entity_type='export_policy'`
- `entity_key=classification_key`
- `before` / `after` JSON snapshot
- `reason='platform_settings_export_policy_update'`

### Out of scope
- No changes to any existing exporter, report, CSV/XLSX/PDF code path.
- No enforcement of `max_rows_per_export`, `watermark_required`, `approval_required`.
- No approval workflow UI.
- No export log table (retention setting is captured as intent only).
- No automatic row-creation trigger when a new classification is added — handled in a later phase when enforcement lands.

### Files
- New migration: `<ts>_create_export_policies.sql` (table + RLS + grants + seed).
- `src/components/platform/DataGovernanceTab.tsx` — add `ExportPoliciesSubTab` + tab trigger.
- `CHANGELOG_2026.md` — 3A.3 entry.

### Verification
- `platformFoundation` smoke 12/12 still pass.
- Manually: platform_owner can edit each policy; non-platform_owner gets read-only.
- One `entitlement_audit` row per save.
- No PMS surface changes anywhere.

Ready to implement on approval.