---
name: performance-console-access-and-pipeline
description: Performance Console access tiers (read for admin/management/auditor/hr_pms, write admin-only) and the read-only Review Pipeline tab
type: feature
---
ADR-284 / POLICY §CONSOLE-ACCESS-TIERS.

- Read tier: admin, management, auditor, hr_pms (server SSOT `bu_console_can_read`).
  Route + sidebar carry `menuKey='admin-bu-console'` so profile-based menu access also applies.
- Write tier: admin only (every `bu_console_*` write RPC checks `has_role(uid,'admin')`).
  UI mirrors it through `useBuConsoleCapability()` — hide, never disable-and-fail.
- Pipeline tab (`bu_console_pipeline` RPC): per-stage pending counts (items + distinct people)
  and a server-paged employee list, read-only for all tiers, deep-links to `/dashboard?employee=`.
- Pending stage derives from `get_bulk_employee_workflows` + `kpis.status`, matching
  `src/lib/bottleneckResolver.ts` active-stage exceptions. Never hardcode the ladder.
