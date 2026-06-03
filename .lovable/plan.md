## Goal
Verify the new Platform Owner implementation is safe and grant Platform Owner to the existing PMS admin(s) **without removing or breaking their `admin` role**. Keep enforcement OFF (`hub_platform_settings_enabled = "false"`) until you explicitly confirm activation in a follow-up turn.

## Findings (read-only checks already done)

1. **Enum** — `app_role` already contains `platform_owner` (8 roles total). ✅
2. **`user_roles` table** — Unique constraint is `(user_id, role)` (composite). The schema **does support multiple roles per user**. ✅
3. **`AuthContext.fetchRole`** — Uses `.single()` on `user_roles`. ❌ This is the **single biggest risk**: if we naively insert a second `user_roles` row for an existing admin, `.single()` will throw and the admin can no longer log in.
4. **`PlatformOwnerRoute`** — Checks `role !== 'platform_owner'` strictly. An admin who is also platform_owner would either lose admin (if we swap) or fail this check (if we keep admin as primary). Needs `hasRole()` style check.
5. **Existing admins in DB** — 3 rows: Jaspal, Ankit Choudhary, Vivek Kumar Dansena. None currently have `platform_owner`.
6. **Feature flag** — `hub_platform_settings_enabled` is OFF, so `useEntitlement` returns allow-all and `/platform-settings` returns 404 even after role grants. Good safety net.

## Risk & Impact Report

- **Data impact**: Only additive `user_roles` rows. No deletes, no schema breaks.
- **Workflow impact**: None. PMS workflow, KPI, scoring, menu, RLS for admin remain unchanged.
- **Auth impact (HIGH if mishandled)**: `.single()` must be replaced with multi-row fetch **before** inserting the second role row, or admin login breaks. Mitigation: ship the auth refactor in the same change set, behind a safe "primary role" derivation that preserves existing behavior.
- **Regression risk**: Low — `role` continues to expose a single primary `AppRole` (priority: `admin` > `platform_owner` > others), so every existing `role === 'admin'` check keeps working unchanged.
- **Scalability**: Trivial — one extra row read per session.
- **Rollback**: Delete the new `user_roles` rows; revert AuthContext patch. Both reversible.

## Plan (Phase A — safety refactor, no activation)

### Step 1 — Refactor `AuthContext` to support multi-role (backward compatible)
File: `src/contexts/AuthContext.tsx`
- Replace `.single()` with a list fetch: `.from('user_roles').select('role').eq('user_id', userId)`.
- Add new state `roles: AppRole[]`.
- Derive **primary `role`** from a fixed priority list so existing PMS checks keep working:
  `['admin', 'platform_owner', 'hr_pms', 'management', 'auditor', 'skip_level', 'manager', 'employee']`.
  An admin+platform_owner user → `role === 'admin'` exactly as today.
- Expose new helpers on context:
  - `roles: AppRole[]`
  - `hasRole(r: AppRole): boolean`
  - `isAdmin: boolean`
  - `isPlatformOwner: boolean`
- Keep existing `role`, `effectiveRole`, `naturalRole`, `isAdminMode`, `toggleAdminMode` exactly as today.
- Verification: existing admin logs in → `role==='admin'`, all PMS pages load.

### Step 2 — Update `PlatformOwnerRoute` to use `hasRole`
File: `src/components/layout/PlatformOwnerRoute.tsx`
- Change `role !== 'platform_owner'` → `!hasRole('platform_owner')`.
- Keep the `hubEnabled` master switch gate (feature flag still OFF, so route stays 404 for everyone until activated).
- Verification: with flag OFF, route 404s for all users including admins.

### Step 3 — Update Module Hub card visibility
File: `src/pages/ModuleHub.tsx` (and any spot showing the Platform Settings card)
- Replace `role === 'platform_owner'` with `hasRole('platform_owner') && hubEnabled`.
- Verification: with flag OFF, card hidden for everyone. With flag ON, visible only to users explicitly granted `platform_owner`.

### Step 4 — Grant `platform_owner` to existing PMS admins (additive)
Database `insert` (NOT a migration — pure data):
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT ur.user_id, 'platform_owner'::app_role
FROM public.user_roles ur
WHERE ur.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ur.user_id AND ur2.role = 'platform_owner'
  );
```
- Idempotent (skips users who already have it).
- Only touches existing admins (Jaspal, Ankit, Vivek). New future admins do NOT auto-get platform_owner.
- Verification: re-query `user_roles` shows each admin has both `admin` and `platform_owner` rows; their primary `role` in app is still `admin` (priority).

### Step 5 — Recovery / break-glass note
Append a commented SQL block to `mem://features/platform/hub-foundation` so an operator can re-grant platform_owner from `psql` if needed:
```sql
-- Break-glass: grant platform_owner to a specific admin by email
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'platform_owner'::app_role
FROM public.profiles p
WHERE p.email = '<admin-email>'
ON CONFLICT (user_id, role) DO NOTHING;
```

### Step 6 — Tests (extend `src/test/platformFoundation.test.ts`)
- Primary-role derivation: `[admin, platform_owner]` → `admin`.
- `hasRole('platform_owner')` true for admins after grant.
- `hasRole('platform_owner')` false for manager/employee.
- Existing 5 tests still pass.

### Step 7 — Documentation
- `DOCUMENTATION.md`: note multi-role support, priority order, and `hasRole/isPlatformOwner` API.
- `POLICY.md`: note that `platform_owner` is additive, never replaces `admin`, and that Hub routes require BOTH role grant AND the `hub_platform_settings_enabled` flag.
- Update `mem://features/platform/hub-foundation`.

## What this plan does NOT do (deferred to your explicit go-ahead)

- Does **NOT** flip `hub_platform_settings_enabled` to `"true"`. The Hub Settings UI stays 404 / hidden until you confirm activation in the next turn.
- Does **NOT** enforce any entitlement against PMS. Observe-only mode remains intact.
- Does **NOT** change RLS on PMS tables, menu_access, workflow, scoring, or reports.
- Does **NOT** grant `platform_owner` to managers, employees, or future admins automatically.

## Activation handshake (next turn)
After this plan is implemented and you have confirmed login still works for the three admins, I will ask again:
> "Ready to activate? Set `hub_platform_settings_enabled = 'true'` so admins (now also platform_owner) can open `/platform-settings`?"
Only then will the Hub UI become reachable.

## Acceptance criteria
- All 3 existing PMS admins retain `admin` and gain `platform_owner` (additive).
- Existing admin login, dashboard, system settings, menus — unchanged.
- `useAuth().role` still returns `'admin'` for them (no broken `role === 'admin'` checks anywhere).
- `useAuth().hasRole('platform_owner')` returns `true` for them, `false` for others.
- With flag OFF (current state), `/platform-settings` returns 404 for everyone — no behavior change yet.
- Managers, employees, auditors, etc. are not Platform Owners.
- Refactor is reversible by removing the new `user_roles` rows and reverting the AuthContext patch.
