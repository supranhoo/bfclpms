
# Safety Parity — Missing-Only Closeout Plan

Source of truth: `docs/safety/parity-audit-2026-06.md` §4. Only the 7
items classified **Missing** are in scope. Items classified Full / Partial
are out of scope and must not be touched.

## 0. The 7 Missing items (verbatim from audit §4)

1. `BuHeadDashboard.tsx` — BU-Head-scoped dashboard layout
2. `DeptRiskWidget.tsx` — department risk heat tile
3. `RepeatHeatmapWidget.tsx` — location-recurrence heatmap
4. `useSafetyMasterData.ts` + table `safety_master_data` — generic reference registry
5. RPC `safety_dashboard_at_risk` — multi-factor at-risk roster
6. RPCs `safety_analytics_recurrence`, `safety_analytics_top_root_causes`, `safety_analytics_dept_risk_trend`
7. Table `safety_emergency_acknowledgements` — ack-per-employee for emergencies

Decision on item 7: BFCL's drill model intentionally side-steps acks
(audit §3.1, §8). Re-introducing acks would conflict with the drill FSM.
**Recommend: NOT shipping item 7** as an additive table; instead surface
this as an explicit "won't fix" note in `DOCUMENTATION.md`. Confirm
before Phase 3 begins.

## 1. Architecture & reuse constraints

- Reuse `useSafetyDashboardStats` view-based aggregation pattern — do
  not bypass `safety_incidents_with_sla`.
- New analytics endpoints go through MV + `refresh_safety_analytics`
  contract (Phase 8 SSOT). New MVs must be added to
  `src/test/safety/phase8/analytics-mv-contract.test.ts` allowlist.
- New widgets render inside `SafetyHome.tsx` behind
  `has_safety_role(uid, 'bu_head')` / `has_any_safety_role`. No new
  route, no replacement of existing tiles.
- Master-data table follows existing `safety_settings` RLS posture
  (admin write, authenticated read) — not `anon`.
- No edits to `src/integrations/supabase/client.ts` or `types.ts`
  (auto-gen).

## 2. Pre-implementation risk & impact

| Risk | Detail | Mitigation |
|---|---|---|
| MV refresh cost | 3 new MVs join incidents × root cause × dept | Same refresh cadence as existing 7 MVs; concurrent refresh; index `safety_incidents(occurred_at, department_id, root_cause)` |
| Phase 8 contract test break | New MVs not in allowlist → red | Update allowlist + add per-MV column/SSOT test in same migration PR |
| RLS leakage on widgets | BU-Head widget shows cross-BU data | Filter via `has_safety_role(auth.uid(), 'bu_head')` + BU scope from `safety_user_roles` |
| Dashboard regression | New tiles re-render `SafetyHome` | Gate via lazy `Suspense` + `useQuery` cache; existing tiles untouched |
| Master-data unused fan-out | Adding table nobody reads | Wire `useSafetyMasterData` only to one consumer (Settings → Reference Data section), no other call sites |
| Backup coverage | New tables auto-included | Verify `public.get_backup_table_order()` picks up `safety_master_data` (Core memory: backup is automatic) |
| Performance | `at_risk` roster RPC scans incidents | LIMIT 200; index `safety_incidents(assigned_to, sla_state)` exists; cache 60s |

Estimated impact: additive only. Zero rows changed in existing tables,
zero existing files replaced. ~6 new files, ~3 file edits, 1 migration.

## 3. Phase 1 — Reference data + analytics RPCs

### 3.1 `safety_master_data` table + hook (gap #4)

Migration:

