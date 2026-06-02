
## Goal

Allow admins to delete only custom-created menu items from System Settings > Menu Setting. Seeded/system items remain protected (existing DB trigger `menu_registry_protect_seeded_delete` already blocks them server-side).

## UI Changes

**Location:** `src/components/admin/MenuTreeDnd.tsx` → Actions column in `RowBody`.

**What changes visually:**
- A new Trash icon button appears in the Actions column, immediately after the existing Reset (RotateCcw) icon.
- Rendered ONLY when `reg.is_custom === true && !reg.is_system_required`.
- Tooltip: `Delete custom tab`.
- Icon uses `text-destructive` styling; hover background `hover:bg-destructive/10`.
- Disabled (with explanatory tooltip “Move or delete child items first”) when the item has any visible children in the effective tree.

**Confirmation dialog** (new component `ConfirmDeleteCustomMenuDialog` or inline using existing `ConfirmDestructiveDialog`):
- Title: `Delete custom tab?`
- Body:
  > This will remove the custom menu tab from Menu Setting and the sidebar. Existing PMS pages, routes, reports, permissions, workflows, KPI data, and scoring data will not be deleted.
  >
  > **Name:** {label}
  > **Key:** `{menu_key}` (monospace)
- Cancel button: `Cancel`
- Confirm button: `Delete tab` (destructive variant — reuses `ConfirmDestructiveDialog`).
- Delete only fires on confirm; cancel leaves tab unchanged.

**No other layout changes.** Reset icon, Shortcut icon, grid columns, drag/drop, expand/collapse, multi-select all unchanged.

## Plan

1. **Service function** — `src/lib/menu/customMenu.ts`
   - Add `deleteCustomMenuItem(menuKey, registryRow, performedBy)`:
     - Guard: throw if `!registryRow.is_custom` or `registryRow.is_system_required`.
     - Sequence (best-effort cleanup, registry last so trigger validates):
       1. `delete from menu_access_user_overrides where menu_key = ...`
       2. `delete from menu_access_config where menu_key = ...`
       3. `delete from menu_overrides where menu_key = ...`
       4. `delete from menu_registry where menu_key = ...` (DB trigger enforces is_custom)
       5. `insert into menu_override_audit { menu_key, field: 'delete_custom_menu_item', old_value: JSON.stringify(registryRow), new_value: null, changed_by: performedBy }`
   - Returns void; throws on any error.

2. **Wire through MenuTreeDnd**
   - Add optional prop `onDeleteCustom?: (menuKey: string) => void` on `Props`, `ModuleSection`, `TreeRow`, `RowBody`.
   - In `RowBody` Actions cell, render Trash button when `reg?.is_custom && !reg?.is_system_required`; disabled when `childrenByParent.get(node.menu_key)?.length`.

3. **MenuSettingTab orchestration** — `src/components/admin/MenuSettingTab.tsx`
   - New state: `const [deleteTarget, setDeleteTarget] = useState<{menuKey:string; label:string} | null>(null)` and `const [deleting, setDeleting] = useState(false)`.
   - Pass `onDeleteCustom={(k) => setDeleteTarget({menuKey:k, label: effectiveByKey[k]?.label ?? k})}` to `<MenuTreeDnd>`.
   - Render `<ConfirmDestructiveDialog>` with the title/body/labels above. On confirm:
     - Call `deleteCustomMenuItem(menuKey, registryByKey[menuKey], profile?.id ?? null)`.
     - Toast success/failure.
     - Invalidate queries: `menu-registry-admin`, `menu-overrides-admin`, `resolved-menu`, `menu-access-config`, `menu-access-user-overrides`.
     - Clear any pending move/label drafts for that key (defensive).
     - Close dialog.

4. **Verification**
   - Type-check passes.
   - Manual: create custom tab → delete icon appears → click → dialog → confirm → row disappears, sidebar refreshes, audit row inserted.
   - Manual: try delete on `admin-menu-setting` → no icon. Try on custom container with a child → icon disabled with tooltip.
   - Refresh page → deleted custom tab does not return.

## Risk & Impact

- **Data:** Only deletes rows for the specific `menu_key`. Routes, KPI, scoring, workflow, permissions tables untouched. Cleanup of `menu_access_*` rows is intentional and only affects the deleted custom key.
- **Workflow/UX:** Sidebar/Menu Setting recompute via existing cache invalidation. No effect on seeded items.
- **Regression:** Guarded by `is_custom && !is_system_required` in UI AND DB trigger `menu_registry_protect_seeded_delete`. Children block prevents orphaned descendants.
- **Rollback:** Audit row contains the full registry JSON, enabling manual re-insert if needed. Plain DELETEs, no schema change.
- **Scalability:** Single-row deletes per menu_key; constant time.

## Out of Scope

- No DB migration (existing tables, RLS, and protect-seeded trigger already cover this).
- No bulk delete.
- No “undo” UI; recovery is via audit JSON.
- No changes to routes, permissions, workflow, KPI logic, scoring, or seeded item behavior.
