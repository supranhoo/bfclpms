## Assumptions

- "Division" maps to `business_units`; "Department" maps to `departments` (FK to BU). No separate `divisions` table is needed — reuse existing org SSOT per `useSafetyOrg`.
- Resolved routing is **frozen on the incident** at report time so later config edits do not rewrite history (matches the PMS "immutable resolved chain" pattern).
- BU Head / Manager / 2nd Manager are `profiles.id` references (active employees only). No new role enum.
- Admin UI lives under existing `SafetySettings` hub as a new "Incident Routing" tab, gated by the existing `safety_permission_keys` (`nav.settings` + a new `action.routing.manage`).
- Notifications stay on the existing `trg_safety_incident_after_insert` path — we extend it to notify the resolved chain in addition to (not instead of) the current Safety Admin/Head fallback.
- "Missing routing fallback" = incident still created successfully, but flagged with `routing_status = 'unrouted'` and surfaced as a warning badge; Safety Admin/Head continue to receive notification (current behavior).

## Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data | New table `safety_incident_routing_rules` + 4 nullable columns on `safety_incidents` (`routed_bu_head_id`, `routed_manager_id`, `routed_second_manager_id`, `routing_status`). Additive only. | Backfill `routing_status='legacy'` for existing rows. |
| Workflow | `report_safety_incident` RPC extended to resolve + stamp routing. Existing trigger unchanged in numbering/SLA logic. | Resolver is a separate SECURITY DEFINER helper; failures degrade to `unrouted`, never block submission. |
| UI/UX | Incident detail + list show 3 new fields; Settings gets a Routing tab. | Reuse existing `Table`, `SafetyResponsiveList`, employee combobox patterns. |
| RLS | New table: admin/safety-head write, all authenticated read (config is non-sensitive). New incident cols inherit existing row policies. | Explicit GRANTs + policies in migration. |
| Regression | Existing incidents without routing rules must keep working. | Resolver returns null on miss; UI tolerates nulls; trigger fallback to Admin/Head preserved. |
| Scalability | One rule lookup per insert, indexed on `(business_unit_id, department_id, is_active)`. Negligible cost. | Partial unique indexes for the "one active rule" constraint. |

Rollback: drop new table + 4 columns + RPC changes; trigger reverts to pre-change body. No destructive change to existing data.

## Database Migration

```sql
-- 1. Routing rules table
CREATE TABLE public.safety_incident_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id uuid NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  department_id uuid NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  bu_head_id uuid NOT NULL REFERENCES public.profiles(id),
  manager_id uuid NOT NULL REFERENCES public.profiles(id),
  second_manager_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL REFERENCES public.profiles(id),
  updated_by uuid NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique: one active rule per dept; one active default per BU (dept NULL)
CREATE UNIQUE INDEX uq_safety_routing_active_dept
  ON public.safety_incident_routing_rules (business_unit_id, department_id)
  WHERE is_active AND department_id IS NOT NULL;
CREATE UNIQUE INDEX uq_safety_routing_active_bu_default
  ON public.safety_incident_routing_rules (business_unit_id)
  WHERE is_active AND department_id IS NULL;
CREATE INDEX ix_safety_routing_lookup
  ON public.safety_incident_routing_rules (business_unit_id, department_id, is_active);

GRANT SELECT ON public.safety_incident_routing_rules TO authenticated;
GRANT ALL ON public.safety_incident_routing_rules TO service_role;
ALTER TABLE public.safety_incident_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety routing read" ON public.safety_incident_routing_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "safety routing admin write" ON public.safety_incident_routing_rules
  FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(), 'admin') OR public.has_safety_role(auth.uid(), 'safety_head'))
  WITH CHECK (public.has_safety_role(auth.uid(), 'admin') OR public.has_safety_role(auth.uid(), 'safety_head'));

-- updated_at trigger reuses public.update_updated_at_column()

-- 2. Persisted resolved chain on incidents
ALTER TABLE public.safety_incidents
  ADD COLUMN routed_bu_head_id uuid NULL REFERENCES public.profiles(id),
  ADD COLUMN routed_manager_id uuid NULL REFERENCES public.profiles(id),
  ADD COLUMN routed_second_manager_id uuid NULL REFERENCES public.profiles(id),
  ADD COLUMN routing_status text NOT NULL DEFAULT 'unrouted'
    CHECK (routing_status IN ('dept','division','unrouted','legacy'));
UPDATE public.safety_incidents SET routing_status = 'legacy';

-- 3. Resolver helper (SECURITY DEFINER, pinned search_path)
CREATE OR REPLACE FUNCTION public.resolve_safety_routing(p_bu uuid, p_dept uuid)
RETURNS TABLE(bu_head uuid, manager uuid, second_manager uuid, source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bu_head_id, manager_id, second_manager_id, 'dept'
  FROM safety_incident_routing_rules
  WHERE is_active AND business_unit_id = p_bu AND department_id = p_dept
  UNION ALL
  SELECT bu_head_id, manager_id, second_manager_id, 'division'
  FROM safety_incident_routing_rules
  WHERE is_active AND business_unit_id = p_bu AND department_id IS NULL
  LIMIT 1;
$$;

-- 4. Patch report_safety_incident RPC to call resolver and stamp 4 cols
--    (full body re-applied; numbering/SLA trigger unchanged)

-- 5. Extend trg_safety_incident_after_insert to also notify routed_*_id
--    when present (Admin/Head fallback notification preserved).
```