```text
CREATE TABLE public.safety_master_data (
  id uuid PK default gen_random_uuid(),
  category text NOT NULL,        -- e.g. 'root_cause','ppe_type','hazard_class'
  code text NOT NULL,
  label text NOT NULL,
  parent_id uuid NULL REFERENCES safety_master_data(id) ON DELETE SET NULL,
  sort_order int NOT NULL default 0,
  is_active bool NOT NULL default true,
  metadata jsonb NOT NULL default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  UNIQUE (category, code)
);
GRANT SELECT ON public.safety_master_data TO authenticated;
GRANT ALL    ON public.safety_master_data TO service_role;
ALTER TABLE  public.safety_master_data ENABLE ROW LEVEL SECURITY;
-- read: any authenticated user with safety module access
-- write: has_safety_role(auth.uid(),'admin') OR 'safety_head'
```

New files:

- `src/hooks/useSafetyMasterData.ts` — `useQuery(['safety','master-data',category])`
- `src/components/safety/SafetyMasterDataPanel.tsx` — admin CRUD table
  inside `SafetySettings.tsx` (gated by `has_safety_role admin/safety_head`)

Edited files:

- `src/pages/safety/SafetySettings.tsx` — add `<SafetyMasterDataPanel />` tab

Verification: unit tests for hook + RLS smoke test entry in
`src/test/safety/phase8/safety-rls-smoke.test.ts`.

### 3.2 Three analytics MVs + RPCs (gap #6)

Migration creates three MVs and three thin wrapper RPCs (to match
prototype RPC names for parity):

```text
CREATE MATERIALIZED VIEW public.mv_safety_recurrence AS
  SELECT location_id, department_id, root_cause,
         count(*) AS occurrences,
         max(occurred_at) AS last_occurred_at
  FROM safety_incidents
  WHERE occurred_at >= now() - interval '12 months'
  GROUP BY 1,2,3 HAVING count(*) > 1;

CREATE MATERIALIZED VIEW public.mv_safety_top_root_causes AS
  SELECT root_cause, severity, count(*) AS incidents
  FROM safety_incidents
  WHERE root_cause IS NOT NULL
    AND occurred_at >= now() - interval '12 months'
  GROUP BY 1,2;

CREATE MATERIALIZED VIEW public.mv_safety_dept_risk_trend AS
  SELECT department_id,
         date_trunc('month', occurred_at) AS month,
         count(*) FILTER (WHERE severity IN ('high','critical')) AS high_sev,
         count(*) AS total
  FROM safety_incidents
  WHERE occurred_at >= now() - interval '12 months'
  GROUP BY 1,2;
```

RPC wrappers `safety_analytics_recurrence(p_dept uuid default null)`,
`safety_analytics_top_root_causes(p_limit int default 10)`,
`safety_analytics_dept_risk_trend(p_months int default 12)` — all
SECURITY DEFINER, scoped via `has_safety_module_access(auth.uid())`,
return rows from the MVs.

Also add `safety_dashboard_at_risk(p_threshold int default 3)` RPC
returning per-assignee open count + max SLA state. No MV needed; reads
`safety_incidents_with_sla` directly with LIMIT 200.

Edits:

- `src/hooks/useSafetyAnalytics.ts` — add 3 query keys
- `src/test/safety/phase8/analytics-mv-contract.test.ts` — extend
  allowlist with 3 new MV names + expected columns
- `refresh_safety_analytics()` — append the 3 new MVs

Verification: contract test green; manual `EXPLAIN` for MV indexes.

## 4. Phase 2 — Dashboard widgets (gaps #1, #2, #3)

All three render inside `SafetyHome.tsx` as additive cards. No layout
shuffle of existing tiles.

New files:

- `src/components/safety/dashboard/BuHeadDashboard.tsx` — wrapper that
  renders DeptRisk + Repeat-Heatmap + AtRisk roster when
  `has_safety_role(uid,'bu_head')` is true. Pulls from existing hooks.
- `src/components/safety/dashboard/DeptRiskWidget.tsx` — consumes
  `safety_analytics_dept_risk_trend`; renders heat tile using existing
  `SafetyHeatmap` primitive in `src/components/safety/analytics/`.
- `src/components/safety/dashboard/RepeatHeatmapWidget.tsx` — consumes
  `safety_analytics_recurrence`; location × root_cause grid.
