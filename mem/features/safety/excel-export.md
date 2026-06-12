---
name: Safety Incident Excel Export
description: Safety-Head/Admin .xlsx export of incidents — locked columns, server-paginated, reuses list view + RLS
type: feature
---

- Entrypoint: `exportIncidentsToExcel(filters)` in `src/lib/safetyIncidentExcelExport.ts`.
- Source: `safety_incidents_with_sla` view (same as list page) → RLS + SLA derivation stay consistent.
- Pagination: 1000 rows/batch, hard cap `MAX_INCIDENT_EXPORT_ROWS = 50_000`. Capped state surfaced via toast.
- Hydration: single batched `business_units` + `profiles` IN()-lookups; profile keys = `reporter_id`, `actual_reporter_id`, `assigned_to`, `closed_by`.
- Columns are LOCKED (`INCIDENT_EXPORT_COLUMNS`) — never reorder without updating the test in `src/test/safety/incidentExcelExport.test.ts` AND DOCUMENTATION.md.
- Closure Remarks maps to `verification_notes` (Safety Head closure step), not `capa_summary` or `rca_summary`.
- UI visibility: `effectiveRole === 'admin'` OR `safety_user_roles.role = 'safety_head'` (via `useMySafetyRoleRows`). Server still relies on RLS.
- Library: existing `xlsx` (SheetJS). Do NOT add new spreadsheet deps.