## Files to Create

- `src/components/safety/settings/SafetyIncidentRoutingTab.tsx` — admin matrix UI (BU/Dept selector, 3 employee comboboxes, active toggle, list of existing rules with edit/deactivate).
- `src/components/safety/RoutingChainDisplay.tsx` — small presentational component (BU Head / Manager / 2nd Manager rows + missing-routing warning).
- `src/hooks/useSafetyIncidentRouting.ts` — list/create/update/deactivate rules; resolves names via `useActiveProfilesLite`.
- `src/test/safety/incidentRouting.test.ts` — unit tests for resolver order, missing routing, inactive rules.

## Files to Modify

- `src/pages/safety/SafetySettings.tsx` — add "Incident Routing" tab (gated by `nav.settings` + new permission key).
- `src/lib/safety/permissionKeys.ts` — add `action.routing.manage`.
- `src/pages/safety/SafetyIncidentDetail.tsx` — render `<RoutingChainDisplay>` in header card.
- `src/pages/safety/SafetyIncidents.tsx` — add optional "Routing" column on desktop showing status badge (routed/unrouted).
- `src/hooks/useSafetyIncidents.ts` — extend `SafetyIncidentRow` type with new fields; types regenerate from migration.
- `mem/index.md` + new `mem/features/safety/incident-routing.md` — record SSOT rule.

## Step-by-Step Plan

1. **Migration** → table, indexes, RLS, resolver, incident columns, RPC + trigger patch. Verify via Supabase linter.
2. **Types regenerate** automatically post-migration.
3. **Hook + Admin UI** (`useSafetyIncidentRouting`, `SafetyIncidentRoutingTab`) wired into `SafetySettings`. Verify save/edit/deactivate + duplicate-rule error toast.
4. **Display component** in incident detail + list column. Verify warning shows for `routing_status='unrouted'`.
5. **Tests** for resolver precedence (dept > division > none) + inactive-rule exclusion.
6. **Memory + docs** entry.

## UI Changes

- **Settings → Incident Routing tab**: filter by BU; table of rules (BU / Dept / BU Head / Manager / 2nd Manager / Active / Actions); "Add Rule" dialog with 5 selects + active toggle; inline validation for duplicate active rule and incomplete chain.
- **Incident Detail header**: new "Routing" subsection below the existing meta grid, with three labeled rows and an amber warning chip if unrouted.
- **Incident List**: new "Routing" badge column (desktop only) — green "Routed" / amber "Unrouted" / muted "Legacy".

## Not Applicable

- New role enum, division table, offline queue changes, payment/AI integration.

Awaiting approval to implement.
