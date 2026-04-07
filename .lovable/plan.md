

## Auto-Logout (Idle Timeout) Feature

### What This Does
Adds a configurable auto-logout feature that signs users out after a period of inactivity. Admins can set the idle timeout duration (e.g., 15, 30, 60 minutes) from System Settings. The system tracks mouse, keyboard, scroll, and touch events to detect activity.

### How It Works

```text
User active → reset timer
User idle for X minutes → show warning toast (60s before logout)
Still idle → auto sign-out → redirect to /auth
```

### Implementation

**1. New System Setting: `auto_logout_minutes`**
- Stored in `system_settings` table (no migration needed — uses existing upsert pattern)
- Default: `30` minutes
- Options: 5, 10, 15, 30, 45, 60, 90, 120 minutes, or "Disabled"

**2. New Hook: `src/hooks/useIdleTimeout.ts`**
- Reads `auto_logout_minutes` from `useSystemSetting`
- Listens to `mousemove`, `keydown`, `scroll`, `click`, `touchstart` events (throttled)
- Sets a `setTimeout` for the configured duration
- Shows a warning toast 60 seconds before logout
- Calls `supabase.auth.signOut()` on expiry
- Cleans up listeners on unmount

**3. Integrate into `DashboardLayout.tsx`**
- Call `useIdleTimeout()` inside the layout so it's active on all authenticated pages

**4. Admin UI in `SystemSettings.tsx`**
- Add an "Auto Logout" card under the "General" or "Controls" section
- Dropdown to select timeout duration
- Uses existing `useUpdateSystemSetting` to save

### Files to Change

| File | Change |
|------|--------|
| `src/hooks/useIdleTimeout.ts` | New hook — idle detection + auto sign-out |
| `src/hooks/useSystemSettings.ts` | Add `useAutoLogoutMinutes()` convenience hook |
| `src/components/layout/DashboardLayout.tsx` | Call `useIdleTimeout()` |
| `src/pages/admin/SystemSettings.tsx` | Add Auto Logout duration selector in Controls section |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **No data changes**: Uses existing `system_settings` table with upsert
- **No regression**: Default is 30 minutes; "Disabled" option available
- **Performance**: Event listeners are throttled (1 check per second max); negligible overhead
- **Security**: Enhances security by preventing unattended sessions

