# Custom Menu Tab Creation — Implementation Plan

## Goal
Allow admins to create new custom menu items (L2/L3/L4) from System Settings → Menu Setting, place them under any valid parent, pick icon + color + destination, and have them render in the live sidebar after save/refresh. Existing seeded items, permissions, and overrides must remain unaffected.

## Risk & Impact Report
- **Data Impact:** Additive only — new `menu_registry` rows flagged `is_custom=true` plus 2 optional columns (`color`, `is_custom`). No change to existing rows. Backed up automatically via `get_backup_table_order()` (already includes `menu_registry`).
- **Workflow Impact:** None. KPI / review / scoring / auth logic untouched.
- **UI/UX Impact:** New "Create Tab" button + dialog in MenuSettingTab toolbar. Sidebar renders new items per resolved tree (already wired). Custom-page route added at `/custom-menu/:menuKey`.
- **Regression Risk:** Low. Sidebar already resolves via `resolveGroupItems`; we only add new sources. DB trigger `menu_overrides_validate` unchanged. New trigger `menu_registry_custom_validate` only fires on `is_custom=true` inserts.
- **Mitigation:** Feature gated by existing `menu_overrides_enabled` flag. Custom rows can be soft-deleted (`is_active=false`). All inserts go through admin RLS.
- **Scalability:** Custom items expected in tens, not thousands. No pagination needed. Resolver already O(n).

## Architecture

### 1. DB migration — additive
Extend `public.menu_registry`:
- `is_custom boolean NOT NULL DEFAULT false`
- `color text NULL` (hex or token name)
- `created_by uuid NULL`, `created_at timestamptz DEFAULT now()`, `updated_at timestamptz DEFAULT now()`

New trigger `menu_registry_custom_validate` (BEFORE INSERT/UPDATE on `menu_registry`):
- If `is_custom=true`:
  - `menu_key` must match `^custom-[a-z0-9-]+(-\d+)?$`
  - `menu_level` ∈ {2,3,4}
  - `default_parent_key` must exist, `accepts_children=true`, and parent.menu_level = menu_level - 1
  - cycle check, depth ≤ 4
  - `is_renamable=true`, `is_movable=true`, `is_system_required=false`
- If `is_custom=false`: no-op (protects seeded rows from accidental edit).

Also: BEFORE DELETE trigger blocks deleting non-custom rows.

RLS: SELECT=authenticated (already), INSERT/UPDATE/DELETE limited to `has_role(auth.uid(),'admin')` (already on registry — verify).

Menu access default: insert `menu_access_config` row for new key with admin-only visibility via post-insert trigger or service-layer step.

### 2. Catalog & types
- `src/lib/menu/types.ts`: add `is_custom?: boolean`, `color?: string | null` to `MenuRegistryRow` and `ResolvedMenuNode`.
- `applyOverrides.ts`: pass `color` and `is_custom` through resolver.

### 3. Service layer — `src/lib/menu/customMenu.ts` (new)
Pure functions:
- `slugify(name)` → lowercase, hyphens.
- `generateMenuKey(name, existingKeys)` → `custom-<slug>`, suffix `-2`, `-3` on collision.
- `validateCreate({name, level, parentKey, destinationType, routePath, registryByKey, resolvedByKey})` → returns `{ok:true}` or `{ok:false, reason}` mirroring DB trigger + route format check.
- `createCustomMenuItem(payload)` → upserts `menu_registry` row + default `menu_access_config` row (admin-only) in a single supabase call sequence; invalidates `menu-registry-admin`, `resolved-menu` queries.

### 4. UI — `src/components/admin/CreateMenuItemDialog.tsx` (new)
Compact admin dialog with:
- Name (text)
- Level radio (2/3/4)
- Parent combobox (filtered: `accepts_children=true` AND `menu_level = selectedLevel - 1`; module-scoped per parent)
- Destination select: Container / Existing Route / Custom Page / External Link
  - Existing Route → searchable picker over a static `KNOWN_ROUTES` list (export from `src/lib/menu/knownRoutes.ts` — extracted from `src/App.tsx`)
  - Custom Page → auto sets `route_path=/custom-menu/<menuKey>`
  - External Link → URL input, validated `https://` only; renders as `<a target="_blank" rel="noopener noreferrer">`
