# Universal Menu Nesting & Repositioning

Goal: turn Menu Setting + sidebar into a **single resolved recursive tree** so any movable item can be re-parented across levels (L2↔L3↔L4) and the live sidebar matches the saved tree exactly.

## Risk & Impact

- **Data**: no schema change required — `menu_overrides` already has `custom_parent_key`, `custom_menu_level`, `custom_module_key`, `custom_sort_order`. Catalog flags (`accepts_children`) change for many L2 leaves → purely additive.
- **Workflow**: route, permission_key, report_key, RLS, role gates **unchanged**. Only visual placement.
- **UI/UX**: sidebar groups now render recursively; nested children get L3/L4 indent. Active-route expansion walks resolved parent chain.
- **Regression risk (medium)**: pinned duplicates (`admin-incentive-data`, `admin-org-kpi-data`, `admin-org-kpi-audit`) must keep working; role filtering must still apply per resolved node; flag-off path must stay byte-identical.
- **Mitigation**: feature stays gated by `menu_overrides_enabled`; hardcoded fallback unchanged when flag off; pinning rule preserved; unit tests for validator + resolver tree; manual QA via the 6 test cases in the brief.
- **Scalability**: tree size ~150 nodes, cached 5 min — negligible.

## Plan (step → verification)

### 1. Catalog: open up `accepts_children`
File: `src/lib/menu/catalog.ts`
- Default `accepts_children = true` for every **L2 non-system** item (dashboards, reports, admin tiles, settings tabs).
- Keep `false` only for: pure action buttons (logout-like), and any item explicitly flagged `is_system_required`.
- Keep `is_movable=false` + `is_system_required=true` on: module roots, `group-*` parents, Dashboard, Inbox, System Settings, Menu Setting.
- ✅ Verify: visual inspection + a unit test asserting `>=80%` of L2 items now accept children.

### 2. Validator: flexible nesting
File: `src/lib/menu/validateMove.ts`
- Allow target parent of **any** level (L1 group, L2 item, L3 item) as long as `accepts_children=true`.
- Compute new `menu_level = parent.menu_level + 1`; reject if `> 4`.
- Keep: not-movable, system-required, cross-app block, cycle detection, unknown-parent.
- Mirror exact rules in DB trigger `menu_overrides_validate` (new migration).
- ✅ Verify: new unit tests for L2→L3, L3→L2, L4→L2, cycle, depth>4, leaf-as-parent, system-locked.

### 3. DB trigger parity
New migration updating `menu_overrides_validate` to match step 2 (depth check via recursive resolved chain, leaf-parent rejection via registry lookup).
- ✅ Verify: SQL test inserts in migration comment; client validateMove + trigger return same verdicts on the 6 brief examples.

### 4. Resolver: build recursive tree
File: `src/lib/menu/applyOverrides.ts` (+ `useResolvedMenu`)
- Already returns `byParent`. Add `buildTree(rootKey)` helper returning `{ node, children[] }` recursively, ordered by `sort_order`.
- ✅ Verify: unit test on a fixture proves moving `reports-performance` under `admin-dashboard` produces nested child.

### 5. Sidebar: render recursive tree
File: `src/components/layout/AppSidebar.tsx` + `CollapsibleSidebarGroup.tsx`
- Replace `resolveGroupItems` with `resolveGroupTree(groupKey)` returning the full subtree for each `group-*` parent.
- Render L2 = `SidebarMenuButton`, L3/L4 = nested `SidebarMenuSub` / indented buttons.
- Active-route detection: walk resolved `parent_key` chain from active `menu_key` up to the `group-*` root → that group expands.
- Preserve **pinning rule** for the 3 duplicate keys (still rendered in their native group regardless of resolved parent).
- Role filter applied per node before render.
- Flag off → unchanged hardcoded path.
- ✅ Verify: manual QA on the 6 test cases (move Performance Report to Main, under Admin Dashboard, back, cycle blocked, locked blocked, role-gated still hidden).

### 6. Menu Setting DnD parity
File: `src/components/admin/MenuTreeDnd.tsx`
- Allow drop-as-child on **any** row whose registry node has `accepts_children=true` (currently only L1/L2 containers).
- Badges per row: `Locked` (system_required), `Can contain items` (accepts_children), `Leaf item` (else).
- Warning toast when moving a report-* key under an admin-* parent: "Route & access unchanged, only placement moves."
- ✅ Verify: drag Performance Report → Admin Dashboard succeeds; cycle blocked; depth-cap blocked.

### 7. Tests
- `validateMove.test.ts` — 8 cases listed in step 2.
- `applyOverrides.tree.test.ts` — recursive tree assembly + sort.
- `AppSidebar.resolved.test.tsx` (lightweight) — given a mock resolver, asserts Performance Report renders inside the chosen group.

### 8. Docs / memory
- Update `mem/features/admin/menu-setting` (depth=4 cap, leaf-vs-parent rule, badges).
- Update `mem/features/admin/menu-setting-sidebar-rendering` (recursive render, parent-chain active detection).
- Append `docs/adr/ADR-0xx.md` describing the move to a universal tree.

## UI Changes

- **Sidebar**: items can now appear nested 1–2 levels deep under another item (indent + smaller chevron). Group still collapsible.
- **Menu Setting**: every eligible row shows a drop-as-child zone + new badges. Warning toast on cross-domain placement.
- **No new pages, no new routes.**

## Out of scope

- Renaming `menu_key`s, changing routes/permissions, multi-tenant `client_id` UI, L1 module ordering, report registry refactor.

## Rollback

- Toggle `system_settings.menu_overrides_enabled = false` → sidebar instantly returns to hardcoded layout.
- Revert migration #3 if trigger rejects valid moves; client validator is a pure file revert.
