# Plan: New "Logs" tab inside System Settings

Group the existing **Audit Logs** and **Email Logs** screens under a single **Logs** section inside System Settings, and remove their standalone entries from the main sidebar.

## Risk & Impact

- **Data:** None. Pure UI/navigation change — no schema, RLS, or query changes.
- **Workflow:** Admins now reach Audit Logs / Email Logs via `Admin → System Settings → Logs` instead of the top-level sidebar.
- **Regression risk:** Bookmarks/deep links to `/audit-logs` and `/admin/email-logs`. Mitigated by keeping the existing routes alive (they continue to render the same pages standalone). Sidebar just no longer surfaces them as separate items.
- **Menu access keys:** `admin-audit-logs` and `admin-email-logs` remain valid — visibility of the new "Logs" sub-tabs is derived from these existing keys, so no menu-rights migration needed.

## UI Changes

**1. Main sidebar (`AppSidebar.tsx`) — Admin group**

Before:
```text
⚙ System Settings
🕘 Audit Logs
👁 Observations
↶ Rollback Requests
✉ Email Logs
```

After:
```text
⚙ System Settings
👁 Observations
↶ Rollback Requests
```
(Audit Logs and Email Logs entries removed from the sidebar list.)

**2. System Settings left-nav** — append a new entry near the bottom:
```text
... Backups | Data Repair | Feature Flags | Module Hub
📜 Logs                ← NEW
```

**3. New "Logs" section content** — renders two sub-tabs using existing `Tabs` primitive:
```text
┌─ Logs ──────────────────────────────────┐
│  [ 🕘 Audit Logs ] [ ✉ Email Logs ]     │
├─────────────────────────────────────────┤
│  <selected sub-tab content>             │
└─────────────────────────────────────────┘
```
- **Audit Logs** sub-tab → renders `<AuditLogs />` (existing page body)
- **Email Logs** sub-tab → renders `<EmailLogs />` (existing page body)
- Active sub-tab persisted in URL as `?section=logs&logs=audit` / `?section=logs&logs=email` (parity with the existing `?tab=` pattern used by the Increment section).
- Sub-tabs are filtered by the menu-access keys `admin-audit-logs` / `admin-email-logs` — if a role has only one, only that sub-tab renders and it is auto-selected.

## Technical Changes

1. **`src/pages/admin/SystemSettings.tsx`**
   - Add `{ key: 'logs', label: 'Logs', icon: ScrollText }` to `SETTINGS_SECTIONS`.
   - Import `AuditLogs` from `@/pages/AuditLogs` and `EmailLogs` from `@/pages/admin/EmailLogs`.
   - Import `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs`.
   - Read/write `logs` URL param alongside existing `tab` param logic.
   - Add a new `case 'logs':` in `renderSectionContent()` that renders a `<Tabs>` with the two sub-tabs, gated by `useMenuAccess` (same hook the sidebar uses) so unauthorized sub-tabs are hidden.

2. **`src/components/layout/AppSidebar.tsx`**
   - Remove the two menu items: `Audit Logs` (`/audit-logs`, `admin-audit-logs`) and `Email Logs` (`/admin/email-logs`, `admin-email-logs`).
   - Leave the `pathname === '/audit-logs'` highlighting line untouched so the existing route still highlights the Admin group if reached via deep link.

3. **Routes (`App.tsx`)** — **no change**. `/audit-logs` and `/admin/email-logs` continue to render the standalone pages so existing bookmarks, email links, and notifications keep working.

## Out of Scope

- No changes to `AuditLogs.tsx` or `EmailLogs.tsx` internals (filters, queries, RLS).
- No changes to menu-access master data or DB.
- No changes to other System Settings sections.

## Tests

- Add a render test for `SystemSettings` that mounts with `?section=logs`, mocks `useMenuAccess` to allow both keys, and asserts both sub-tab triggers appear and switching tabs swaps the heading rendered by each child page.
- Add a second case where only `admin-email-logs` is allowed and assert the Audit Logs trigger is not rendered and Email Logs auto-selects.

## Files Touched

- `src/pages/admin/SystemSettings.tsx` (add section + sub-tabs)
- `src/components/layout/AppSidebar.tsx` (remove 2 menu entries)
- `src/test/systemSettingsLogsTab.test.tsx` (new)

## Rollback

Revert the three files. Routes were never removed, so no migration or data rollback required.
