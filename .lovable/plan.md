# Fix: "Create tab" button is permanently disabled

## Assumptions
- The actual sidebar hierarchy is expressed by `parent_key` chains, not by the numeric `menu_level` column. The seed data confirms this: sections (`group-*`) and items both live at `menu_level = 2`, and items are nested under groups via `default_parent_key`.
- "Level 2 / Level 3 / Level 4" in the UI should mean **visual depth in the sidebar tree** (group child / sub-tab / deep tab), not the literal `menu_level` integer.
- No existing seeded menu items should change. Only the validation rule for *new custom items* needs to match reality.

## Risk & Impact Report
- **Data**: Only changes to `menu_registry_custom_validate` trigger (additive — relaxes one condition). No data migration. No effect on seeded rows.
- **Workflow**: None. Permissions, RLS, routes untouched.
- **UI/UX**: Dialog labels reworded to match the real tree. Parent dropdown now actually populates. No other UI affected.
- **Regression**: Low. Existing `validateMove.ts` already uses depth-by-parent-chain (capped at 4) for moves; the create path is being aligned to the same model.
- **Scalability**: Unchanged — single registry insert.
- **Mitigation**: Unit tests for the new depth-based validator + a smoke insert through the trigger.

## Plan

### 1. Redefine "level" as tree depth (frontend)
In `src/components/admin/CreateMenuItemDialog.tsx`:
- Relabel the Level select to talk about **depth under a parent**:
  - Level 2 → "Section item (under a top-level group)"
  - Level 3 → "Sub-tab (under a section item)"
  - Level 4 → "Deep tab (under a sub-tab)"
- Parent dropdown filter becomes: `r.accepts_children === true` AND `treeDepth(r) === level - 1`, where `treeDepth(r)` is computed from `resolvedByKey` by walking `parent_key` upward (root = depth 1).
- Stored `menu_level` for the new row = chosen depth (2/3/4), keeping the existing column semantics for `is_custom` rows = depth.

### 2. Update `validateCreate` (src/lib/menu/customMenu.ts)
- Replace the `parent.menu_level + 1 === level` check with a parent-chain depth check:
  - Compute `parentDepth` by walking `resolvedByKey[parentKey]` up to a node with `parent_key == null`.
  - Require `parentDepth + 1 === level` and `level <= 4`.
- Keep all other guards (name length, key collision, route format, parent must `accepts_children`).

### 3. Update DB trigger `menu_registry_custom_validate`
New additive migration that replaces only the level check inside the trigger:
```text
- old: parent.menu_level + 1 = NEW.menu_level
+ new: depth(parent) + 1 = NEW.menu_level  (depth via recursive CTE on default_parent_key, cap 4)
```
All other clauses (key pattern, accepts_children, not system-required, level ∈ {2,3,4}) stay.

### 4. Tests
- Extend `src/lib/menu/customMenu.test.ts`:
  - L2 under `group-admin` (a real section) passes.
  - L3 under `admin-settings` (accepts_children, depth 2) passes.
  - L4 attempt under a depth-3 node passes; under depth-2 fails.
  - Picking a non-container parent fails.
  - Picking a parent whose depth ≠ level-1 fails.

### 5. Documentation & memory
- Update `mem/features/admin/menu-setting-custom-tabs`: replace `parent.menu_level + 1 = item.level` invariant with `depth(parent) + 1 = item.level` (chain-based).
- Append a note to `DOCUMENTATION.md` / Version History describing the level-model fix.

## UI Changes
- Dialog (`/admin/settings` → Menu Setting → "Create tab"):
  - Level select labels reworded (see step 1). Same 3 options.
  - Parent select now populates with real candidates (e.g. for Level 2 you'll see *Main, Administration, Reports, KRA Settings, HR PMS, Audit, Management, Manager, Data Entry, Incentive, System Settings, KRA Library*).
  - "Create tab" enables as soon as Name + Parent are set.
- No layout, color, or icon-picker changes.

## Rollback
- Frontend: revert the dialog + `validateCreate` (single commit).
- DB: trigger replacement is additive — re-run prior migration body to restore the old check. No data altered.

## Out of scope
- Allowing L1 (top-level group) creation by admins.
- Editing route/parent/destination of a custom item post-create.
- Any changes to seeded rows or existing override behaviour.
