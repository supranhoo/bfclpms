# Menu Setting — Full Drag-and-Drop Repositioning (Phase 3)

Extend the existing Menu Setting tab (Phase 1+2) from ▲/▼ reorder + rename into a full **drag-and-drop tree** that can move any item to any technically safe level, parent, or module — without ever changing route, permission, report, or workflow keys.

---

## 1. Assumptions

- Phase 1+2 foundation is live: `menu_registry`, `menu_overrides`, `menu_override_audit`, `menu_overrides_validate` trigger, `useResolvedMenu`, `applyOverrides`, `validateMove`, feature flag `menu_overrides_enabled`.
- `menu_key`, `permission_key`, `route_path`, `feature_key` remain **immutable**. DnD only changes `custom_parent_key`, `custom_sort_order`, and (new) `custom_menu_level` + `custom_module_key`.
- L4 items (Organization sub-tabs, Workflow Config sub-tabs, etc.) need to be added to the catalog/registry as part of this phase so they can participate in DnD.
- Cross-module moves stay gated by `is_cross_app_movable` (still defaults to `false` per Phase 1 decision — admin opts in per item).
- Access control (RBAC, Menu Access, Report Access, licensing) is **never derived from menu position**. Moving an item never grants access; the existing `permission_key` continues to gate it.

## 2. Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| **Data** | Adds `custom_menu_level`, `custom_module_key` to `menu_overrides`; seeds L4 rows into `menu_registry`. Additive only. | Additive migration, defaults NULL, resolver falls back to registry. |
| **Workflow** | None. Routes and permission keys are immutable. | Resolver tests assert key stability. |
| **UI/UX** | New DnD tree replaces ▲/▼ in Menu Setting. Sidebar + Settings tabs must honor a 4-level resolved tree. | Phased: tree first, then wire L4 consumers (Organization, Workflow Config sub-tab strips) to `useResolvedMenu`. |
| **Regression** | Misconfigured move could "hide" an item from its current consumer (e.g. Organization tabs strip stops finding a child). | Resolver always returns the item; consumers render by `menu_key`, not by hardcoded order. Preview + dry-run validation before save. |
| **Security** | An admin could try to surface a restricted item under a permissive parent. | Permission check stays on `permission_key` at render + route guard time, independent of parent. RLS on `menu_overrides` stays admin-only. |
| **Scalability** | Registry grows from ~70 to ~150 rows with L4. Trivial. | Single query, cached 5min in React Query. |
| **Rollback** | Feature flag `menu_overrides_enabled` disables resolver instantly. Per-item and full reset already exist. | Keep flag; add per-item reset in DnD UI. |

## 3. Architecture

### 3.1 Database (additive migration)

```sql
ALTER TABLE public.menu_overrides
  ADD COLUMN custom_menu_level smallint NULL,
  ADD COLUMN custom_module_key text NULL;

-- Extend trigger menu_overrides_validate to:
--   - reject custom_menu_level outside 1..4
--   - reject custom_module_key change when source.is_cross_app_movable = false
--   - reject parent whose resolved level >= dragged item resolved level when
--     the drop is "make child" (parent must be one level shallower)
--   - keep existing cycle + is_movable + is_system_required + accepts_children checks
```

Seed L4 rows for Organization (Divisions, Departments, Locations, PMS Grades, …), Workflow Config sub-tabs, and any other existing L4 strip — all with `is_movable=true`, `is_cross_app_movable=false`, `is_system_required=false` unless the consumer truly requires the item.

### 3.2 Resolver layer

- Extend `ResolvedMenuNode` with effective `menu_level` and `module_key` (override → default).
- `applyOverrides` already cycle-checks parent; add level + module resolution.
- `validateMove` gains:
  - `targetLevel` (drop intent: `before|after|inside`),
  - cross-module guard,
  - level-derivation rule (`inside` ⇒ child level = parent.level + 1, clamped 2..4),
  - "parent must accept children" + L1 (modules) only acceptable when source is `is_cross_app_movable`.
- Pure functions, fully unit-tested.

### 3.3 UI — DnD Tree

Replace ▲/▼ block in `MenuSettingTab.tsx` with a `@dnd-kit/core` + `@dnd-kit/sortable` tree (already used elsewhere in the project for slab DnD).

```text
┌─ Menu Setting ────────────────────────────────────────────┐
│ [ Master switch: Enabled ]   [ Reset all ]  [ Preview ]   │
│                                                           │
│ Search: [______________]   Filter: [All modules ▼]        │
│                                                           │
│ ▼ PMS                                  (module, L1)       │
│   ▼ Main                               (group, L2)        │
│     ⋮⋮ My Dashboard           [Locked]   ✎                 │
│     ⋮⋮ Inbox                            ✎                 │
│   ▼ Administration                                        │
│     ▼ ⋮⋮ System Settings                ✎                 │
│       ▼ ⋮⋮ Organization                 ✎                 │
│         ⋮⋮ Divisions          [Movable] ✎                 │
│         ⋮⋮ Departments        [Movable] ✎  ← dragging     │
│         ⋮⋮ Locations          [Movable] ✎                 │
│       ⋮⋮ Menu Setting         [Locked]  ✎                 │
│ ▼ HRMS                                  (module, L1)      │
│   ▶ Payroll                             ← drop zone hover │
│ ▼ Safety                                                  │
│                                                           │
│ Pending changes (3): Departments → HRMS/Payroll  ⟲        │
│ [Cancel]                          [Preview & Save changes]│
└───────────────────────────────────────────────────────────┘
```

