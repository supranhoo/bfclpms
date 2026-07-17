## Error
`Failed to update user — insert or update on table "user_roles" violates foreign key constraint "user_roles_user_id_fkey"` when saving the Edit User dialog for **Kameshwar Rai (emp 100431)**.

## 5-Why Analysis
1. **Why did saving fail?** The `set_functional_role` RPC tried to `INSERT INTO public.user_roles (user_id, role)` for this user.
2. **Why did the INSERT fail?** `user_roles.user_id` has a FK to `auth.users(id)`, and no matching `auth.users` row exists for this user.
3. **Why is there no `auth.users` row?** Kameshwar Rai is a **non-login (backfilled) employee** — profile exists, email is NULL, `auth.users` was never provisioned (canonical Non-Login User Provisioning pattern, POLICY §113).
4. **Why did the code attempt a role write anyway?** `updateUser` in `UserManagement.tsx` unconditionally calls `setFunctionalRole(userId, role)` after any profile edit. The RPC has no guard for "target user has no login".
5. **Why is there no guard?** The role subsystem was designed pre-§113, assuming every profile has an `auth.users` counterpart. It was never revisited when non-login provisioning was introduced.

## Root Cause
`public.set_functional_role` is missing a Non-Login-User guard. Any admin edit of a backfilled employee (2600+ such users) that reaches the role-write step violates `user_roles_user_id_fkey`. Verified in DB: profile `eaf516f8-…` has `has_auth_user=false` and zero `user_roles` rows.

## CAPA (Corrective + Preventive)
**Corrective (single migration, additive, reversible):**
- Update the `set_functional_role` RPC to short-circuit when `auth.users` has no row for `p_user_id`:
  - Skip both the DELETE and INSERT branches.
  - Write an audit row `functional_role_skipped_non_login` (best-effort) so admins can trace the no-op.
  - Return normally so the profile update in `UserManagement.tsx` still succeeds.
- No schema, RLS, or column changes. Function body only.

**Preventive:**
- Regression test `src/test/admin/setFunctionalRoleNonLoginGuard.test.ts` — mocks the RPC contract: non-login user → no-op success; login user → normal path (already covered).
- Schema-truth test extending existing `src/test/admin/userRoleUpdate.test.ts` docs to state the non-login contract.
- Append `DOCUMENTATION.md` v2.66.115 RCA entry.
- Add `POLICY.md` §113a: "Any function that writes to `public.user_roles` MUST first verify `auth.users` has a row for the target user, else no-op."

## Risk & Impact Report
- **Data Impact:** None. RPC body only; no rows mutated by the migration itself.
- **Workflow Impact:** Admin Edit User on non-login employees now succeeds silently on the role step (matches user intent — they were editing profile fields, not granting login).
- **UI/UX Impact:** Removes the misleading red error toast. No visual change.
- **Regression Risk:** Very low. Login users are unaffected — the existing DELETE/INSERT path runs unchanged when `auth.users` row exists. Idempotency and platform-role preservation logic untouched.
- **Scalability Impact:** One extra `EXISTS` probe per role write; negligible.
- **Rollback:** Re-apply the previous function definition (already captured above) via a follow-up migration.

## Out of Scope
- No changes to `UserManagement.tsx` write path (DB guard is the SSOT; UI-side skip would duplicate the rule).
- No changes to `create-user` / `update-user-email` edge functions (they provision `auth.users` first, so they never hit this path).
- No RLS, no other RPCs, no touching PMS/Safety/Annual Review code.

## Deliverables (build mode)
1. Migration: redefine `public.set_functional_role` with non-login guard.
2. `src/test/admin/setFunctionalRoleNonLoginGuard.test.ts` — contract test.
3. `DOCUMENTATION.md` — v2.66.115 entry.
4. `POLICY.md` — §113a guardrail.

## Verification
- Re-run failed action for Kameshwar Rai after migration: profile save succeeds, no toast error, no `user_roles` row created (correct — no login).
- Repeat for a login user (e.g., current admin) → functional role change still lands.
- Existing `userRoleUpdate.test.ts` still green.
