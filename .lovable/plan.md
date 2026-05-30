
# Fixes — Incident submission, Safety user search, Users & Roles UX

## Risk & Impact Report

| Area | Impact | Risk | Mitigation |
|------|--------|------|------------|
| Incident submit path | Avinash (101732) and any user on stale/expired session | Low — RPC bypass already deployed | Force session refresh before submit, surface friendlier error, lock direct-insert regression |
| Safety user search (SafetyUsers) | Admins granting Safety roles | Low — purely FE change | Deferred-fetch pattern matches other Safety lists |
| Profiles RLS for Safety admins | Safety admins who are NOT PMS admins currently see 0 users (root cause of "search not working") | Low — additive read policy gated by `has_safety_role(_, 'admin')` | Policy scoped to active profiles only; SELECT-only; idempotent CREATE POLICY IF NOT EXISTS |
| Combobox dropdown | UX only | Low | Reuse existing shadcn `Popover` + `Command` (cmdk) |

No schema changes. No destructive ops. Rollback = revert FE files + `DROP POLICY`.

---

## Issue 1 — Incident submission fails for 101732

### RCA (verified against live DB)
- `public.report_safety_incident(jsonb)` exists, is `SECURITY DEFINER`, owner `postgres` with `rolbypassrls = true` → INSERT inside the RPC cannot raise the RLS error.
- Trigger `safety_incident_before_insert` already stamps `NEW.reporter_id := auth.uid()`.
- Current FE (`useSafetyIncidents.ts`, `safetyIncidentSubmit.ts`) routes through the RPC.
- The user's "new row violates row-level security policy for table safety_incidents" can only originate from:
  1. A **stale published bundle / cached PWA** still calling `.from('safety_incidents').insert(...)` directly, **or**
  2. An **expired/missing JWT** at submit time → `auth.uid()` is NULL → trigger no-op → WITH-CHECK `reporter_id = auth.uid()` fails (42501).

### Fix
1. **Pre-submit auth refresh** in `SafetyIncidentNew.tsx`: call `supabase.auth.getSession()`; if missing/expired, attempt `refreshSession()`. If still missing, show "Session expired — please sign in again" and bail before submit. Same in the offline-queue flush.
2. **Friendlier error mapping** in `safetyIncidentSubmit.ts` — translate Postgres `42501` / "row-level security" into "Your session expired or your account no longer has permission to report incidents. Please sign in again."
3. **Regression lock** — new test `src/test/safety/noDirectIncidentInsert.test.ts` greps `src/**` and fails the build if any non-test file calls `.from('safety_incidents').insert(`.
4. **Publish** — republishing pushes the RPC-only bundle and busts the PWA cache, which resolves cause (1) for any user still on the old SW.

### 5-Whys
1. Why RLS error? → Insert reached the table with `reporter_id ≠ auth.uid()`.
2. Why? → Either no auth context (NULL uid) or stale bundle doing direct insert.
3. Why no auth context? → Mobile PWA cached session expired; submit fired before refresh.
4. Why no graceful handling? → FE didn't pre-validate session, error wasn't mapped to user language.
5. Why bundle stale? → No regression test prevents a future direct-insert; PWA SW cached old JS.

---

## Issue 2 — Safety module: search should fire only on explicit Search click

### Scope (verified)
- `SafetyIncidents`, `SafetyPermits`, `SafetyAuditLog`, `SafetyAssets` already use `SafetyFilterBar` / `SafetyFilterSheet` (draft state → Search button) ✅
- Only **`SafetyUsers`** (`/safety/settings/users`) still auto-refetches on every keystroke via `queryKey: [..., search]`.

### Fix
Apply the same deferred pattern:
- Split state into `draftSearch` (input) and `appliedSearch` (query key).
- `useQuery` uses only `appliedSearch`.
- "Search" button + Enter inside the input set `appliedSearch = draftSearch`.
- "Reset" clears both and selection.

No changes to other Safety pages.

---

## Issue 3 — Users & Roles search and dropdown

### Problem A — Search returns nothing for non-PMS-admin Safety admins
Profiles RLS has no policy that grants a **Safety admin** read access. Result: empty list regardless of input. (Verified against live `pg_policy`.)

**Fix (migration):** Additive SELECT policy on `public.profiles`:

```sql
CREATE POLICY "Safety admins can view active profiles for role grants"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND public.has_safety_role(auth.uid(), 'admin')
);
```

Scoped to `is_active = true` and the Safety-admin role only. No PII columns added.

### Problem B — Inline result list stays open / no Esc / no outside-close
Current UI renders an always-visible scrollable `<div>` of buttons below the input.

**Fix:** Replace with a `Popover` + `Command` (cmdk) combobox:
- Trigger: the existing input (read-only display of selected user) inside `PopoverTrigger`.
- Content: `Command` with `CommandInput` (the actual search box), `CommandList`, `CommandEmpty`, `CommandGroup` of users.
- Selecting an item → `onSelect` sets `selectedUserId` and calls `setOpen(false)`.
- `Popover` natively closes on outside click and Esc; arrow-key nav via cmdk.
- Combined with Issue 2's deferred-search: the popover's `CommandInput` updates `draftSearch`; a small "Search" affordance (or Enter) commits to `appliedSearch`. For combobox UX clarity we'll keep the Search button visible inside the popover footer.

---

## Files to change

**Code**
- `src/pages/safety/SafetyIncidentNew.tsx` — pre-submit session refresh + bail-on-no-session.
- `src/lib/safetyIncidentSubmit.ts` — friendly error mapping for 42501 / "row-level security".
- `src/pages/safety/SafetyUsers.tsx` — deferred search + Popover/Command combobox.

**Migration**
- `supabase/migrations/<ts>_safety_admin_profiles_read.sql` — add SELECT policy above.

**Tests**
- `src/test/safety/noDirectIncidentInsert.test.ts` — regression: no FE direct insert into `safety_incidents`.
- `src/test/safety/safetyUsersDeferredSearch.test.tsx` — typing does not fetch; clicking Search does.
- `src/test/safety/safetyAdminProfilesRead.test.ts` — pins the migration SQL (policy name, SELECT-only, `is_active = true`, `has_safety_role(_, 'admin')`).

**Docs / Memory**
- `DOCUMENTATION.md` — add Phase 19.1 entry (Safety-admin profiles read; SafetyUsers deferred search & combobox; incident submit hardening).
- `POLICY.md` — §Safety-Access: Safety admins may read active profiles for role-grant UX.
- `mem/architecture/safety/rbac.md` — add the new policy.
- `mem/features/safety/incident-submission-rpc.md` — note pre-submit session refresh + error mapping.
- `mem/index.md` — reference new memory entries if added.

## Out of scope
- No changes to Safety RBAC enums, no auto-grant of any Safety role.
- No edits to other Safety list pages (already compliant with deferred-search rule).
- No redesign of `SafetyUsers`; only the user picker becomes a combobox, role select and assignments table are unchanged.
