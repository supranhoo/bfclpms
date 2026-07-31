---
name: Export Self-Sufficiency
description: Report/export actions must fetch their own data, abort on empty datasets, and flag unresolved rows instead of printing em dashes
type: constraint
---
ADR-214 / POLICY §WF-CONFIG-EXPORT-SELF-SUFFICIENT.

- Never pass a screen's query result (`data || []`) into an export component. Exports fetch their own data on click; an in-flight parent query silently degrades the file to placeholder-only rows (the 31-Jul-2026 Workflow Configuration Report blank-export defect).
- Employee lookups in admin exports use the SECURITY DEFINER roster `get_reviewer_roster_slim` via `fetchAllRpcPaged` — not a direct paged `profiles` select, which varies with the exporter's RLS visibility.
- Empty mandatory dataset ⇒ ABORT with an error toast. Never write an all-placeholder workbook.
- Unresolvable individual references render `Unresolved (id: <short>)` plus a WARNING header line with the count. `—` is reserved for genuinely absent values.
- Resolver inputs must carry real `is_active`; never hardcode `true`.
- Row construction lives in pure builders (e.g. `src/lib/reports/workflowConfigExportRows.ts`) so blank-output regressions are unit-testable.
