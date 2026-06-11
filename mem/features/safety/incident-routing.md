---
name: Safety Incident Routing
description: Department/Division → BU Head + Manager + 2nd Manager routing matrix and persisted resolved chain on safety_incidents.
type: feature
---
- Config table: `public.safety_incident_routing_rules` (BU + nullable Dept → bu_head_id, manager_id, second_manager_id, is_active). Partial unique indexes enforce ONE active rule per (BU,Dept) and ONE active default per BU (Dept NULL). RLS: read for all authenticated, write only for `admin` / `safety_head` (`has_safety_role`).
- Resolver: `public.resolve_safety_routing(p_bu, p_dept)` — dept-specific rule wins, then division (dept NULL) default.
- `public.report_safety_incident` calls resolver and stamps 4 cols on `safety_incidents`: `routed_bu_head_id`, `routed_manager_id`, `routed_second_manager_id`, `routing_status` ∈ {'dept','division','unrouted','legacy'}. Chain is IMMUTABLE after insert — config edits must not rewrite history.
- `trg_safety_incident_after_insert` notifies Safety Admin/Head AND each non-null routed_*_id. Unrouted incidents still notify Safety Admin/Head fallback.
- View `safety_incidents_with_sla` exposes the 4 routing cols at end of column list (CREATE OR REPLACE VIEW cannot reorder existing cols).
- Admin UI: Safety Settings → `SafetyIncidentRoutingTab` (matrix CRUD). Incident detail: `RoutingChainDisplay` shows chain or amber "Unrouted" warning. Incident list: lg-screen "Routing" column.
- Permission key: `action.routing.manage`.