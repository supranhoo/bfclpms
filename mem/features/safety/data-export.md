---
name: Safety Universal Data Export
description: CSV exporter for Safety datasets via /safety/settings → Data export card
type: feature
---
Phase 6. Single dialog (`SafetyDataExportDialog`) on `/safety/settings` lets admins export:
incidents, assets, audit_runs, training_assignments, permits, drills, hours_worked.

Rules:
- Pure read; relies entirely on RLS for row visibility.
- Server-paginated 1000 rows/batch; hard cap `MAX_EXPORT_ROWS = 50_000`; UI shows a "capped" warning when hit.
- Dataset registry in `src/lib/safetyDataExport.ts` (`DATASETS[]`) — add a new dataset by appending a `DatasetDef` (table + columns + optional dateColumn for from/to filtering).
- CSV escaping handles quotes, commas, newlines; objects serialize via JSON.stringify; null/undefined → empty cell.
- No new tables or RPCs. No client-side role gating (RLS is the gate).
