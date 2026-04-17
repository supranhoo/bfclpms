
## Plan Update: Make `Location` a First-Class Org Master + Mandatory Toggle

Extending the prior auto-update + Location import plan with master data management and import-field configurability.

### What's added

**1. New master: `locations`**
- New table `public.locations` with: `id`, `name` (unique), `code` (optional, unique), `company_id` (nullable FK to `companies` for multi-company scoping), `is_active`, `created_at`, `updated_at`.
- Standard RLS: admins manage; everyone authenticated can read.

**2. Org Structure UI — new "Locations" tab**
- File: `src/pages/admin/OrganizationStructure.tsx` (or wherever Divisions/BUs/Departments tabs live).
- Add a `Locations` tab with full CRUD (Create / Edit / Activate-Deactivate / Delete with `ConfirmDestructiveDialog` per project policy).
- Reuse existing tab patterns (search, sort, company filter).

**3. Import engine — `location` becomes a managed master field**
- File: `src/pages/admin/ImportData.tsx` + `src/lib/importValidation.ts`.
- Resolution: `row.location` (free text from import) is matched (case-insensitive, trimmed) against `locations.name`.
  - Match found → store `profiles.location_id` (FK).
  - No match → row error: *"Location 'X' not found in master. Please add it under Organization Structure → Locations."* (mirrors existing department/BU validation behavior).
- Non-destructive update preserved: blank `location` cell → keep existing `profiles.location_id`.

**4. Schema change — Location stored as FK, not free text**
- Replace earlier proposal of `profiles.location text` with `profiles.location_id uuid` referencing `locations(id)` (nullable, indexed).
- Reason: matches how `division_id`, `business_unit_id`, `department_id` are modeled. Avoids dirty free-text variants.
- Compute engine slab predicate continues to use a string at match time (resolved via join to `locations.name`).

**5. Import Settings — per-field mandatory toggle**
- New admin page section: `Admin → System Settings → Import Field Settings` (or extend existing import config if present).
- New table `public.import_field_settings`:
  - `import_type` ('employee' | 'pms' | 'org_structure' | …)
  - `field_key` ('location', 'designation', 'pms_grade', …)
  - `is_mandatory` boolean
  - `is_visible` boolean (controls whether the column appears in template + parser at all)
  - `updated_at`, `updated_by`
- Seed defaults for existing fields (mandatory ones stay mandatory).
- UI: simple table of fields per import type with two toggles. Admin-only.

**6. Import flow honors the toggles**
- `ImportData.tsx` reads `import_field_settings` for `import_type='employee'`.
- For each row:
  - if `field.is_mandatory && cell is blank` → row error: *"`<field>` is required by current import settings."*
  - if `field.is_visible === false` → field is ignored even if present in the file.
- Downloadable template auto-includes only visible fields; mandatory fields are marked with `*` in the header.

**7. Add/Edit User dialog — use `Location` dropdown**
- Bound to `locations` master (active rows).
- Replaces the earlier free-text input from the prior plan.

**8. Compute engine re-wiring (unchanged from prior plan, adjusted to FK)**
- `compute-monthly-incentives/index.ts`: select `location_id` on profiles; resolve `location.name` via a single batch fetch; pass that into the slab matching predicate at line ~454.
- Mandatory `error` check from ADR-044 v3 still applies.

**9. SSOT sync**
- `DOCUMENTATION.md`: Version History — *"Location promoted to org master with FK on `profiles`; per-field mandatory toggles introduced for employee imports."*
- `POLICY.md`: under Master Data — *"Location is a managed master; free-text values from imports must resolve against `locations.name` or the row is rejected."* Under Import Governance — *"Field mandatoriness is configurable via `import_field_settings`; defaults seed existing required fields."*
- `mem://architecture/data-import-engine`: add `location` (FK-resolved) and the new field-settings layer.

### Files Touched (delta vs prior plan)
- migration: `locations` table, `profiles.location_id`, `import_field_settings` table + seeds
- `src/pages/admin/OrganizationStructure.tsx` — new Locations tab
- `src/pages/admin/ImportData.tsx` — FK resolution + mandatory/visible enforcement + dynamic template
- `src/lib/importValidation.ts` (+ test) — dynamic schema based on settings
- `src/pages/admin/UserManagement.tsx` — Location dropdown
- new: `src/pages/admin/ImportFieldSettings.tsx` (or section inside System Settings)
- `supabase/functions/create-employee/index.ts` — accept `location_id`
- `supabase/functions/compute-monthly-incentives/index.ts` — FK-aware location pass-through
- `DOCUMENTATION.md`, `POLICY.md`, `mem://architecture/data-import-engine`

### Risk & Impact
| Area | Impact |
|---|---|
| Data | New tables + nullable FK; zero backfill required. Existing employees get `location_id = NULL` until imported/edited. |
| Workflow | Import gains a strict master check for `location` (matches existing pattern for dept/BU). Per-field toggles are additive — defaults preserve current behavior. |
| UI/UX | One new Org Structure tab, one new Settings page, one new dropdown in Add/Edit User, optional `*` markers on import templates. |
| Regression | Low. Toggle defaults preserve current required-field set. Compute engine change is guarded by mandatory `error` checks (ADR-044 v3). |
| Mitigation | Vitest cases: (a) location resolves by name, (b) unknown location rejected, (c) blank location preserved on existing rows, (d) mandatory toggle ON + blank cell → error, (e) visibility OFF → field ignored. Seed migration tested in dry-run. |

### Out of Scope
- Bulk-creating `locations` master from existing free-text values (none exist; column is new).
- Slab editor UI to expose `location` as a configurable scope dimension (matching predicate only).
- Per-company import templates (single global template per import type for now).