- `src/components/safety/dashboard/AtRiskWidget.tsx` — consumes
  `safety_dashboard_at_risk` RPC; assignee roster sorted by red SLA.

Edited files:

- `src/pages/safety/SafetyHome.tsx` — conditional `<BuHeadDashboard />`
  block; only visible when role check resolves true. No existing tile
  removed.

UI specifics:
- Visual location: below existing severity tile row, above recent list
- Mobile: each widget collapses to single-column via existing
  `SafetyResponsiveList` breakpoints
- Empty/loading: reuse `SafetySkeletonBlock`, `SafetyEmptyState`
- Drill-down: reuse `KpiDrillDownDialog`

Tests: snapshot + role-gate test per widget under
`src/test/safety/dashboard/`.

## 5. Phase 3 — Residual gap (item #7)

Default recommendation: **do not implement**
`safety_emergency_acknowledgements`. The BFCL drill model treats acks
as an anti-pattern (audit §3.1, §8). If implemented, it would require
loosening `safety_drills_block_status_writes`, which the Phase 8 SSOT
forbids.

Action in Phase 3: add a one-paragraph "Won't fix — superseded by drill
participants" note to:

- `docs/safety/parity-audit-2026-06.md` (new §11 addendum, no edits to
  existing sections)
- `DOCUMENTATION.md` safety section
- `POLICY.md` safety section

Stop here unless the user explicitly overrides.

## 6. File-by-file summary

### Files to create
- `src/hooks/useSafetyMasterData.ts`
- `src/components/safety/SafetyMasterDataPanel.tsx`
- `src/components/safety/dashboard/BuHeadDashboard.tsx`
- `src/components/safety/dashboard/DeptRiskWidget.tsx`
- `src/components/safety/dashboard/RepeatHeatmapWidget.tsx`
- `src/components/safety/dashboard/AtRiskWidget.tsx`
- Test files mirroring each new module under `src/test/safety/`

### Files to modify
- `src/pages/safety/SafetySettings.tsx` (Phase 1)
- `src/hooks/useSafetyAnalytics.ts` (Phase 1)
- `src/test/safety/phase8/analytics-mv-contract.test.ts` (Phase 1)
- `src/test/safety/phase8/safety-rls-smoke.test.ts` (Phase 1)
- `src/pages/safety/SafetyHome.tsx` (Phase 2 — additive block only)
- `docs/safety/parity-audit-2026-06.md`, `DOCUMENTATION.md`, `POLICY.md` (Phase 3)

### Database migrations (one per phase)
- `<ts>_safety_master_data.sql` — table + GRANT + RLS + policies + update_at trigger
- `<ts>_safety_analytics_gaps.sql` — 3 MVs, 4 RPCs, refresh fn update, indexes
- (no Phase 3 migration)

### New RPCs
- `safety_analytics_recurrence`
- `safety_analytics_top_root_causes`
- `safety_analytics_dept_risk_trend`
- `safety_dashboard_at_risk`

### Rollback strategy
All changes are additive. Rollback = `DROP MATERIALIZED VIEW`,
`DROP TABLE`, `DROP FUNCTION`, revert two file edits. No destructive
schema change to existing tables.

## 7. Acceptance criteria

- Phase 8 contract test green with new MVs in allowlist
- RLS smoke test green for `safety_master_data`
- `SafetyHome` renders new tiles only for `bu_head` role
- No existing test in `src/test/safety/**` regresses
- Backup picks up `safety_master_data` automatically (verified via
  `public.get_backup_table_order()`)

## 8. Open questions before build

1. Confirm "Won't fix" stance on `safety_emergency_acknowledgements`
   (gap #7)?
2. Master-data initial seed categories — leave empty for admins to fill,
   or seed `root_cause`, `ppe_type`, `hazard_class`?
3. BU-Head dashboard — show only to `bu_head`, or also to `safety_head`
   and `admin` for oversight?

