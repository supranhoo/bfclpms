---
name: Development Report What / Why / How
description: rationale + usage_notes capture rules, no-overwrite ingest, appended export columns (ADR-249)
type: feature
---

# Development Report — What / Why / How (ADR-249, POLICY §131b)

- `dev_report_entries.rationale` = Why it was built; `usage_notes` = How it is used.
- Sources are genuine only: ADR `## Context` / `## Consequences`, changelog bullets
  labelled `**Why:** / **Problem:** / **How:** / **Usage:**`, or migration header
  comment + created tables/functions. No source → NULL. Never invent narrative.
- `dev-report-ingest` fills these fields ONLY when stored value is empty; admin
  edits must never be overwritten or nulled by a resync.
- XLSX: `DEV_REPORT_DETAIL_COLUMNS` are appended AFTER the locked 101785 columns.
- UI: expandable row detail panel, "Detail coverage (Why + How)" KPI card, search
  matches both fields, dialog has both textareas.
