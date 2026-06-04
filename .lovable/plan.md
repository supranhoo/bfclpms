
## Scope guard

Roadmap work is paused. This plan only touches CAPA / sidebar render path. No changes to:
- `menu_overrides_enabled` flag
- `menu_registry` / `menu_overrides` seeding
- Menu Setting / Hub enforcement flags
- DB migrations, RLS, workflow, scoring

## Diagnosis questions answered from code + live signals

What we can confirm right now from code, network logs, and the live bundle hash served at `pms.bfclalloys.com` (`assets/index-CjfF6RVN.js`):

1. AppSidebar is unconditionally mounted by `DashboardLayout` after `loading=false` and `user` present. No conditional that can omit it.
2. The left pane container (`<Sidebar>`) always renders header + footer + SidebarContent. If only the menu area is blank, the empty region is the `<ErrorBoundary>` inside `<SidebarContent>` between Header and Footer. If the entire left pane is missing, that's a different failure mode (Sidebar offcanvas collapsed). We need a screenshot from the affected user to disambiguate.
3. From the preview session (Ankit, admin + platform_owner, `menu_overrides_enabled=false`, no direct reports → naturalRole=employee, isAdminMode default `true` → effectiveRole=`admin`), no error is thrown in the captured logs from AppSidebar / CollapsibleSidebarGroup / useMenuAccess / useResolvedMenu / AuthContext / ErrorBoundary. The only errors are unrelated: a `/~api/analytics` 500 and a realtime WS close.
4. Live values on the active session: `role=admin`, `effectiveRole=admin`, `isAdminMode=true`, `profile.id=535d9a14…`, `loading=false`. Auth bootstrap completed (profile + roles returned 200).
5. `filterByRole` does receive the static items array each render; if it returns `[]` the new `staticFilter` is invoked. For admin, `canAccess()` falls through to `effectiveRole === 'admin' → true` for all admin-only keys, so the primary filter should already pass.
6. With the current CAPA code, admin group counts cannot be zero for Main (`dashboard`, `inbox` are EMPLOYEE_DEFAULT_MENUS) and Administration (admin fallthrough). If the user still sees zero items, the running bundle is not the CAPA bundle.
7. CSS: `Sidebar` is `collapsible="offcanvas"` by default. When `state==="collapsed"` on desktop the whole sidebar is moved off-canvas, leaving a `w-0` strip. This can present as "blank left pane" if the sidebar was collapsed via the trigger. DashboardLayout already shows a floating trigger when collapsed.
8. Live is serving `index-CjfF6RVN.js`. We need to confirm this hash matches the latest CAPA build (after fail-open + ErrorBoundary fixes). The user reported "Update button blurred" — strong indicator live does NOT yet contain the CAPA fixes.

## What this plan changes

### Step 1 — Confirm the deployed bundle on live (no code change)

Ask the user to:
- On `pms.bfclalloys.com/auth`, open DevTools → Network → reload → note the hash of `assets/index-*.js`.
- Compare to the preview URL's bundle hash.
- Confirm whether the Publish → Update button is now enabled (publish required for frontend changes to reach live).

If hashes differ → live just needs a Publish/Update; no code fix needed.

### Step 2 — Add an emergency static-only sidebar path (CAPA hardening, only if Step 1 still shows blank)

In `src/components/layout/AppSidebar.tsx`, when `overridesEnabled === false`, bypass `resolveGroupItems` and `useMenuAccess.canAccess` entirely for the standard groups and render the static items array filtered ONLY by hardcoded `item.roles.includes(effectiveRole)`. This guarantees the baseline sidebar regardless of any DB state, resolver state, or `menu_access_config` row missing.

Net effect when flag is OFF (current production state):
- Resolver tree: ignored (was already guarded).
- `menu_access_config`: ignored for visibility. Static `item.roles` becomes the gate.
- `canPerform` / per-user overrides: still consulted only for the Data Entry group's bespoke filter (unchanged).
- When flag flips back ON in the future: existing DB-driven path resumes; no roadmap behavior changes.

This is the "If AppSidebar is mounted but counts are zero → emergency static fallback" path the user asked for, narrowly scoped to the flag-off branch.

### Step 3 — Visible CAPA build marker (1 line)

Add a hidden `data-capa-build="2026-06-04"` attribute on `<SidebarContent>` so the user can verify in DevTools whether the CAPA bundle is actually running on live. Costs nothing and avoids future ambiguity.

### Step 4 — Tests

- Unit test: with `overridesEnabled=false`, `effectiveRole='admin'`, mock `useMenuAccess.canAccess` to always return `false` → admin sidebar still shows Main + Administration groups.
- Unit test: with `overridesEnabled=false`, `effectiveRole='auditor'`, primary filter empty → Audit group still shows via static roles.
- Regression: `overridesEnabled=true` path unchanged (resolver still consulted).

## What this plan does NOT change

- No edits to `useResolvedMenu`, `useMenuAccess`, `CollapsibleSidebarGroup`.
- No DB writes, no flag flips, no roadmap unlock.
- Data Entry group keeps its bespoke filter (DataOwnerRoute parity).

## Rollback

Single-file change in `AppSidebar.tsx`. If anything regresses, revert that file.

## Decision needed from you

Before I implement Step 2, please confirm:
- (a) Is the Publish → Update button now clickable? If yes, please click it first and recheck live — Step 2 may be unnecessary.
- (b) On live, can you press F12 → Network → reload, and share the `assets/index-*.js` filename you see? (This tells us whether CAPA is even deployed.)
- (c) Is the entire left pane missing on live, or only the menu list between header and footer?

If (a)=No or (b) shows the same hash `CjfF6RVN` after Publish, I will proceed with Step 2 (emergency static fallback) and Step 3 (build marker). If you want me to skip the questions and just implement Steps 2–4 immediately for safety, say "proceed".
