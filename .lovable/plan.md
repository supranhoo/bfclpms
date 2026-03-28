

## Fix: Incentive Config Route Blocks Override Users

### Root Cause
Same pattern as the sidebar fix — the **route guard** at line 327 of `App.tsx` has `allowedRoles={['admin']}`, so `ProtectedRoute` redirects non-admin users to `/dashboard` even though they have a menu access override granting them access.

The sidebar was already fixed to respect overrides, but routes were not.

### Fix
Update `ProtectedRoute` to also check `useMenuAccess` overrides. Add an optional `menuKey` prop — when provided, if `canAccess(menuKey)` returns true, allow access regardless of role.

### Implementation

**`src/components/layout/ProtectedRoute.tsx`**:
- Add optional `menuKey?: string` prop
- Import and call `useMenuAccess().canAccess(menuKey)` 
- Access logic: if `menuKey` is provided and `canAccess(menuKey)` is true, render children; otherwise fall back to existing role check

**`src/App.tsx`**:
- Add `menuKey="admin-incentive"` to the Incentive Config route's `ProtectedRoute`
- Apply same pattern to all other admin routes so future overrides work consistently

### Files Changed
| File | Action |
|------|--------|
| `src/components/layout/ProtectedRoute.tsx` | Add `menuKey` prop + `canAccess` check |
| `src/App.tsx` | Add `menuKey` to all `ProtectedRoute` instances |

### Risk Assessment
- **Regression**: Zero — without `menuKey` prop, behavior is identical to current
- **Security**: Menu access is cosmetic; actual data security is RLS-enforced at database level
- **Data**: No schema changes

