
# Expand access to the Annual Review "All employees" directory

## Goal

Widen access to the directory search (`search_active_employees_for_review`) and instance creation (`create_or_get_annual_review_instance`) beyond Admin / HR PMS, so more people can assist with form-filling.

New access matrix (per your answers):

| Actor | Scope | Write (add to phase) |
| --- | --- | --- |
| Admin | All employees | Yes |
| HR PMS role | All employees | Yes |
| Any active user whose `business_unit_id` = `org_head_config.hr_business_unit_id` ("HR team") | All employees | Yes |
| BU Head (`business_units.head_user_id`) | Only employees whose `profiles.business_unit_id` = that BU | Yes |
| HOD (`departments.head_user_id`) | Only employees whose `profiles.department_id` is inside their BU (i.e. any dept sharing the HOD's `business_unit_id`) | Yes |

All other users: no access (unchanged).

The `annual_review_directory_search_enabled` feature flag continues to gate the entire UI entry point.

---

## Risk & Impact Report

- **Data Impact:** No schema changes. Two RPCs (`search_active_employees_for_review`, `create_or_get_annual_review_instance`) get a wider `SECURITY DEFINER` authorization branch plus a scope filter on the search. `org_head_config`, `business_units`, `departments` are read via the resolver — no writes.
- **Workflow Impact:** More roles can seed `annual_review_instances`. Audit log payload (`system_audit_logs.annual_review.instance.auto_created`) gains an `actor_scope` field (`admin` | `hr_pms` | `hr_team` | `bu_head` | `hod`) so reviewers can see who added each employee and under what authority.
- **UI/UX Impact:** `TeamAnnualReview.tsx` gate `canSearchDirectory` widens from `isAdmin || hasRole('hr_pms')` to a resolver hook `useCanSearchDirectory()` that also returns the scope (`all` | `bu:<id>`). The "All employees" button appears for all four groups. No layout changes.
- **Regression Risk:** Low. The Admin / HR PMS branch is unchanged; new branches are additive. Directory listing already returns only `is_active = true` rows, and the new scope filter is an additional `AND`.
- **Scalability Impact:** Scope check is `EXISTS` against `business_units` / `departments` / `org_head_config` (indexed by PK / `head_user_id`); one row per lookup. Search query already has pagination; the scope filter narrows the candidate set, so no new load.
- **Mitigation:** Unit tests per actor type + a SQL smoke test for cross-BU denial. Feature flag stays as the master kill-switch.

---

## Plan

### 1. New SQL helper (SECURITY DEFINER)

`public.annual_review_directory_access(v_uid uuid)` returns a JSONB descriptor:

```json
{ "can_access": true, "scope": "all" | "bu", "business_unit_id": "<uuid|null>" }
```

Resolution order (first match wins):
1. Admin or `hr_pms` role → `scope='all'`.
2. User is in the HR BU (`profiles.business_unit_id = org_head_config.hr_business_unit_id AND profiles.is_active`) → `scope='all'`.
3. User is a BU head (`business_units.head_user_id = v_uid`) → `scope='bu', business_unit_id=<that BU>`.
4. User is an HOD (`departments.head_user_id = v_uid`) → `scope='bu', business_unit_id=<that department's business_unit_id>`.
5. Otherwise → `can_access=false`.

Marked `STABLE SECURITY DEFINER`, grant `EXECUTE` to `authenticated`. Deterministic tiebreak: if a user is both HOD and BU head, BU-head wins (same scope shape, higher rank).

### 2. Patch `search_active_employees_for_review`

- Replace the hard `admin OR hr_pms` check with a call to `annual_review_directory_access(v_uid)`. Deny when `can_access=false`.
- When `scope='bu'`, add `AND p.business_unit_id = <resolved bu>` to the `WHERE` clause. `scope='all'` behaves exactly as today.
- Signature and result shape unchanged (idempotent replace, no client change).

### 3. Patch `create_or_get_annual_review_instance`

- Same authorization swap.
- When `scope='bu'`, re-fetch the target employee's `business_unit_id` and raise `permission denied: employee outside your business unit` if it doesn't match.
- Add `"actor_scope"` to the audit log payload.

### 4. Frontend

- New hook `src/hooks/useDirectoryAccess.ts` — calls a lightweight RPC wrapper (`get_annual_review_directory_access`) or reads the same resolver via a `.rpc()`; returns `{ canAccess: boolean, scope: 'all' | 'bu', businessUnitId: string | null }`. Cached with `staleTime: 5 min` on `user.id`.
- `src/pages/annual-review/TeamAnnualReview.tsx`: replace `const canSearchDirectory = isAdmin || hasRole('hr_pms')` with `useDirectoryAccess()`. Feature flag check unchanged. The button label/tooltip clarifies scope for BU-scoped users: "All employees in <BU name>".
- `EmployeeDirectoryDialog` needs no change — the server already enforces scope; the dialog just shows fewer results.

### 5. Tests

- `src/test/annualReview/directoryAccess.test.ts` — unit test the resolver behavior via mocked RPC for all five branches (admin / hr_pms / hr-team / bu-head / hod / none).
- `src/test/annualReview/employeeDirectory.test.ts` — extend with two cases: BU-head sees only same-BU rows; cross-BU add-to-phase throws.
- Mock data: at least one profile in HR BU, one BU head, one HOD, one out-of-scope employee.

### 6. Docs & Policy (mandatory SSOT sync)

- `DOCUMENTATION.md` → Annual Review › Directory Search: update the access matrix and note the resolver + audit `actor_scope`.
- `POLICY.md` → add **§AR-DIRECTORY-ACCESS-MATRIX**: authoritative list of who can search / add-to-phase and under what scope, with the tiebreak rule.

---

## Files touched

- New migration: create `annual_review_directory_access` resolver + patched RPCs (idempotent `CREATE OR REPLACE`).
- `src/hooks/useDirectoryAccess.ts` (new)
- `src/pages/annual-review/TeamAnnualReview.tsx` (gate swap + tooltip)
- `src/test/annualReview/directoryAccess.test.ts` (new)
- `src/test/annualReview/employeeDirectory.test.ts` (extend)
- `DOCUMENTATION.md`, `POLICY.md`

## Rollback

Revert-safe: the migration re-uses `CREATE OR REPLACE` for both RPCs; a follow-up migration restoring the original `admin OR hr_pms` check and dropping the resolver reverses the change with zero data loss. Feature flag can be turned off immediately as a kill-switch without a code change.

## Out of scope

- No changes to reviewer-chain seeding, phase seeding rules, or the resolver-based audience filter shipped previously.
- No new user role in `app_role`; HR-team membership is derived from BU assignment, per your answer.
