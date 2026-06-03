## Phase 3A.2 — Sensitive Field Registry (config only, no enforcement)

### Assumptions
- Platform-owner only writes; authenticated reads.
- Registry is descriptive metadata. No masking, no RLS change, no UI field hiding anywhere in PMS.
- New tab lives under the existing **Data Governance** section in `PlatformSettings.tsx`, next to **Classifications** (added in 3A.1).
- Audit goes to existing `entitlement_audit` table, matching 3A.1 conventions.

### Risk & Impact Report
- **Data**: 1 new table `public.sensitive_fields`. No changes to existing tables.
- **Workflow**: None. Registry is not read by any runtime path.
- **UI**: 1 new sub-tab inside Data Governance. No other surface changes.
- **Regression**: Negligible — additive table + isolated UI component.
- **Mitigation**: Reversible by dropping the table + removing the sub-tab. Smoke tests rerun.
- **Scalability**: Tiny dataset (tens to low hundreds of rows). Client-side paginate if > 50.

### Scope (exactly what ships)

**1. Schema — new table `public.sensitive_fields`**
Columns:
- `id uuid pk`
- `module_key text not null` (e.g. `pms`, `hrms`, `lms`, `safety`)
- `table_name text not null` (descriptive, free text — no FK to information_schema)
- `column_name text not null`
- `field_label text` (human label)
- `classification_key text not null` references `data_classifications(classification_key)`
- `pii boolean not null default false`
- `phi boolean not null default false`
- `financial boolean not null default false`
- `notes text`
- `is_active boolean not null default true`
- `created_at`, `updated_at`, `created_by`, `updated_by`
- Unique: `(module_key, table_name, column_name)`

GRANTs: `SELECT` to `authenticated`; `ALL` to `service_role`.
RLS: read = authenticated; write = `platform_owner` only (mirrors 3A.1 policy shape).
Trigger: standard `updated_at`.

**2. Seed** — empty. No fields seeded. Platform owner adds entries manually. (Avoids accidentally implying enforcement.)

**3. UI — `src/components/platform/DataGovernanceTab.tsx`**
Add a second sub-tab **Sensitive Fields**:
- Table columns: Module · Table · Column · Label · Classification · PII/PHI/Financial badges · Active · Edit
- "Add Field" button (platform_owner only) → dialog with all editable fields
- Edit dialog reuses same form; `module_key`/`table_name`/`column_name` editable until first save then read-only (server enforces unique key)
- "Config only — not enforced yet" alert reused at top of section
- Client-side filter by module + classification + active

**4. Audit**
Every create/update writes to `entitlement_audit`:
- `event_type`: `create` | `update`
- `entity_type`: `sensitive_field`
- `entity_key`: `${module_key}.${table_name}.${column_name}`
- `before` / `after`: JSON snapshot (null for create)
- `reason`: `platform_settings_sensitive_field_create` | `..._update`

**5. No deletes.** Toggle `is_active` instead.

### Out of scope (explicit)
- No masking
- No RLS changes on existing tables
- No PMS UI changes
- No export/report changes
- No introspection of `information_schema` (free-text table/column avoids tight coupling)
- No bulk import (manual entry only for this micro-phase)

### Files to touch
- New migration: `supabase/migrations/<ts>_create_sensitive_fields.sql`
- `src/components/platform/DataGovernanceTab.tsx` — add sub-tab + table + dialog
- `DOCUMENTATION.md` — bump to v2.66.18.5, document table + UI
- `CHANGELOG_2026.md` — 3A.2 entry

### Verification
- 27/27 smoke tests still pass
- Manually: platform_owner can add a row, edit it, toggle active; non-platform_owner sees read-only
- `entitlement_audit` row created for both create and update
- No change in any other PMS screen

### Rollback
- Drop table `public.sensitive_fields`
- Remove sub-tab from `DataGovernanceTab.tsx`

### Documentation & Policy
- DOCUMENTATION.md: add "Sensitive Field Registry" subsection under Data Governance
- POLICY.md: note registry exists but is non-enforcing; enforcement deferred to later phase

Ready to implement on approval.