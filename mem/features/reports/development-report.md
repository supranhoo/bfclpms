---
name: Development Report
description: Genuine-entry rule, Feb 2026 floor, no in-app Cover tab, filter-driven Reporting Period, reseed tooling
type: feature
---

# Development Report (`/reports/dev-report`, `RPT-DEV-001`)

## Genuine-entry rule (POLICY §131)
Every `public.dev_report_entries` row MUST be traceable to a concrete artefact:
- migration filename → `linked_commit = '<ts>_<uuid>.sql'`
- ADR → `linked_commit = 'ADR-XXX'` and `adr_refs` populated
- CHANGELOG line → `linked_commit = 'CHANGELOG_2026.md#YYYY-MM-DD'`
- admin manual entry → `created_by IS NOT NULL`

Synthetic / catch-all dates are forbidden. The original seed batch is archived in `public.dev_report_entries_archive_seed` (admin-read).

## Floor date
`entry_date >= 2026-02-01`. Reseed (`scripts/devReportReseed.ts`) and the `dev-report-ingest` edge function skip earlier rows.

## UI surfaces
- No in-app Cover tab. Default tab = Features. Tabs: Features / Bugs Fixed / Timeline.
- **Reporting Period KPI card** reflects the selected month filter, never global `MIN/MAX`. With `All months` it shows `"All months (min – max)"`.
- Cover meta is fetched lazily only when the user clicks Export (the XLSX still ships a schema-locked Cover sheet per `DEV_REPORT_DEFAULT_COLUMNS`).

## Idempotency
Enforced by `uq_dev_report_entries_ingest_key` on `(entry_type, COALESCE(entry_date,'1970-01-01'), COALESCE(linked_commit,''), title)`. Re-running reseed or auto-capture never duplicates rows.

## Tests
- `src/test/devReportPageNoCoverTab.test.tsx` — Cover tab absent; default = Features; period reflects filter.
- `src/test/devReportMonthFilter.test.ts` — month bounds correctness.
- `src/test/devReportExportSchema.test.ts` — XLSX column order locked.