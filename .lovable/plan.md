
# Root Cause & Complete Fix Plan

## Why Vivek STILL Cannot See Inbox

The screenshot confirms Vivek is on the **live production site** (`pms.bfclalloys.com`). The code fixes applied in the previous session only exist in the **test/preview environment** — they have not been published to the live site yet.

However, beyond just publishing, a deeper audit reveals **additional gaps** that the previous CAPA plan missed — specifically in `App.tsx` route guards. These must be fixed before publishing, otherwise publishing will still leave holes.

---

## Additional Gaps Found (not covered by previous CAPA)

### Gap A — `App.tsx` Route Guards: `skip_level` missing everywhere

Every `ProtectedRoute` that includes `hr_pms` does NOT include `skip_level`. This means a skip_level user who navigates directly to `/profile`, `/pms-policy`, etc. gets redirected to `/dashboard` even though they should have access.

| Route | Current allowedRoles | Missing |
|---|---|---|
| `/profile` | admin, manager, employee, auditor, management, hr_pms | skip_level |
| `/pms-policy` | admin, manager, employee, auditor, management, hr_pms | skip_level |
| `/reports` | manager, admin, auditor, management | skip_level (if applicable) |

### Gap B — `App.tsx` Route `/queries`: No `ProtectedRoute` at All

The `/queries` route has **no `ProtectedRoute` wrapper** — it renders for any logged-in user. This is actually correct behavior for Inbox (everyone should access it), and it's why the sidebar was the only gating mechanism. The fix in the sidebar is therefore sufficient and correct for the Inbox page itself.

### Gap C — Session Cache Issue

Per the system memory: *"Role changes or reporting manager updates made in the database are not reflected in the active UI session until the user performs a hard refresh or logs out and back in."*

Even after publishing, Vivek must **log out and log back in** (or hard-refresh) to pick up the new sidebar code, because `effectiveRole` is cached in the React AuthContext state for the duration of the session.

---

## Complete Fix Plan

### Fix 1 — Already Done in Test (Sidebar + AuthContext + roles.ts)
The following are already fixed in the test build:
- `hr_pms` and `skip_level` added to Inbox roles array (line 58 of AppSidebar.tsx)
- `hr_pms` and `skip_level` added to My Dashboard roles array (line 57)
- `skip_level` recognized as valid `AppRole` in `src/lib/roles.ts`
- `AuthContext.tsx` imports `AppRole` from centralized `src/lib/roles.ts`
- `ProtectedRoute.tsx` imports `AppRole` from centralized `src/lib/roles.ts`

### Fix 2 — App.tsx: Add `skip_level` to all ProtectedRoute allowedRoles

Every `ProtectedRoute` that currently lists `hr_pms` must also include `skip_level` since skip_level is a reviewer-level role with the same general access needs.

**File: `src/App.tsx`**

Routes to update:
- `/profile` — add `skip_level`
- `/pms-policy` — add `skip_level`

This is a safe, purely additive change. The `ProtectedRoute` component only redirects if the role is NOT in the list — adding roles can never break existing users.

### Fix 3 — Publish to Production

After Fix 2 is applied, the project must be **published** to push all changes to `pms.bfclalloys.com`. The live site currently runs the old code from before the CAPA fixes.

### Fix 4 — Vivek Must Re-login

After publishing, Vivek needs to **log out and log back in** for the session to pick up the new sidebar rendering. A hard refresh (Ctrl+Shift+R) may also work.

---

## Files to Modify

| File | Change | Risk |
|---|---|---|
| `src/App.tsx` | Add `skip_level` to `/profile` and `/pms-policy` ProtectedRoute allowedRoles | Low — additive only |
| `DOCUMENTATION.md` | Finalize version 1.45.29 notes with skip_level route fix | None |

---

## Why Only These Two Files?

All other CAPA fixes (roles.ts, AuthContext, ProtectedRoute, AppSidebar) were already implemented in the test environment. The only remaining code gap is `App.tsx`. Once that is fixed and the project is **published**, Vivek will see the Inbox on the live site after re-logging in.

---

## Expected Outcome

| User | Role | Inbox Visible After Fix | Notes |
|---|---|---|---|
| Vivek Kumar Dansena | hr_pms | Yes | Must re-login after publish |
| All hr_pms users | hr_pms | Yes | Sidebar shows Inbox in MAIN section |
| skip_level users | skip_level | Yes | Also get /profile and /pms-policy access |
| All other roles | employee, manager, admin, etc. | No change | Fully unaffected |

No existing features are broken — all changes are purely additive role inclusions.
