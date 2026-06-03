
## Observe-only contract (unchanged from pilot)

`CanAction` already guarantees:
- Renders children unconditionally (never blocks).
- Logs `would_deny` exactly once per mount via `loggedRef` (no re-render spam).
- Skips logging entirely when `hubEnabled === false`.

Each wrap is a pure tree wrap around one `<Button>` — no prop, handler, disabled, styling, or tooltip changes.

## Menu actions clarification

Verified: `pms.menu.create_tab` and `pms.menu.delete_custom_tab` are the **PMS admin Menu Setting** custom tabs (`src/components/admin/MenuSettingTab.tsx` + `CreateMenuItemDialog.tsx`). The Incentive `CustomTabManager.tsx` is a different surface and is **not** wrapped.

## The 10 wraps

| # | action_key | File | Exact trigger button | Type |
|---|---|---|---|---|
| 1 | `pms.users.add` | `src/pages/admin/UserManagement.tsx` L2308 | "Create User" button (footer of Add-User dialog, `onClick={handleCreateUser}`) | Add |
| 2 | `pms.users.edit` | `src/pages/admin/UserManagement.tsx` L316 | "Save Changes" button in Edit-User dialog (`onClick={handleSaveUser}`) | Edit |
| 3 | `pms.users.manage_access` | `src/components/admin/UserAccessSheet.tsx` L234 | "Grant" button in Roles tab (`onClick={handleGrantAll}`) | Config |
| 4 | `pms.users.password_rollout` | `src/components/admin/UserAccessSheet.tsx` L377 | "Generate & email password" primary button (`onClick={() => run(true)}`) | Config |
| 5 | `pms.users.working_days` | `src/components/admin/EmployeeWorkingDaysDialog.tsx` L226 | "Save Changes" button (`onClick={handleSave}`) | Edit |
| 6 | `pms.kra.assign` | `src/components/admin/SmartAssignmentDialog.tsx` L650 | "Assign N KPIs" footer button (`onClick={handleAssign}`) | Add |
| 7 | `pms.workflow.template.edit` | `src/components/admin/TemplateFormDialog.tsx` L973 | "Update Template Only / Save & Propagate / Create Template" footer button (`onClick={handleSubmitClick}`) | Edit |
| 8 | `pms.menu.create_tab` | `src/components/admin/MenuSettingTab.tsx` L347 | "Create tab" toolbar button (`onClick={() => setCreateOpen(true)}`) | Add |
| 9 | `pms.menu.delete_custom_tab` | `src/components/admin/MenuSettingTab.tsx` (~L605 `ConfirmDestructiveDialog`'s onConfirm) | **See note below** | Delete |
| 10 | `pms.data.import` | `src/pages/admin/ImportData.tsx` L2767 + L2301 | "Import" button on KPI tab (`onClick={handleImport}`) and "Import" button on Employees tab (`onClick={handleEmployeeImport}`) — both wrapped | Import |

### Note on #9 (delete custom tab)

The actual delete-trigger button is the per-row delete icon inside `MenuTable`/`MenuTreeDnd` that calls `onDeleteCustom(menuKey)`. That callback only opens a `ConfirmDestructiveDialog`; the real DB write happens in the dialog's `onConfirm` (~L607). To stay surgical and avoid touching child components or the destructive dialog wiring, I'll wrap the **`ConfirmDestructiveDialog` itself** in `MenuSettingTab.tsx` with `<CanAction actionKey="pms.menu.delete_custom_tab">`. The dialog mounts only when a delete is initiated, so `loggedRef` fires at most once per delete attempt — matching the observe-only intent without altering the row-level buttons or child components.

### Note on #10 (data import)

Two separate trigger buttons exist (Employees tab + KPIs tab), both gated by the same `pms.data.import` key. Each gets its own wrap so a `would_deny` fires once per mounted tab.

## Out of scope (explicitly NOT wrapped)
- Row-level icon buttons (Edit, Assign, Working Days, Password Rollout pencil icons) — these only open dialogs (read-only navigation). Save buttons inside the dialog are the actual write triggers.
- "Add User" toolbar button (only opens dialog) — wrapped at "Create User" save instead.
- Bulk actions, dialogs, forms, tables, pages, menu nav, read-only buttons.
- Revoke per-role button in UserAccessSheet (different action; not in 10-list).
- Secondary "Generate without email" button (different sub-flow; primary CTA covers the action).
- Incentive custom tab manager (`src/components/incentive/CustomTabManager.tsx`).
- No CanAction.tsx changes, no useEntitlement changes, no RLS/policy/migration, no PMS workflow/scoring/menu/reports changes.

## Implementation
Add one `import { CanAction } from '@/components/platform/CanAction';` per file (if not already imported) and wrap each listed `<Button>` JSX node:

```tsx
<CanAction actionKey="pms.<key>">
  <Button ...>...</Button>
</CanAction>
```

No other lines change.

## Verification (post-implementation, per user contract)

Pick 3 newly-wrapped actions (e.g. `pms.kra.assign`, `pms.users.password_rollout`, `pms.menu.create_tab`) and verify in `entitlement_audit`:

1. Master switch OFF → trigger each action → **0 audit rows**, action works.
2. Master switch ON + entitlement ON → trigger → **0 `would_deny` rows**, action works.
3. Master switch ON + entitlement OFF → mount each surface once → **exactly 1 `would_deny` row** per mounted surface, action still works.
4. Re-render the surface without unmount → **no additional rows** (confirms `loggedRef` once-per-mount).
5. No regression in PMS workflow/scoring/menu/reports/RLS.

After verification I'll post the audit query results for the 3 sampled actions and the final wrapped-list summary.

## Rollback
Revert the file edits (pure JSX wrapper additions — no schema or behavior change). Or flip `hub_platform_settings_enabled = "false"` to silence all logging instantly.

## Risk
- **Data:** none (additive audit-row inserts only when flag ON + entitlement OFF).
- **Workflow/Scoring/RLS/Menus/Reports:** none (CanAction is observe-only, children always rendered).
- **Performance:** one extra `useQuery` already shared via TanStack cache key `hub-entitlement-snapshot`; one insert per mount when denied. Negligible.
- **Regression:** wraps are pure tree additions; no handlers/props changed.

## Not Applicable
DOCUMENTATION.md / POLICY.md: existing Hub Foundation docs already cover the observe-only contract; this is the same contract applied to 10 more keys. Memory file `mem/features/platform/hub-foundation.md` already lists these action keys as seeded — no new behavior to document.
