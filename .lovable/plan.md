## Goal
Bring the Safety shell UX to parity with the PMS shell so users get the same feel:
1. **Sidebar collapse trigger** visible in the sidebar header (currently missing — only the floating trigger appears once the sidebar is already collapsed).
2. **Hub button + Profile + Theme + Notifications moved out of a top header** and into the sidebar (footer + header), so Safety has no separate top app header — exactly like PMS.

Both items are scoped to the Safety shell only. PMS is untouched. Module isolation rules from `mem://architecture/safety/module-shell-isolation` are preserved (no PMS imports).

### UI Preview (after change)

```text
┌─────────────────────────┬──────────────────────────────────────────────┐
│ [🛡] Safety       [⇤]  │                                              │
│     BFCL                │                                              │
├─────────────────────────┤                                              │
│ Safety                  │                                              │
│ 🏠 Safety Home          │           Safety Dashboard                   │
│ ⚠  Incidents            │           Live incident posture …            │
│ 📝 Permits to Work      │                                              │
│ 🔧 Assets & Calibration │   ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ ✅ Audits & Compliance  │   │  Open    │ │ Overdue  │ │ At Risk  │    │
│ 🚨 Emergency Response   │   │   0      │ │   0      │ │   0      │    │
│ 🎓 My Training          │   └──────────┘ └──────────┘ └──────────┘    │
│ 📖 Training Admin       │                                              │
│ 📊 Analytics            │                                              │
│ … (other items)         │                                              │
│ ⚙  Settings             │                                              │
├─────────────────────────┤                                              │
│ ← Back to Hub      [🌙] │                                              │
│ ┌─────────────────────┐ │                                              │
│ │ [AC] Ankit C.    [⎋]│ │                                              │
│ │      Safety         │ │                                              │
│ └─────────────────────┘ │                                              │
└─────────────────────────┴──────────────────────────────────────────────┘
```

Key changes vs current Safety UI in screenshot:
- Top "Safety / BFCL / Hub / 🔔 / 🌓 / Avatar" bar **removed**.
- Sidebar header gets a **collapse `[⇤]` button** (matching PMS).
- Sidebar footer gets the **profile card + sign-out + theme + Back-to-Hub** (matching PMS layout exactly).
- Notification bell moves into the sidebar footer (small icon row) so Safety alerts are still 1-click reachable.
- Offline badge moves to the sidebar footer row alongside notifications.

### Files to change

1. **`src/components/safety/SafetySidebar.tsx`**
   - Add `<SidebarHeader>` with Safety logo (red shield), title "Safety", subtitle = `appSettings.organization_name`, and a `<SidebarTrigger>` on the right (mirrors `AppSidebar` lines 221-238).
   - Add `<SidebarFooter>` containing:
     - Row 1: `Back to Hub` button (left) + `<ThemeToggle />` (right).
     - Row 2: Small icon row — `<SafetyNotificationBell />` + `<SafetyOfflineBadge />`.
     - Row 3: Profile card — avatar (destructive-toned fallback), full name, role label "Safety", sign-out icon button (mirrors `AppSidebar` lines 387-415).
   - Use `useAuth()` for `profile` + `signOut`, `useAppSettings()` for org name, `useNavigate()` for Hub/Sign-out routing.

2. **`src/components/safety/SafetyLayout.tsx`**
   - Remove `<SafetyHeader />` from `<SafetyContent />` so the main pane starts at the top with no header bar (matches PMS `DashboardLayout`).
   - Keep the existing floating `<SidebarTrigger>` shown only when the sidebar is collapsed (already implemented, identical to PMS).

3. **`src/components/safety/SafetyHeader.tsx`** — keep file (no longer imported anywhere) but mark as deprecated via a top-of-file comment, OR delete it. **Recommendation:** delete to avoid dead code drift. Confirm no other importers via `rg "SafetyHeader"` before deletion.

4. **`src/test/safetyShellIsolation.test.tsx`**
   - Update the "do NOT import PMS chrome" assertion to also cover the new sidebar footer (no behavioural change).
   - If `SafetyHeader.tsx` is deleted, remove the `headerSrc` import from the test.

5. **`mem/architecture/safety/module-shell-isolation.md`**
   - Update note: the Safety shell now mirrors the PMS shell pattern (header chrome lives inside the sidebar; no separate top app header). Forbidden-imports rule is unchanged.

6. **`DOCUMENTATION.md`** — add a short note under the Safety section: "Safety shell UI mirrors PMS — sidebar-only chrome, no top header."

7. **`POLICY.md`** — no policy change (purely UX parity).

### Risk & Impact

- **Data Impact:** None. No schema, RLS, or query changes.
- **Workflow Impact:** None. Routes, RBAC gates (`SafetyModuleRoute`), and notification logic all unchanged — only the location of the bell/avatar moves.
- **UI/UX Consistency:** Improves parity with PMS; removes the user-reported divergence.
- **Regression Risk:** Low.
  - `SafetyOfflineBadge` and `SafetyNotificationBell` already render fine inline; moving them into the sidebar footer doesn't change their hooks.
  - Mobile: sidebar collapses to sheet — profile/notifications are reachable inside the sheet, identical to PMS pattern.
- **Mitigation:**
  - Keep the existing `safetyShellIsolation` test green (forbidden-imports unchanged).
  - Smoke render `SafetySidebar` inside `MemoryRouter + QueryClientProvider` in the test to confirm no throw.
  - Manually verify on the preview: collapse trigger, sign-out, theme toggle, Hub navigation, notification bell open.

Approve to proceed.