# RCA: Menu access showing wrong items for 101715 (and auditors)

## What I found in the data

User **101715 – Jitendra Bharti** (role: `manager`) has been granted:
- **Access Profile "Payroll HASP"** with `can_view` on: `dashboard`, `inbox`, `team-reviews`, `admin-incentive` (Incentive Config), `admin-incentive-data` (Incentive Data Entry), `data-entry`, `reports-hub`, `reports-incentive` (Incentive Report).
- **User-level overrides** on: `admin-incentive`, `admin-incentive-data`, `reports-incentive`.

So on paper he should see Incentive Config + Incentive Report. But his sidebar shows neither, and shows "Org KPI Data Entry" under Data Entry (which the admin says was never granted).

## Root cause

In `system_settings`:

```
menu_overrides_enabled = false   ← CAPA kill switch is OFF
```

In `src/components/layout/AppSidebar.tsx` → `filterByRole` (lines 433–450), the kill switch takes a hard short-circuit:

```ts
if (overridesEnabled === false) {
  return Array.isArray(item.roles) && item.roles.includes(effectiveRole);
}
// ↑ user overrides AND access-profile rights are completely bypassed.
// DB-driven canAccess() is only consulted in the ON branch.
```

Once the flag is OFF, the sidebar is gated purely by the hardcoded `item.roles` arrays declared in `getStaticMenuItems`. That explains every symptom:

| Symptom | Cause |
|---|---|
| 101715 sees **Org KPI Data Entry** under Data Entry despite "no KPI entry rights" | line 121: `menuKey:'data-entry'`, `roles:['employee','manager','auditor','management','hr_pms']` → static role match wins; profile/overrides ignored. |
| **Auditors** see "KPI entry" with no grant | Same line 121 — `auditor` is in the hardcoded list, so every auditor sees it regardless of admin config. |
| 101715 does NOT see **Incentive Config** | line 107: `menuKey:'admin-incentive'`, `roles:['admin']` → manager fails static match; his override + profile right are ignored. |
| 101715 does NOT see **Incentive Report** | line 109: `menuKey:'reports-incentive'`, `roles:['admin','management','hr_pms']` → manager not listed; override + profile right ignored. |
| 101715 DOES see "Incentive Data Entry" under Data Entry | line 122 has the same key listed with `manager` in the static roles — coincidental visibility, not because of the grant. |

The "Menu Access Rights" admin UI therefore gives the false impression that grants are live, while the kill switch silently overrules them.

## Risk & Impact

- **Data Impact:** none. Read-only resolver fix.
- **Workflow Impact:** sidebar visibility will start honouring admin-configured rights immediately for grantees; some users currently seeing menus by accident (e.g. auditors with KPI Entry) will lose them.
- **UI/UX Impact:** sidebar items for affected users; no layout changes.
- **Regression Risk:** medium. The kill switch exists for a reason — historically the resolver tree could blank the sidebar. We keep that safety for the resolver/labels but stop using it to discard grant-based access.
- **Mitigation:** keep `overridesEnabled === false` as the gate ONLY for the resolver/parent-label logic (already does this in `resolveGroupItems`). Visibility uses a layered check that always allows the static role match as the floor + adds overrides/profile rights on top.
- **Scalability:** unchanged — `useMenuAccess` already caches configs/overrides/profile rights with React Query.

## Plan (surgical)

### Step 1 — Fix `filterByRole` in `src/components/layout/AppSidebar.tsx`

Replace the hard short-circuit with a layered check that works in both flag states:

```text
visible if (static item.roles includes effectiveRole)
        OR (item.menuKey present AND canAccess(menuKey) via profile rights / user override)
```

This means:
- When kill switch is OFF: baseline `item.roles` continues to render (fail-open), AND admin-granted overrides/profile rights also work.
- When kill switch is ON: behaviour unchanged from today.

We do NOT remove the existing CAPA fallbacks (`staticRoleFilter`, the catch in `resolveGroupItems`, fail-open in `useMenuAccess`). The kill switch keeps its job of suppressing the *resolver/parent move/label* tree.

**Verification:** unit test in `src/test/menu/` that asserts:
- manager with `admin-incentive` override + flag OFF → visible.
- manager without any grant + flag OFF → `admin-incentive` not visible (admin-only static role).
- auditor without any grant + flag OFF → `data-entry` hidden (see Step 2).
- the existing CAPA invariants (`admin-settings` for admin, dashboard+inbox baseline, last-resort admin fallback) still pass.

### Step 2 — Tighten hardcoded `roles` on data-entry duplicates

Lines 121–122 currently list `roles: ['employee','manager','auditor','management','hr_pms']` for both Data Entry items. Per the report, these are admin-grant-driven menus, not role defaults. Change to `roles: ['admin']` so they only appear via an explicit grant (override / access profile / `menu_access_config`).

This is what removes the **auditor seeing "KPI entry" with no grant** symptom and the **101715 seeing "Org KPI Data Entry" with no explicit grant** symptom. Admins who actually need it keep it via their profile right (`data-entry` is already in `menu_access_config` for those roles, but with Step 1 in place that becomes additive, not automatic).

> Decision justification: the cleaner alternative is dropping these duplicates from `getStaticMenuItems` and relying purely on the registry/overrides. Rejected for this fix — it would require database menu_registry rows for the Data Entry group, which is out of scope. The role tightening achieves the same gating with one line each.

### Step 3 — Backfill check

No DB migration. Confirm that `menu_access_config` for the affected keys still lists the correct fallback roles (it does — see RCA table). No new GRANT/RLS work.

### Step 4 — Tests

- New test file `src/test/menu/menu-overrides-off-honors-grants.test.ts` covering Step 1 behaviour with the flag OFF.
- Extend existing `useMenuAccess-failopen.test.ts` invariants to confirm they still pass after the edit.
- No e2e change.

### Step 5 — Docs

- `DOCUMENTATION.md`: update Menu Access Rights section — clarify that `menu_overrides_enabled` only gates the resolver tree, not access grants.
- `POLICY.md`: update the access-resolution policy (priority chain) to read "static role match OR grant" when flag is off.
- `mem://features/admin/menu-setting` and `mem://features/admin/menu-setting-capa`: append a note about Step 1's layered behaviour.

## Rollback

Revert the single `filterByRole` edit and the two `roles:` arrays on lines 121–122. No DB changes to undo.

## Out of scope

- Turning `menu_overrides_enabled` to `true` (separate decision; resolver tree change has broader implications).
- Re-architecting Data Entry duplicates into the registry.
- Any change to `useMenuAccess` priority chain — it's already correct; we just need the sidebar to USE it.
