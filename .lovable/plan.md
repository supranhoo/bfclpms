## Phase 4A — Auth & Routing Enforcement for `implementation_admin`

Hardens the visibility and route-level gates around the Implementation Console role so it can be used operationally. **Pure auth/routing/UI** — no PMS workflow, scoring, menu schema, report, RLS-on-existing-tables, notification, or entitlement-enforcement changes.

### Assumptions (verified against current code)
- `implementation_admin` is already in `public.app_role` enum and in `src/lib/roles.ts` `ALL_APP_ROLES` — no DB migration needed for the role itself.
- `client_implementer_assignments` already exists with RLS; current `ImplementationConsoleRoute` and `ModuleHub` allow entry based on assignment count OR `platform_owner` — they do **not** yet consult the `implementation_admin` role flag.
- `PlatformOwnerRoute` (`src/components/layout/PlatformOwnerRoute.tsx`) already blocks non-owners from `/platform-settings`, but redirects to `/home` instead of rendering a 403.
- `AppSidebar` does not list `/platform-settings` or `/implementation-console`; both are standalone routes outside `DashboardLayout`. Sidebar enforcement is therefore out of scope — only `ModuleHub` tiles + route guards matter.

### Risk & Impact Report
- **Data**: zero schema change. No migration. No RPC.
- **PMS / scoring / menus / reports / RLS-existing / notifications / entitlements**: zero impact. None of the touched files affect PMS surfaces.
- **Security**: tightens access — `implementation_admin` is explicitly recognized in the IC entry guard (today they can already enter via assignment-row presence; we add a parallel role-based recognition path). `/platform-settings` continues to require `platform_owner`. A new 403 page replaces silent redirects so direct-link probing is visibly denied.
- **Regression**: scoped to 5 files. `platform_owner` keeps full access to both Platform Settings and Implementation Console. All other roles are unaffected.
- **Scalability**: O(1) — same role/assignment checks already in place; one new tiny page; no new queries.
- **Rollback**: revert the 5 file edits. Role enum already existed; no DB state to undo.

### What gets built (5 small edits)

1. **New page `src/pages/AccessDenied.tsx`** (new file)
   - Standalone 403 view. Shows title "Access denied", description "You do not have permission to view this page.", and a single "Back to Hub" button → `/home`.
   - No data fetching, no auth side effects. Uses existing `MinimalHeader`.

2. **`src/contexts/AuthContext.tsx`** (small surgical edits)
   - Add `implementation_admin` to `ROLE_PRIORITY` (so users whose only role is `implementation_admin` get a stable `effectiveRole` instead of `roles[0] ?? null`). Insert it just before `auditor` (admin-tier visibility, below platform_owner).
   - Add `isImplementationAdmin: boolean` convenience flag on the context value (mirroring `isPlatformOwner`). No API rename — existing consumers untouched.

3. **`src/components/layout/PlatformOwnerRoute.tsx`** (one-line behavior change)
   - On fail, render `<AccessDenied />` instead of `<Navigate to="/home" replace />`. Direct `/platform-settings` access by `implementation_admin` now shows a visible 403 page instead of silently bouncing to Hub. `platform_owner` behavior unchanged.

4. **`src/components/layout/ImplementationConsoleRoute.tsx`** (gate update + 403 render)
   - Allow entry when **any** of: `hasRole('platform_owner')` OR `hasRole('implementation_admin')` OR `assignmentCount > 0`. Adding the explicit role check means an `implementation_admin` user with zero assignments still reaches the Console shell (where the client picker will simply show no clients — which is the correct UX, not a redirect).
   - On fail, render `<AccessDenied />` instead of `Navigate("/home")`.

5. **`src/pages/ModuleHub.tsx`** (tile visibility parity)
   - `showImplCard = hasRole('platform_owner') || hasRole('implementation_admin') || (assignmentCount ?? 0) > 0`. Same union used by the route guard so tile and route never disagree.
   - `showPlatformCard` unchanged — still `hubEnabled && hasRole('platform_owner')`.

6. **`src/App.tsx`** (route registration)
   - Register `/access-denied` → `AccessDenied` (public, no guard).

### Unassigned-client safety inside the Console
The existing `ImplementationConsole.tsx` already populates the client picker via `client_implementer_assignments` (for non-owners) or `clients` (for owners), so unassigned clients are never selectable in the dropdown. The `DeliveryLogsTab` already renders an "Access denied" alert on direct query failure (shipped in 3G). **No further change needed** — the requirement is already satisfied by Phases 3C and 3G.

### UI Changes
- **New page**: `/access-denied` — single full-screen card, "Back to Hub" button.
- **Hub tile**: Implementation Console card now visible to `implementation_admin` even without assignments (so the operator can see they have the role but no assigned clients yet). Platform Settings tile unchanged.
- **Direct-URL probes** of `/platform-settings` by `implementation_admin` → renders the 403 page instead of bouncing to Hub.
- **No sidebar change** (these routes aren't in the sidebar).
- **Responsiveness**: 403 page uses existing layout tokens; no new breakpoints.

### Out of scope (explicit)
- No DB migration. No RLS edit on any existing table (`client_implementer_assignments` RLS already correctly scoped).
- No change to the 7 PMS roles or their menus. PMS admin menus remain visible only to users who hold the relevant PMS role — `implementation_admin` alone never inherits PMS admin.
- No edge function change.
- No change to `client_action_entitlements`, `client_module_entitlements`, `client_smtp_config`, `client_urls`, `client_contacts`, `client_notification_templates`, or `entitlement_audit`.
- No change to `hub_platform_settings_enabled` semantics.
- No change to existing redirects from `ProtectedRoute` (kept as `/home` redirect) — only the two privileged guards (`PlatformOwnerRoute`, `ImplementationConsoleRoute`) switch to the 403 page.

### Files (planned, not yet touched)
- `src/pages/AccessDenied.tsx` (new)
- `src/contexts/AuthContext.tsx`
- `src/components/layout/PlatformOwnerRoute.tsx`
- `src/components/layout/ImplementationConsoleRoute.tsx`
- `src/pages/ModuleHub.tsx`
- `src/App.tsx`
- Docs: `CHANGELOG_2026.md`, `mem/features/platform/implementation-console.md`, `.lovable/plan.md`

### Verification matrix
| Identity | Hub shows Platform Settings | Hub shows Impl Console | `/platform-settings` direct | `/implementation-console` direct | Clients visible inside Console |
|---|---|---|---|---|---|
| `platform_owner` | ✅ | ✅ | ✅ enters | ✅ enters | All |
| `implementation_admin` (with assignments) | ❌ | ✅ | 🚫 403 page | ✅ enters | Only assigned (existing RLS) |
| `implementation_admin` (no assignments) | ❌ | ✅ | 🚫 403 page | ✅ enters | Empty picker (no redirect) |
| admin / manager / employee / auditor / management / hr_pms / skip_level (no IC assignment) | ❌ | ❌ | 🚫 403 page | 🚫 403 page | n/a |
| Any PMS role with separate assignment row | ❌ | ✅ (via assignment) | 🚫 403 page | ✅ enters | Only assigned |

Plus: existing PMS admin/manager/etc. menus, dashboards, reviews, scoring, and reports are unchanged for every identity.

Awaiting approval. Reply with corrections or "proceed" to ship Phase 4A.
