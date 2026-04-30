---
name: Safety Module Shell Isolation
description: Safety module lives at /safety/* with a fully decoupled shell — no PMS layout imports allowed in either direction. Shell mirrors PMS UX (sidebar-only chrome, no top app header).
type: constraint
---
The Safety module ships as an independent shell wrapped by `SafetyLayout`
(at `/safety`), composed of `SafetySidebar` only — the standalone
`SafetyHeader` was removed in favour of sidebar-only chrome that mirrors
the PMS `AppSidebar` (logo + collapse trigger in `SidebarHeader`; theme
toggle, Back-to-Hub, notification bell, offline badge, profile card and
sign-out in `SidebarFooter`). `SafetyLayout` and `SafetySidebar` MUST NOT
import `AppSidebar`, `DashboardLayout`, or `MinimalHeader`. Conversely,
`DashboardLayout` MUST NOT import anything from `src/components/safety/`.
A regression test
(`src/test/safetyShellIsolation.test.tsx`) enforces both directions by
grep-asserting the source files.

Visibility is gated by two layers, both required:
1. `modules.is_enabled` for `code='safety'` (global kill-switch, admin
   toggles via `/admin/module-hub`).
2. `safety_module_access` row for the user, OR PMS admin role (auto-grant
   via `has_safety_module_access(uuid)` SECURITY DEFINER).

`useModules()` filters Safety from the Hub when either layer fails and
subscribes to `safety_module_access` realtime so revocation hides the
card within one tick. `SafetyModuleRoute` re-checks both layers before
any Safety chrome renders.

**Why:** Prevents PMS UX from polluting Safety routes (and vice versa)
as additional modules (HRMS, LMS) come online with the same shell pattern.
**How to apply:** When adding new Safety pages, place under
`src/pages/safety/`, register inside the `<Route path="/safety">` block in
`App.tsx`, and import only from `@/components/safety/*` or shared UI
primitives (`@/components/ui/*`).