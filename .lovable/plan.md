
# Inbox Access CAPA — COMPLETED ✅

All fixes have been implemented in the test environment.

## Status: Ready to Publish

### Fix 1 ✅ — Sidebar: hr_pms + skip_level added to Inbox and My Dashboard roles
File: `src/components/layout/AppSidebar.tsx`
- Line 57: `My Dashboard` roles includes `skip_level`
- Line 58: `Inbox` roles includes `hr_pms` and `skip_level`
- Line 230: Manager section visible for `skip_level` users

### Fix 2 ✅ — Centralized AppRole type (roles.ts)
File: `src/lib/roles.ts`
- `ALL_APP_ROLES` includes all 7 roles including `skip_level`
- `AppRole` type derived from this constant

### Fix 3 ✅ — AuthContext and ProtectedRoute import from roles.ts
Files: `src/contexts/AuthContext.tsx`, `src/components/layout/ProtectedRoute.tsx`
- Both import `AppRole` from `src/lib/roles.ts`

### Fix 4 ✅ — App.tsx route guards updated
File: `src/App.tsx`
- `/profile` — now allows `skip_level`
- `/pms-policy` — now allows `skip_level`

### Fix 5 ✅ — useSubordinateQueries extended for skip-level chain
File: `src/hooks/useQueryWorkflow.ts`
- Team tab now fetches both direct and indirect (skip-level) subordinates

---

## Next Steps

1. **Publish** the project to push all changes to the live site
2. **Vivek must log out and log back in** (or hard refresh) on the live site

---

## All Gaps Closed

| Gap | Fix | Status |
|---|---|---|
| Inbox not visible for hr_pms | Sidebar roles updated | ✅ Done |
| Inbox not visible for skip_level | Sidebar roles updated | ✅ Done |
| skip_level not recognized as AppRole | roles.ts centralized | ✅ Done |
| /profile blocked for skip_level | App.tsx route guard updated | ✅ Done |
| /pms-policy blocked for skip_level | App.tsx route guard updated | ✅ Done |
| Team tab empty for skip_level | useSubordinateQueries extended | ✅ Done |
