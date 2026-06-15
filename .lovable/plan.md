
# Development Report — In-System Maintenance Plan (v2)

> Change vs v1: the module lives under **Reports**, not Admin. Permissions, route, registry entry and export filename adjusted accordingly. Everything else stands.

## 1. What the uploaded file is

`101785_PMS_Digitalisation_Self_Evidence.xlsx` is a 4-sheet **BFCL PMS Project Development Report** generated outside the app from `CHANGELOG_2026.md`:

- **Sheet 1 — Cover/Summary**: project meta, reporting period, workstreams, counts (Features=20, Bugs=20, Timeline=45).
- **Sheet 2 — New Features Built**: `Date / Period | Feature | Module/Area | What Was Built | Status`.
- **Sheet 3 — Bugs Fixed**: `Date / Period | Bug / Issue | Fix Description | Severity`.
- **Sheet 4 — Full Development Timeline**: `Date / Period | Item | Summary | Type` (Feature / Bug Fix / Maintenance).

Goal: capture every release item, bug fix and ADR/POLICY change **inside the app** as the SSOT, and turn the XLSX into a one-click export from the **Reports** section.

## 2. Assumptions

- Lives under **Reports → "Development Report"** (`/reports/dev-report`).
- Read access for **Admin + Management + Auditor**; write (create/edit/delete) restricted to **Admin** only.
- Output XLSX schema/column order matches the uploaded file exactly so prior evidence submissions remain valid.
- Single workspace (product-level report), so no per-client scoping; standard RLS.

## 3. Risk & Impact Report

- **Data**: +1 table `dev_report_entries`, +1 enum `dev_report_entry_type`, a few `system_settings` rows for cover meta. Additive; auto-backed-up by `get_backup_table_order()` (no denylist).
- **Workflow**: none for end users. New report-registry entry `RPT-DEV-001` + menu key `reports-dev-report`. Default visibility: Admin (RW), Management/Auditor (RO).
- **UI/UX**: new card in `/reports`, new page with 4 tabs (Cover / Features / Bugs / Timeline). Reuses shadcn DataTable, `ConfirmDestructiveDialog`, server pagination, filter chips — consistent with existing report pages.
- **Regression**: very low. No edits to existing report pages or hooks. Menu/report-registry inserts are additive and feature-flagged.
- **Mitigation**: gated behind `system_settings.dev_report_enabled` (default OFF) until QA pass; importer ships dry-run; export is read-only.
- **Scalability**: bounded (~50–200 rows/year). Server pagination (page size 50), indexed `(entry_type, entry_date desc)`. Scales 10y+ trivially.

## 4. Data Model

`public.dev_report_entries`:

```text
id              uuid pk
entry_type      dev_report_entry_type   -- 'feature' | 'bug' | 'timeline'
entry_date      date                    -- exact date when known
period_label    text                    -- e.g. "2026 Jun W1" when no exact date
title           text                    -- Feature / Bug / Item
module_area     text                    -- "Org KPI", "Safety / Backup", ...
description     text                    -- "What Was Built" / "Fix Description" / "Summary"
status          text  null              -- features: Shipped / In Progress / Planned
severity        text  null              -- bugs: Critical / High / Major / Medium / Low
timeline_type   text  null              -- timeline: Feature / Bug Fix / Maintenance
adr_refs        text[] null             -- e.g. {ADR-072, POLICY §54 v5}
linked_commit   text  null
created_by      uuid -> auth.users
created_at, updated_at timestamptz
```

- Indexes: `(entry_type, entry_date desc)`, `(module_area)`, GIN on `adr_refs`.
- RLS:
  - Admin: full CRUD via `has_role(auth.uid(),'admin')`.
  - Management + Auditor: SELECT only.
  - Service role: ALL.