Interactions:
- **Drag handle** (`⋮⋮`) on every row.
- **Drop indicators**: thin line between rows = reorder; highlighted row body = make child; module header highlight = cross-module move.
- **Live validation**: invalid drop targets dim and show tooltip `"Cannot drop here — <reason>"` from `validateMove`.
- **Movability badge** per row: `Locked`, `Within module`, `Display only`, `Fully movable`.
- **Pending changes panel**: list of staged moves with per-item ⟲ (revert) before save.
- **Preview dialog**: side-by-side "Current structure" vs "New structure" trees + a diff list (`Item · old level → new level · old parent → new parent · old module → new module · old order → new order`).
- **Save**: bulk upsert into `menu_overrides`; trigger validates each row server-side; audit rows written automatically by existing trigger.
- **Reset**: per item (right-click / row menu) + global "Reset all" (existing).
- **Search** filters tree but keeps ancestors expanded.
- No ▲/▼ buttons anywhere.

### 3.4 Consumers wired to resolver

Phase 2 already wired `AppSidebar` and `SystemSettings`. Phase 3 adds:
- `Organization` page sub-tab strip → renders by `useResolvedMenu().byParent['admin-settings-organization']`.
- `Workflow Config` sub-tab strip → same pattern.
- `ModuleHub` (L1) → reads module order from resolver (modules are L1 registry rows).

Each consumer falls back to its hardcoded order when the flag is off or the key is unknown — zero behavior change for non-admin tenants.

## 4. Step-by-Step Plan

1. **Migration**: add `custom_menu_level`, `custom_module_key`; extend `menu_overrides_validate` trigger; seed L4 + L1-module registry rows. *Verify*: trigger unit tests via `supabase--read_query`.
2. **Types & resolver**: extend `MenuOverrideRow`, `ResolvedMenuNode`, `applyOverrides`, `validateMove`. *Verify*: extend `applyOverrides.test.ts` + `validateMove.test.ts` (cycle, cross-module, level derivation, locked items, license-respecting moves).
3. **DnD tree component** (`MenuTreeDnd.tsx`): `@dnd-kit` sortable tree with drop indicators, badges, search, pending-changes panel. *Verify*: component test for drag → validate → stage flow.
4. **Preview dialog** (`MenuChangesPreviewDialog.tsx`): old vs new tree + diff list. *Verify*: snapshot test on a fixed mock diff.
5. **Bulk save** path in `MenuSettingTab.tsx`: upsert pending overrides, invalidate `resolved-menu` cache. *Verify*: integration test with mocked supabase client.
6. **Wire L4 consumers** (Organization, Workflow Config, ModuleHub). *Verify*: render test asserts order follows resolver when flag on, hardcoded when off.
7. **Docs**: update `DOCUMENTATION.md` (Menu Setting section), `POLICY.md` (movability classification + access invariance rule), `mem://features/admin/menu-setting`.

## 5. UI Changes Summary

- **Location**: System Settings → Menu Setting tab.
- **Visual change**: ▲/▼ list replaced by DnD tree with drag handles, drop indicators, movability badges, search, pending-changes drawer, and Preview & Save flow. Reset-all button retained; per-item reset added.
- **Interaction**: drag rows to reorder, nest under a new parent, or drop onto a module header to move across modules. Invalid targets dim with a tooltip reason. Nothing persists until Preview & Save.
- **Responsiveness**: tree uses horizontal scroll on <md viewports; drag handle stays sticky-left so the gesture works on the 1107px preview and on tablet.
- **Downstream visible change** (only when flag on): Sidebar groups, System Settings tabs, Organization sub-tabs, Workflow Config sub-tabs, and Module Hub order all reflect the saved tree.

## 6. Tests

- `applyOverrides.test.ts`: level/module override resolution, parent-chain cycle across modules, fallback when override row is inactive.
- `validateMove.test.ts`: drop-inside derives level, cross-module blocked unless flag, system-required rejected, license/feature_key preserved, level clamped to 1..4.
- `MenuTreeDnd.test.tsx`: drag-stage-revert flow; invalid drop disabled.
- `MenuChangesPreviewDialog.test.tsx`: diff list matches staged moves.
- DB trigger test (`supabase--read_query`): insert override violating cross-module rule → expects raise.

## 7. Out of Scope (deferred)

- Multi-tenant `client_id` scoping of overrides (column already exists, UI stays single-tenant).
- L1 module rename (module names are brand-controlled).
- Report Field Sequence builder (separate Phase 4 plan).
- Importing/exporting menu layouts.

## 8. Rollback

- Toggle `menu_overrides_enabled` off → every consumer reverts to hardcoded defaults instantly.
- `Reset all` clears `menu_overrides` rows (audit retained).
- Migration is additive — no destructive schema change to revert.
