## Goal
Bring PMS Menu Setting up to Beehive-style flexibility: surface Level 4 children, give explicit level/parent controls, add a Beehive-style flat table, and a deterministic "Move to level / parent" dialog. Reuse the existing override pipeline (`menu_overrides` columns: `custom_parent_key`, `custom_menu_level`, `custom_sort_order`, `custom_module_key`) and existing safeguards (`validateMove`, DB trigger `menu_overrides_validate`, `CreateShortcutDialog`, `deleteCustomMenuItem`). No DB schema change. No route/permission/workflow/KPI/scoring/auth/business-data change.

## What is already in place (do not rebuild)
- Override save pipeline, audit logging, reset-all, master switch — `MenuSettingTab.tsx`.
- Shortcut creation for locked/system rows — `CreateShortcutDialog`, wired via `onCreateShortcut`.
- Custom delete with children-block + multi-table cleanup — `deleteCustomMenuItem`, wired via `onDeleteCustom`.
- Cross-level validation (depth ≤ 4, cycles, cross-app, accepts_children, system-required) — `validateMove.ts` + DB trigger.
- Bulk "Move under…" dialog — `MoveUnderDialog.tsx`.
- DnD tree with multi-select — `MenuTreeDnd.tsx`.

## What changes (UI only)

### 1. Level-visibility & expansion controls (`MenuSettingTab.tsx` + `MenuTreeDnd.tsx`)
Add a single toolbar row above the tree:
- Buttons: **Expand all**, **Collapse all**.
- Toggle group (multi-select chips): **L2**, **L3**, **L4**, default all on. Filters which nodes render; ancestors of a visible node always render so the chain is intact.
- A **View** segmented control: **Tree** | **Table** (Beehive-style flat list).

`MenuTreeDnd` props extended with `expandAll?: boolean`, `collapseAll?: boolean`, `visibleLevels: Set<2|3|4>`. Existing local `expanded` state seeded from those signals (effect re-runs on toggle). No change to drag/drop or validation.

Auto-expand chain when the page mounts inside Menu Setting: on first render, expand ancestors of `admin-settings-menu-setting` (walk `parent_key` upward via `effectiveByKey`). One-shot, doesn't fight user collapse afterwards.

### 2. Beehive-style flat table view (new `MenuTable.tsx`)
Compact table with columns: **Select · Menu Name · Menu_Key · Route · Level · Parent · Icon · Order · Status · Actions**.
- Pagination: page size 25, client-side (registry is small, ≤ a few hundred). Sort by Level then Order by default; column header click toggles sort.
- Search reuses the existing `search` input (filter by name/key/route).
- Status badge: `Protected` for `is_system_required || !is_movable`, `Custom` for `is_custom`, `Active` otherwise; greyed when `is_active === false`.
- Actions per row (reuse existing handlers): **Move**, **Rename** (inline), **Shortcut** (locked/system only), **Reset** (if dirty), **Delete** (custom only, hidden when row has children — same gate as DnD).
- No drag-drop in table view (table is for clarity & explicit moves). DnD remains in Tree view.

### 3. Explicit "Move to level / parent" dialog (new `MoveToDialog.tsx`)
Triggered from a row's **Move** action (both tree and table) and from the existing bulk action button next to "Move under…" (renamed to **Move…** with a small dropdown: "Move under parent…" / "Move to level…"). Fields:
- Selected item(s) chip list (read-only).
- **Target level**: L2 / L3 / L4 radio (disabled levels are those that would exceed depth or violate `validateMove` for any selected source).
- **Target parent**: combobox filtered to nodes whose effective `menu_level === target-1` AND `accepts_children` AND pass `validateMove` for every selected source. Search included.
- **Order**: numeric input, default = max(sibling sort_order)+10.
- **Preview** block: `Current: <ancestor chain>` → `New: <ancestor chain>` using `effectiveByKey`.
- Footer: **Cancel** / **Apply**. On Apply, stage `PendingMove` for each selected key (same shape used today); admin still has to click **Save** to commit (preserves the "dirty banner" UX and audit pipeline).

Locked / system-required sources are listed in a yellow callout exactly like `MoveUnderDialog` does today and are routed to **Create shortcut** instead of being moved.

### 4. Status terminology
Replace `Locked` badge text with `Protected` everywhere it currently appears (`MenuTreeDnd.tsx` row badge + `MoveUnderDialog.tsx` callout). Tooltip clarifies: "System-required or non-movable. Use Create shortcut to expose under another parent."

### 5. Sidebar parity (no logic change, verify only)
Confirm `AppSidebar` already uses `useResolvedMenu()` recursively. Add a small test in `applyOverrides.test.ts` asserting that a saved `custom_menu_level` change moves a node between L3↔L4 in the resolved tree — guards future regressions.

## Out of scope (explicit)
- DB schema changes, new RPCs, new tables.
- Beehive-style separate L1/L2/L3 screens — we keep one unified screen with level filters instead (matches our richer tree model).
- Editing `menu_key`, `route_path`, `permission_key`, `report_key`, role access, icon set, colour token list (those exist already on Create dialog; not expanded here).
- Cross-app movable allowlist UI (still requires direct registry edit, as documented in `mem://features/admin/menu-setting`).
- Server-side pagination (registry is bounded; client-side is acceptable).

## Risk & impact
- **Data**: none — no schema/data writes added beyond the existing `menu_overrides` + `menu_override_audit` pipeline.
- **Workflow / KPI / scoring / auth**: none.
- **UI**: new toolbar row above tree; new Table view behind a toggle; new dialog. Defaults render the existing tree, so users opening the page see the same layout plus the new controls.
- **Regression**: low — all new code is additive; existing handlers (`applyMove`, `setLabelDraft`, `deleteCustomMenuItem`, `CreateShortcutDialog`) are reused unchanged.
- **Rollback**: revert four files (`MenuSettingTab.tsx`, `MenuTreeDnd.tsx`, new `MenuTable.tsx`, new `MoveToDialog.tsx`).

## Test plan
- Unit: `validateMove` already covered; add a case for `custom_menu_level` round-trip in `applyOverrides.test.ts`.
- Manual:
  1. Toggle L2/L3/L4 filters — only matching depths render, ancestors stay visible.
  2. Expand all / Collapse all toggles every node.
  3. Switch to Table view → search, sort, paginate, Move, Rename, Delete.
  4. Move dialog: move a movable L4 item to L2 under a different parent → Save → verify sidebar after reload.
  5. Try to move a Protected item → blocked with shortcut suggestion.
  6. Create shortcut for "System Settings > Menu Setting" under "Main > Dashboards" → both appear, original unchanged.
  7. Delete a custom tab with no children → succeeds; with children → blocked.

## Files
- Edit: `src/components/admin/MenuSettingTab.tsx`, `src/components/admin/MenuTreeDnd.tsx`, `src/components/admin/MoveUnderDialog.tsx` (label tweak only).
- Add: `src/components/admin/MenuTable.tsx`, `src/components/admin/MoveToDialog.tsx`.
- Extend test: `src/lib/menu/applyOverrides.test.ts`.

## Docs
Append one line each to `DOCUMENTATION.md` (Menu Setting section) and `POLICY.md` (`§menu-governance`): "Protected items can be reordered among siblings only; cross-parent or cross-level moves require Create shortcut. Level-filter + Move dialog are presentational and write only `custom_parent_key`, `custom_menu_level`, `custom_sort_order`, `custom_module_key`."
