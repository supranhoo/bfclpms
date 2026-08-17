---
name: Performance Console single surface
description: Console has no tabs — one KPI list per KRA with inline people cells, plus admin-only multi-person KPI creation (ADR-289/294/297)
type: constraint
---
The Performance Console is ONE surface. Do not add tabs, and never print a KPI name twice.

- KRA disclosure = `renderKraSummary` (slim review counters) + one KPI list. Expanding a KPI row
  opens `KpiPeopleStrip` (its employee cells) inside that row via `renderKpiPanel`. One KPI panel
  open at a time. `KraWorksheet.tsx` is deleted (ADR-297).
- Stage rail above the tree (counts from `bu_console_pipeline`) is the stage picker; read-only.
- KRA alignment (`GoalsTab`) and KPI library (`MergeProposalsTab`) are header overflow dialogs.
- **New KPI** header action → `bu_console_kpi_create` (SECURITY DEFINER, admin-only, dry-run first).
  Kinds map to existing columns: individual / shared (`org`) / department_event (`departmental`).
  Duplicates for the month come back as `duplicate_kpi` skips.
- Consolidation is presentation-only: RPC write tiers and §88 immutability unchanged.
POLICY §CONSOLE-SINGLE-SURFACE, §CONSOLE-KPI-CREATE.