- Icon picker: curated Lucide list (~40 icons) in a grid popover
- Color: 8 PMS tokens (primary/secondary/accent/muted/destructive/success/warning/info) + optional hex input
- Live preview line: `Main > Admin Dashboard > New Tab`
- Submit → calls `createCustomMenuItem`; toast on success/error.

### 5. MenuSettingTab — wire the button
Add "Create Tab" button in toolbar next to existing Save/Reset. Open dialog. After create → refetch.

### 6. Sidebar rendering
Already group-aware via prior refactor. Additions:
- `CollapsibleSidebarGroup.tsx`: support dynamic icon lookup (`icons[icon_name]` from `lucide-react`) and apply `color` (text-only tint) when present.
- `AppSidebar.tsx`: resolver tree already drives children; ensure custom items participate (they will, via registry → resolver).

### 7. Custom-page route
- `src/pages/CustomMenuPage.tsx`: reads `:menuKey`, looks up node from `useResolvedMenu`, renders `<PageHeader title={label}/>` and a placeholder card "This page is reserved for custom content."
- Register `/custom-menu/:menuKey` in `src/App.tsx` inside the authenticated layout.

### 8. External link rendering
`CollapsibleSidebarGroup.tsx`: if node has `route_path` starting with `http(s)://`, render as anchor with `target="_blank" rel="noopener noreferrer"`.

### 9. Permissions
New custom item gets a row in `menu_access_config` with `allowed_roles=['admin']`. Existing `useMenuAccess` already filters sidebar items by role → no sidebar changes needed.

### 10. Tests (Vitest)
`src/lib/menu/customMenu.test.ts`:
- generateMenuKey: unique + collision suffix
- validateCreate: L2/L3/L4 happy paths, depth>4 rejected, missing parent rejected, non-acceptsChildren parent rejected, level mismatch rejected, system key collision rejected, invalid URL rejected
- slugify edge cases

`src/lib/menu/applyOverrides.tree.test.ts` (extend): custom rows appear under resolved parent with `is_custom=true`.

UI smoke test deferred (existing project pattern — unit tests on pure logic only).

## Files to add/edit
**New:**
- `supabase/migrations/<ts>_menu_registry_custom_support.sql`
- `src/lib/menu/customMenu.ts`
- `src/lib/menu/knownRoutes.ts`
- `src/lib/menu/customMenu.test.ts`
- `src/components/admin/CreateMenuItemDialog.tsx`
- `src/pages/CustomMenuPage.tsx`

**Edit:**
- `src/lib/menu/types.ts` (add `is_custom`, `color`)
- `src/lib/menu/applyOverrides.ts` (pass-through new fields)
- `src/components/admin/MenuSettingTab.tsx` (toolbar button)
- `src/components/layout/CollapsibleSidebarGroup.tsx` (dynamic icon + color + external link)
- `src/App.tsx` (route)
- `mem/features/admin/menu-setting` (doc)
- `docs/adr/ADR-072.md` (decision record)
- `.lovable/plan.md` (sync)

## Rollback
- Migration is purely additive (new columns default to `false`/`null`). Drop columns + trigger to revert.
- Toggle `menu_overrides_enabled=false` to revert sidebar to hardcoded defaults; custom rows become invisible but data preserved.

## Verification steps
1. Run migration → verify columns + triggers via `\d menu_registry`.
2. Open Menu Setting → click "Create Tab" → create L2 "Test Hub" under Main as Container.
3. Confirm sidebar shows "Test Hub" after auto-refetch (no page reload needed).
4. Create L3 under "Test Hub" → confirm nests with indentation.
5. Create L4 with Custom Page → click → `/custom-menu/...` renders with header.
6. Try L4 under L2 → blocked with toast.
7. Refresh page + re-login → items persist.
8. Run `vitest src/lib/menu/customMenu.test.ts` → all pass.

## Out of scope
- Editing custom item route/destination post-create (only label/parent/order via existing DnD).
- Multi-tenant `client_id`-scoped custom items.
- Drag-to-create — only dialog-based creation in this phase.
- Icon upload / non-Lucide icons.
