
# Inbox Access — Full System Audit & CAPA Plan

## Audit Findings: Gap Analysis

After a thorough inspection of all layers (Sidebar, Route Guard, RLS, Query hooks, AuthContext), here are **all identified gaps** across every role:

---

### Gap 1 — Sidebar: Inbox item missing `hr_pms` and `skip_level` roles (CONFIRMED BUG)

**File:** `src/components/layout/AppSidebar.tsx`, line 57

```ts
// CURRENT (broken):
roles: ['employee', 'manager', 'admin', 'auditor', 'management']

// REQUIRED:
roles: ['employee', 'manager', 'admin', 'auditor', 'management', 'hr_pms', 'skip_level']
```

**Impact:** Vivek (hr_pms) and any skip_level users cannot see the Inbox link in the sidebar at all. This was identified earlier but not yet applied.

---

### Gap 2 — AuthContext: `skip_level` is not a recognized `AppRole`

**File:** `src/contexts/AuthContext.tsx`, line 7

```ts
// CURRENT:
type AppRole = 'admin' | 'manager' | 'employee' | 'auditor' | 'management' | 'hr_pms';
// skip_level is MISSING
```

`skip_level` is a valid `app_role` enum value in the database (the `has_role()` function and RLS policies reference it), but the frontend `AppRole` type doesn't include it. This means:
- `effectiveRole` can never be `'skip_level'`
- Any sidebar item listing `'skip_level'` in its roles array would never match
- `ProtectedRoute` also has `AppRole` defined without `skip_level` — same problem

**Impact:** Skip-level managers are a half-implemented role — the database knows them but the frontend doesn't. They likely log in as `employee` (since their `user_roles` row says `skip_level` which the frontend doesn't recognize). This needs to be evaluated: are any users currently assigned the `skip_level` role, and how should the app handle them?

---

### Gap 3 — My Dashboard menu item: `skip_level` missing

**File:** `src/components/layout/AppSidebar.tsx`, line 56

```ts
roles: ['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms']
// skip_level missing — skip_level users cannot see the main Dashboard link
```

---

### Gap 4 — `useOpenQueryCount`: Only counts queries `raised_to` the user

**File:** `src/hooks/useOpenQueryCount.ts`

The badge count only counts queries where the current user is the recipient (`raised_to`). This is correct for the badge (it shows pending action needed). However, for `hr_pms` and `auditor` roles who can see ALL queries, the badge count may be misleading — they may have open queries in their supervisory view that aren't counted. This is a UX gap, not a breakage.

---

### Gap 5 — RLS on `kpi_queries`: `skip_level` SELECT policy has no INSERT or UPDATE

The `kpi_queries` table has a SELECT policy for skip-level but skip-level users cannot:
- Create queries themselves (INSERT policy only allows `raised_by = auth.uid()` — but this is fine, they can raise queries)
- Resolve/update queries (UPDATE policy only allows `raised_to = auth.uid()`)

Actually on re-examination: the `raised_by = auth.uid()` INSERT check is correct — anyone can raise a query. The UPDATE (`raised_to = auth.uid()`) is also correct — only the recipient can respond. **No gap here.**

---

### Gap 6 — `kpi_queries` Team Tab: `useSubordinateQueries` uses `reporting_manager_id`

The "Team" tab in Inbox uses `useSubordinateQueries` which fetches queries raised **to direct reports** (people whose `reporting_manager_id = current user`). Skip-level managers don't show up as anyone's `reporting_manager_id` — they are the manager's manager. So skip-level users see an empty Team tab even if they should see subordinate queries. This is a functional gap.

---

### Gap 7 — `notifications` RLS: Only `user_id = auth.uid()` SELECT policy

The `notifications` table is fully scoped to `user_id`. This is **correct and safe** — notifications are always inserted for a specific user, so there is no RLS gap for the Inbox notification tab.

---

### Gap 8 — `kpi_queries` RLS: INSERT check only verifies `raised_by = auth.uid()`

Any authenticated user can create a query (INSERT) as long as `raised_by` is their own UID. The `raised_to` can be any user ID. This means an `hr_pms` user can raise a query and have it appear in the recipient's Inbox. **No gap — this is correct behavior.**

---

## Root Cause Summary

| # | Layer | Gap | Affected Roles | Severity |
|---|---|---|---|---|
| 1 | Sidebar | `hr_pms` & `skip_level` missing from Inbox roles array | hr_pms, skip_level | Critical |
| 2 | AuthContext + ProtectedRoute | `skip_level` not in `AppRole` type | skip_level | High |
| 3 | Sidebar | `skip_level` missing from My Dashboard roles | skip_level | High |
| 4 | UX | Badge count doesn't reflect supervisory queries for hr_pms/auditor | hr_pms, auditor | Low |
| 5 | Team Tab | Skip-level users can't see subordinate chain queries | skip_level | Medium |

---

## CAPA Plan — Corrective & Preventive Actions

### Fix 1 — Sidebar: Add `hr_pms` and `skip_level` to Inbox menu item

**File:** `src/components/layout/AppSidebar.tsx`

Change the Inbox item roles from:
```ts
roles: ['employee', 'manager', 'admin', 'auditor', 'management']
```
To:
```ts
roles: ['employee', 'manager', 'admin', 'auditor', 'management', 'hr_pms', 'skip_level']
```

Also add `'skip_level'` to the **My Dashboard** menu item roles.

