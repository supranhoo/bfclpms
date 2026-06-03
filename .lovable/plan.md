## RCA

I traced the full provider/routing tree:

- `src/App.tsx` mounts **one** `<AuthProvider>` at the root, wrapping `<BrowserRouter>` and every route — including `/dashboard`, `/home` (ModuleHub), all admin routes, and the new `/platform-settings` route.
- `/platform-settings` is registered as a direct child of `<Routes>` inside that same `<AuthProvider>`. `<PlatformOwnerRoute>` renders `<PlatformSettings>` inside the provider tree.
- `src/contexts/AuthContext.tsx` exports `AuthProvider` and `useAuth` correctly. `useAuth()` throws only when `useContext(AuthContext)` returns `undefined`.
- `PlatformOwnerRoute.tsx`, `ModuleHub.tsx`, and `PlatformSettings.tsx` all import `useAuth` from `@/contexts/AuthContext` (single canonical path — no duplicate module).

There is **no second React tree, no portal, no nested provider, and no route outside `<AuthProvider>`**.

The error in the runtime snapshot was thrown from **`Dashboard.tsx` line 70**, not from `/platform-settings`, and the file URL carried a Vite HMR cache-busting timestamp (`AuthContext.tsx?t=1780511571702`). This is the classic Vite Fast Refresh signature: when `AuthContext.tsx` was edited mid-session during the recent multi-role refactor, the running `Dashboard` instance held a reference to the **old** `AuthContext` object while the freshly re-imported `AuthProvider` registered a **new** one — so `useContext` returned `undefined` for that one component instance.

The flag is currently `false`, so `/platform-settings` is not even mounted right now — yet the error still shows in the snapshot. That confirms the error is unrelated to the Platform Owner code and is purely an HMR identity-loss artifact that a single hard reload clears.

## Risk & Impact Report

- **Data**: none
- **Workflow / RLS / permissions**: unchanged
- **Regression risk**: zero for the verification path; very low for the optional defensive log
- **Rollback**: keep flag `false`; revert the one optional file change

## Plan (Step → Verification)

1. **Hard reload `/dashboard` once** (you, in the browser). → Verify the AuthProvider error is gone. Expected: yes, because the error is stale HMR state.
2. **No structural code change is required.** The provider tree is already correct. (If step 1 still shows the error after a hard reload, I will re-investigate — but based on the code, it will not.)
3. **(Optional, recommended) Add a defensive `console.error` inside `useAuth`** before the existing `throw`, with a hint that the most common cause is an HMR/duplicate-module situation. Keeps the throw (do **not** silently return a stub — that would mask real bugs). No runtime behavior change.
4. **Re-enable the flag** `hub_platform_settings_enabled = "true"` only after step 1 passes. → Verify:
   - Jaspal/Ankit/Vivek: `/platform-settings` renders; `useAuth().role === 'admin'`; `hasRole('platform_owner') === true`; existing admin pages unchanged.
   - A non–platform-owner user: `/platform-settings` redirects to `/home` (existing `<Navigate to="/home" replace />` in `PlatformOwnerRoute`).
   - `/dashboard`, admin menus, workflows, scoring, reports, RLS — unchanged.
5. **If anything in step 4 fails**, immediately flip the flag back to `"false"` (one `UPDATE` on `system_settings`) — `/platform-settings` becomes unreachable again and PMS is fully unaffected.

## UI Changes

None.

## Tests

`src/test/platformFoundation.test.ts` already covers `pickPrimaryRole` backward compatibility (admin + platform_owner → primary `admin`). No new tests needed for a console-log-only change.

## DOCUMENTATION.md / POLICY.md

One-line note in DOCUMENTATION.md under the Platform Foundation section: "After editing `AuthContext.tsx`, hard-reload the preview — Vite Fast Refresh can otherwise show a stale 'useAuth must be used within an AuthProvider' error from a single pre-existing component instance." No POLICY.md change (no behavior change).

## Post-implementation

Awaiting two things from you before any code/flag change:

1. **Hard-reload `/dashboard`** and confirm whether the AuthProvider error disappears. If yes → root cause is confirmed as HMR-only and no structural fix is needed.
2. **Approve this plan** so I can (a) add the optional defensive log in `useAuth`, (b) flip `hub_platform_settings_enabled` back to `"true"`, and (c) run the step-4 verifications.