- GRANTs per policy: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role` (writes still gated by RLS).
- Audit trigger writes to `system_audit_logs` on INSERT/UPDATE/DELETE.

Cover-sheet meta in `system_settings`: `dev_report.project_name`, `dev_report.tech_stack`, `dev_report.repository`, `dev_report.workstreams[]`. Counts and reporting-period are **derived** (RPC) — no manual upkeep.

## 5. Backend

- Migration: enum + table + indexes + GRANTs + RLS + audit trigger.
- RPC `dev_report_summary(period_from date, period_to date)` → counts for cover sheet/KPI cards (lean payload).
- **Report registry**: insert into `report_registry` + `report_field_registry` so the page participates in the existing Report Field Sequence resolver:
  - `report_id = 'RPT-DEV-001'`, route `/reports/dev-report`.
  - Default field sets for each sheet (cover/features/bugs/timeline) seeded; required keys (`entry_date`, `title`, `description`) marked `is_required=true` and non-hideable.

## 6. UI

Route: `/reports/dev-report`, registered via `ReportRoute` with `reportKey="dev-report"`. Reports landing tile added in the existing Reports grid.

```text
┌────────────────────────────────────────────────────────────┐
│ Header: Development Report   [Period filter] [Export XLSX] │
├────────────────────────────────────────────────────────────┤
│ KPI cards: Features | Bugs | Timeline | Reporting Period   │
├────────────────────────────────────────────────────────────┤
│ Tabs: [Cover] [Features] [Bugs Fixed] [Timeline]           │
│ ─ Tables: server pagination (50/page), search,             │
│   module + severity + type filters, sort by date           │
│ ─ Admin-only row actions: Edit / Delete (Confirm dialog)   │
│ ─ "+ Add entry" dialog (admin), type-aware fields          │
└────────────────────────────────────────────────────────────┘
```

- Add/Edit dialog: react-hook-form + zod; fields conditional on `entry_type`.
- Filters: date range (defaults to current FY July–June), module multi-select (distinct), severity/type chips.
- Empty states + try/catch toasts on every mutation; `ConfirmDestructiveDialog` for deletes (per project policy).
- Non-admin viewers see read-only tables and the Export button.

## 7. Export

`Export XLSX` (uses already-installed `xlsx`) generates the **same 4-sheet workbook**, columns resolved via `useResolvedReportFields('RPT-DEV-001', DEFAULT_FIELDS)`:

1. Cover — project/tech/workstreams from `system_settings`, counts from `dev_report_summary`, period from filter.
2. Features — `entry_type='feature'`.
3. Bugs Fixed — `entry_type='bug'`.
4. Timeline — `entry_type='timeline'`.

Filename template: `{client_corp}_PMS_Digitalisation_Self_Evidence_{YYYYMMDD}.xlsx` (matches 101785 naming; corp id from `system_settings`).
PDF export deferred to v2.

## 8. Seeding / Importer (one-time)

Admin-only edge function `dev-report-import` that ingests:
- `CHANGELOG_2026.md` entries in the repo, and
- the uploaded XLSX (parsed once).

Dry-run JSON first; admin confirms, then a single transactional insert with `created_by = service`, `adr_refs` extracted via regex (`ADR-\d+`, `POLICY §\d+`).
Idempotent on `(entry_type, entry_date, title)`.

## 9. Tests & Docs

- `src/test/devReportEntriesRls.test.ts` — admin RW / management+auditor RO / others denied.
- `src/test/devReportExportSchema.test.ts` — locks XLSX column order to the uploaded sample.
- `src/test/devReportSummaryRpc.test.ts` — count math across exact-date + period-label rows.
- `src/test/devReportImportIdempotent.test.ts` — re-running importer inserts 0 rows.
- DOCUMENTATION.md: new "Development Report" section (schema, RPC, export contract, registry IDs).
- POLICY.md: new clause — *every shipped feature, fix, ADR or POLICY change MUST add a `dev_report_entries` row in the same PR; release evidence is generated from this table, not from external changelogs.*
- New ADR (`ADR-090`) documenting the move from external changelog to in-system SSOT.

## 10. Rollout

1. Migration + RLS + GRANT + report-registry rows + tests (no UI surface).
2. Reports page behind `dev_report_enabled = false`.
3. Importer dry-run on staging; review diff; apply.
4. Flip flag ON; validate XLSX against uploaded 101785 file (column-order parity test).
5. Follow-up: PR-template checkbox "Dev Report entry added?" + lint warning on `feat:`/`fix:` commits without a matching row.

## 11. Out of scope (v1)

- Auto-generation from git commit messages.
- Per-client report instances.
- PDF export, scheduled email distribution.
- Direct PR/issue linking beyond the manual `linked_commit` field.
