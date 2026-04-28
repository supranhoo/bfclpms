# Fix: DataOwnerRoute Honors Per-User Menu Overrides (BUG-041)

## Problem (Confirmed)

Three pieces of the Org KPI Data Entry access chain disagree:

| Layer | File | Behavior |
|---|---|---|
| Override storage | `src/hooks/useMenuAccess.ts` | Loads `menu_access_user_overrides` keyed by `(menu_key, user_id)`. |
| Sidebar (just fixed in BUG-040) | `src/components/layout/AppSidebar.tsx` line 309 | Shows **Data Entry** when `isDataOwner` OR a per-user override on `menuKey="data-entry"` exists. |
| Route guard | `src/components/layout/DataOwnerRoute.tsx` line 25 | Only admits `admin` or `isDataOwner`. **Ignores overrides.** Redirects everyone else to `/dashboard`. |

Net effect: an admin can grant a non-owner explicit access via the user-override table, the sidebar dutifully shows the link, but clicking it bounces the user to `/dashboard`. The override path is half-implemented.

## Root Cause

`DataOwnerRoute` was written before the user-override layer existed and was not revisited when overrides became part of the Data Entry admit policy. Single-source-of-truth violation between sidebar gate and route guard.

## Fix

Make `DataOwnerRoute` consult the same admit signals the sidebar uses, so a user is admitted iff:

1. `effectiveRole === 'admin'`, OR
2. `isDataOwner` is true, OR
3. The user has an explicit per-user override on the `data-entry` menu key, OR
4. The user has profile-based view rights on `data-entry` (Layer 2 of `useMenuAccess`).

Conditions 3 and 4 are already exposed by `useMenuAccess` via `canPerform('data-entry', 'view')`, which returns true for: admin, profile-rights `can_view`, or any `canAccess` admit. To stay strict (we don't want role-default admit to leak in here, mirroring BUG-040 reasoning), we'll directly check (a) `userOverrides` for a row matching `(menu_key='data-entry', user_id=user.id)` and (b) the profile-rights map. Both are already loaded by the same hook.

### Code change (single file, `src/components/layout/DataOwnerRoute.tsx`)

```tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAnyOrgKpiDataOwner } from '@/hooks/useOrgKpiDataOwner';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { Loader2 } from 'lucide-react';

const DATA_ENTRY_MENU_KEY = 'data-entry';

export function DataOwnerRoute({ children }: { children: React.ReactNode }) {
  const { user, effectiveRole, loading: authLoading } = useAuth();
  const { data: isDataOwner, isLoading: ownerLoading } = useIsAnyOrgKpiDataOwner();
  const { userOverrides, canPerform, isLoading: menuLoading } = useMenuAccess();

  if (authLoading || ownerLoading || menuLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (effectiveRole === 'admin') return <>{children}</>;
  if (isDataOwner) return <>{children}</>;

  // Per-user explicit override (admin granted this user access)
  const hasUserOverride = !!user?.id && userOverrides.some(
    o => o.menu_key === DATA_ENTRY_MENU_KEY && o.user_id === user.id
  );
  if (hasUserOverride) return <>{children}</>;

  // Profile-based view right (admin granted via access profile)
  if (canPerform(DATA_ENTRY_MENU_KEY, 'view')) return <>{children}</>;

  return <Navigate to="/dashboard" replace />;
}
```

Notes:
- We add `menuLoading` to the loader gate so we don't redirect prematurely while `userOverrides` / `profileRights` are still fetching (otherwise overridden users would briefly fail the check on first paint).
- `canPerform` for non-admins only returns true when the profile right's `can_view` is true (it does NOT fall through to role-default for actions other than `view` admit). We accept that profile-`view`=true grants route access — same policy as the sidebar after BUG-040.

### Sidebar parity tweak (consistency)

`AppSidebar.tsx` Data Entry filter (post-BUG-040) currently checks only `isDataOwner || hasUserOverride`. To keep the sidebar and route admit policies symmetric, also admit when the profile grants `can_view` on `data-entry`:

```ts
return Boolean(isDataOwner) || hasUserOverride || canPerform('data-entry', 'view');
```

(`canPerform` is already returned by `useMenuAccess`; just destructure it.)

## Risk & Impact Report

- **Data Impact**: None. UI-only access policy alignment.
- **Workflow Impact**: Users who were granted explicit overrides or profile-based view rights on `data-entry` can now actually reach `/admin/org-kpi-data` (previously bounced). No new users gain access beyond what an admin already explicitly configured. RLS at the database remains the authoritative server-side guard for what they can read/write on the page.
- **UI/UX Consistency**: Sidebar and route now share one admit policy — no more menu-shows-but-redirects loop in the override direction.
- **Regression Risk**: Low.
  - Admins: unchanged (early return).
  - Data owners: unchanged.
  - Non-owners with no override / no profile view right: unchanged (still redirected).
  - Loading: now waits for `useMenuAccess` to settle (one extra short query already fired by the sidebar layout, so it's typically cached and adds no measurable delay).
- **Mitigation**: Regression test (BUG-041) below pins the new admit predicates.

## SSOT / Documentation Sync

- `DOCUMENTATION.md` — new `v2.66.7.43` entry under Version History describing BUG-041 and the symmetric admit policy.
- `POLICY.md` §111 — extend the rule statement: "When a route is gated by ownership, the route guard MUST admit the same set the sidebar admits (data owner OR explicit per-user override OR profile-based view right). Admit predicates must live in a single shared helper or the same hook (`useMenuAccess`) and never drift between sidebar and route."
- `mem/index.md` — the existing **Profile-Based Menu Access** entry already covers Layer 2; no new memory file needed.

## Tests

Add to `src/test/bugBountyFixes.test.ts` (BUG-041) — keep the static-source assertion style consistent with BUG-038 / 039 / 040:

- Source of `DataOwnerRoute.tsx` references `useMenuAccess`, `userOverrides`, and the literal `'data-entry'` menu key.
- It calls `canPerform('data-entry', 'view')`.
- It still includes the `isDataOwner` and `effectiveRole === 'admin'` admit branches.
- Loading guard includes `menuLoading` (or equivalent destructured `isLoading` from `useMenuAccess`).

## Files Touched

- `src/components/layout/DataOwnerRoute.tsx` (admit policy expansion)
- `src/components/layout/AppSidebar.tsx` (one-line parity tweak: also admit on profile view right)
- `src/test/bugBountyFixes.test.ts` (BUG-041 regression test)
- `DOCUMENTATION.md`, `POLICY.md` (SSOT sync)
