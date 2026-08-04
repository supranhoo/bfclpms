# Development Report — capture What / Why / How for every entry

Today each Development Report row carries only a `description` ("what"). The
report cannot answer *why* a feature was built or *how* it is meant to be used.
This plan adds those two dimensions end to end: capture, storage, UI and export.

## What changes for the user

- Every Features row shows three blocks instead of one:
  - **What was built** (existing description)
  - **Why it was built** (rationale / problem it solves)
  - **How it is used** (who uses it, where in the app, what it enables)
- Rows expand in place on the Features, Bugs Fixed and Timeline tabs; the grid
  stays compact by default (chevron per row, expanded panel below).
- The admin add/edit dialog gains **Rationale** and **How it is used** fields, so
  gaps in auto-captured text can be filled manually.
- The XLSX export gains two columns, appended after the existing locked columns
  so previously submitted evidence files stay column-compatible.
- A "Detail coverage" KPI card shows what % of entries in the current filter
  already have both rationale and usage filled — the gap is visible, not silent.

## Where the content comes from (no invented text)

Genuine-entry rule (POLICY §131) still holds — nothing is synthesised.

| Source | Why (rationale) | How (usage) |
| --- | --- | --- |
| ADR file | `## Context` section | `## Consequences` (Positive) + `## Related` code/policy refs |
| CHANGELOG entry | bullet starting `**Why:**` / `**Problem:**`, else the RCA line | bullet starting `**How:**` / `**Usage:**` / `**Where:**`, else "Files:" / route line |
| Migration | leading `--` comment lines beyond the first | objects created (tables, functions, policies) rendered as "used by" text |
| Admin manual entry | typed by the admin | typed by the admin |

When a source has no such section the field stays `NULL` and the row is counted
against the coverage KPI — never back-filled with filler.

## Technical detail

1. **Migration** — add `rationale text` and `usage_notes text` to
   `public.dev_report_entries` (additive, nullable; no RLS/grant change, existing
   policies already cover the table; rollback = `DROP COLUMN`). Both columns are
   automatically inside backup coverage via `get_backup_table_order()`.
2. **SSOT parser** `src/lib/devReport/capture.ts` — extend `DevReportCaptureRow`
   with `rationale` / `usage_notes`, and add section extractors for ADR Context /
   Consequences, changelog `**Why:**` / `**How:**` bullets, and migration comment
   blocks. `captureKey` is unchanged, so `uq_dev_report_entries_ingest_key`
   idempotency is preserved.
3. **Ingest** `supabase/functions/dev-report-ingest/index.ts` — accept the two new
   fields; on conflict, `UPDATE` them only when the stored value is NULL so admin
   edits are never overwritten by a resync.
4. **UI** `src/pages/reports/DevelopmentReport.tsx` — expandable row detail
   (What / Why / How), coverage KPI card, search extended to the new fields.
   `src/components/reports/DevReportEntryDialog.tsx` — two new textareas.
5. **Export** `src/lib/devReportExport.ts` — append `Why It Was Built` and
   `How It Is Used` after the current locked columns on all three data sheets;
   existing column positions are untouched.
6. **Types** — regenerate Supabase types for the new columns.

## Tests

- `src/test/devReportCapture.test.ts` — new cases: ADR Context → rationale,
  Consequences → usage; changelog `**Why:**`/`**How:**` bullets; migration
  comment block; missing sections yield `null`; capture keys unchanged
  (idempotency regression guard).
- `src/test/devReportExportSchema.test.ts` — assert the first N headers still
  equal the locked evidence schema (prefix assertion) and that the two new
  columns are appended last.
- New: ingest merge rule — resync must not overwrite a non-null admin value.

## Risk & impact

- **Data:** additive nullable columns only; no historical rewrite. Rollback safe.
- **Workflow / RLS:** none — same table, same policies, admin-only writes.
- **UI/UX:** default grid density unchanged (detail is collapsed); responsive
  panel stacks on mobile.
- **Regression:** export schema is the only shared contract — protected by the
  prefix test. Idempotency protected by an unchanged `captureKey`.
- **Scalability:** two text columns on an admin-only, filtered report; no extra
  queries — the fields ride along the existing entries fetch.

## Docs

`DOCUMENTATION.md`, `POLICY.md` §131 (extend to §131b — What/Why/How rule),
`docs/adr/ADR-249.md`, and the Development Report memory entry.