**Safety:** The `/queries` route has no `ProtectedRoute` guard — it renders for all authenticated users. Adding roles to the sidebar only makes the link visible; it doesn't grant unauthorized access.

---

### Fix 2 — AuthContext & ProtectedRoute: Add `skip_level` to `AppRole` type

**Files:** `src/contexts/AuthContext.tsx`, `src/components/layout/ProtectedRoute.tsx`

```ts
// BEFORE:
type AppRole = 'admin' | 'manager' | 'employee' | 'auditor' | 'management' | 'hr_pms';

// AFTER:
type AppRole = 'admin' | 'manager' | 'employee' | 'auditor' | 'management' | 'hr_pms' | 'skip_level';
```

This ensures that when the app reads `user_roles` and gets `skip_level`, it properly sets `effectiveRole = 'skip_level'` instead of leaving it `null` or unrecognized.

**Safety:** `skip_level` is already a valid enum in the database (`app_role`). Adding it to the frontend type only makes the app correctly recognize existing DB values. No behavior changes for any other role.

---

### Fix 3 — AppSidebar: Add `skip_level` conditional for rendering sidebar sections

**File:** `src/components/layout/AppSidebar.tsx`

The sidebar already has a `Manager` section that includes managers. Skip-level users should see the same Team Reviews section (since they review upward from managers):

```ts
// CURRENT — Manager section only shows for manager, management, admin:
{(effectiveRole === 'manager' || effectiveRole === 'management' || effectiveRole === 'admin') && (
  <CollapsibleSidebarGroup label="Manager" items={menuItems.manager} ... />
)}

// ADD skip_level to this condition:
{(effectiveRole === 'manager' || effectiveRole === 'management' || effectiveRole === 'admin' || effectiveRole === 'skip_level') && (
  <CollapsibleSidebarGroup label="Manager" items={menuItems.manager} ... />
)}
```

---

### Fix 4 — `useSubordinateQueries`: Extend Team tab for skip-level managers

**File:** `src/hooks/useQueryWorkflow.ts`

The current query fetches subordinates using `reporting_manager_id = user.id`. A skip-level manager manages the managers below them. To show the full chain of subordinate queries, we can use the existing `get_skip_level_manager()` DB function which already identifies skip-level relationships.

The fix: after fetching direct subordinates (people whose manager is the current user), also fetch **indirect subordinates** (people whose manager's manager is the current user) using a two-level profile lookup. This gives skip-level managers visibility of their entire reporting chain in the Team tab.

**Safety:** The fetch is read-only SELECT. The RLS `Skip-level managers can view reports queries` policy already allows this data to be returned. The fix just expands the client-side ID list to include the indirect chain.

---

### Fix 5 — Preventive: Create a centralized `ALL_ROLES` constant

**File:** New constant in `src/lib/reviewConstants.ts` (or a new `src/lib/roles.ts`)

To prevent future role-omission bugs, define a single source of truth:

```ts
export const ALL_APP_ROLES = ['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms', 'skip_level'] as const;
export type AppRole = typeof ALL_APP_ROLES[number];
```

Then import and use this in `AuthContext`, `ProtectedRoute`, and sidebar items wherever all roles are needed. This prevents the recurring pattern where a new role is added to the database but forgotten in one or more frontend files.

---

## Files to Change

| File | Change | Risk |
|---|---|---|
| `src/components/layout/AppSidebar.tsx` | Add `hr_pms` + `skip_level` to Inbox roles; add `skip_level` to My Dashboard roles; add `skip_level` to Manager section condition | Low — purely additive |
| `src/contexts/AuthContext.tsx` | Add `skip_level` to `AppRole` type | Low — makes existing DB enum value recognized |
| `src/components/layout/ProtectedRoute.tsx` | Add `skip_level` to local `AppRole` type | Low — type-only change |
| `src/hooks/useQueryWorkflow.ts` | Extend `useSubordinateQueries` to include skip-level chain | Medium — adds extra DB fetch, no mutations |
| `DOCUMENTATION.md` | Version bump to 1.45.29 | None |

---

## CAPA: Preventing Future Role Gaps

The recurring pattern is: new roles are added to the database but not propagated to all frontend `AppRole` type definitions and menu items. The preventive action is:

1. The centralized `ALL_APP_ROLES` constant (Fix 5) means only one file needs updating when a role is added.
2. Add a comment block above each menu item listing: `// NOTE: Keep this list in sync with ALL_APP_ROLES in src/lib/reviewConstants.ts`.
3. The sidebar's `filterByRole` already handles the filtering — the only maintenance point is the roles arrays in `getStaticMenuItems`.

## Expected Outcome After Fix

| Role | Inbox Visible | Notifications Tab | Queries Tab | Team Tab | Badge Count |
|---|---|---|---|---|---|
| employee | Yes | Yes | Yes | Empty (no direct reports) | Correct |
| manager | Yes | Yes | Yes | Shows subordinate queries | Correct |
| skip_level | Yes (after fix) | Yes | Yes | Shows chain queries (after fix) | Correct |
| hr_pms | Yes (after fix) | Yes | Yes | Empty (by design) | Correct |
| auditor | Yes | Yes | Yes | Empty (by design) | Correct |
| management | Yes | Yes | Yes | Empty (by design) | Correct |
| admin | Yes | Yes | Yes | Shows all (via RLS) | Correct |

No existing working features are broken because all changes are:
- Purely additive type expansions
- Sidebar visibility additions (not removals)
- A read-only DB query extension
