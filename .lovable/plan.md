

## Make Incentive Edge Function RBAC Configurable — Revised Plan

### Problem
Both incentive edge functions (`compute-monthly-incentives`, `detect-retroactive-incentive-changes`) hardcode `['admin', 'hr_pms']` as allowed roles. Users with `employee` or `manager` roles who have been granted `admin-incentive` or `reports-incentive` menu overrides are blocked with 403. The `compute` function got a partial fix (checks `admin-incentive` override), but `detect-retroactive` has no override fallback at all.

### Key Insight
Access to incentive functions will be granted alongside report access to users who may hold **any** role (including `employee` or `manager`). The authorization gate should not care about the user's base role — only whether they have the correct menu override OR a privileged role.

### Solution

**1. Shared auth helper: `supabase/functions/_shared/incentive-auth.ts`**

A reusable function `checkIncentiveAccess(supabase, authHeader, menuKey)` that:
1. Validates JWT and extracts user
2. Checks `user_roles` for `admin` or `hr_pms` → allow immediately
3. If no privileged role, checks `menu_access_user_overrides` for the specified `menuKey` (e.g. `admin-incentive`) → allow if found
4. This works for **any** base role — `employee`, `manager`, etc. — as long as the override exists

Returns `{ authorized: boolean, user, error?, status? }`.

**2. `compute-monthly-incentives/index.ts`** (lines 17–44)
- Replace the inline RBAC block with `checkIncentiveAccess(supabase, authHeader, 'admin-incentive')`

**3. `detect-retroactive-incentive-changes/index.ts`** (lines 17–36)
- Replace the inline RBAC block with `checkIncentiveAccess(supabase, authHeader, 'admin-incentive')`
- This fixes the missing override fallback (same bug that compute had before)

**4. Admin UI — granting access**
No code changes needed. Admins already use **System Settings → Menu Access → User Overrides** to grant `admin-incentive` to any user regardless of their base role. An employee or manager with this override will pass the edge function auth check.

### Access Matrix After Fix

| User Role | Has `admin-incentive` override? | Can Compute? | Can Detect? |
|---|---|---|---|
| admin | N/A | YES (role) | YES (role) |
| hr_pms | N/A | YES (role) | YES (role) |
| manager | YES | YES (override) | YES (override) |
| manager | NO | NO | NO |
| employee | YES | YES (override) | YES (override) |
| employee | NO | NO | NO |

### Files to Change

| File | Change |
|---|---|
| `supabase/functions/_shared/incentive-auth.ts` | New — shared auth helper checking roles + menu overrides |
| `supabase/functions/compute-monthly-incentives/index.ts` | Replace inline RBAC with shared helper call |
| `supabase/functions/detect-retroactive-incentive-changes/index.ts` | Replace inline RBAC with shared helper call (fixes missing override) |
| `POLICY.md` | Add §73 — incentive RBAC via shared helper; any role eligible via override |
| `DOCUMENTATION.md` | Record the refactor and role-agnostic override support |

### Risk Assessment
- **Data Impact**: None — no schema changes
- **Security**: Improved — consistent checks; access explicitly gated by menu override key, not role assumptions
- **Regression**: None — admin/hr_pms users unaffected; additive for employee/manager with overrides

