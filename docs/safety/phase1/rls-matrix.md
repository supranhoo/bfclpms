# RLS Matrix — Safety Tables × Roles

**Method:** `pg_class.relrowsecurity` + `pg_policies` filtered to `safety_*`.
**Roles enum (`safety_app_role`):** `admin`, `safety_head`, `safety_officer`,
`bu_head`, `manager`, `supervisor`, `worker`, `auditor`.

## RLS-enabled status

All 33 `safety_*` tables have RLS **enabled** (`relrowsecurity = true`). ✅

## Policy coverage

- Total policies on `safety_*`: **75**.
- All tables have at least one SELECT and at least one write policy
  (`ALL` or explicit INSERT/UPDATE/DELETE).
- Policies use the `has_safety_role(uid, role[, bu_id])` SECURITY DEFINER
  helper. No recursive policy patterns detected.

## Read access pattern (typical)

| Table family | Reader roles |
|---|---|
| Incidents, evidence, timeline | `admin`, `safety_head`, `safety_officer`, `auditor`, and BU-scoped `manager` / `bu_head` / `supervisor` via `can_view_safety_incident` |
| Permits + sub-tables | Same pattern (BU-scoped) |
| Assets + calibrations + asset evidence | Same pattern (BU-scoped) |
| Audit templates / runs / responses | All Safety roles read; writes restricted to officers+ |
| Drills + findings + participants | `has_any_safety_role` read; writes restricted to officers+ / supervisor+ |
| Emergency contacts | `has_any_safety_role` read; writes only `admin` / `safety_head` |
| Training + attempts | Read for trainees; write for officers+ |
| Settings | **Read = `true`** (permissive). Write restricted to `admin`/`safety_head`. |
| Audit log | Read only `admin`. |
| Module access + user roles | Admin-only writes; log trigger on role change. |

## Write access pattern (typical)

- Status mutations go through RPCs (`transition_safety_incident`,
  permit lifecycle fns). Direct UPDATE on `status` blocked by trigger
  guards even if a policy allows.
- All non-status writes guarded by `has_safety_role(...admin|safety_head|safety_officer)`.

## Findings

### F-RLS-01 — `safety_settings` SELECT is permissive

- **Policy:** `safety_settings_select` USING `true` for role `public`.
- **Risk:** Low. Settings store non-PII configuration (SLA windows,
  default reviewers). It is intentionally readable by any signed-in user
  so the app shell can render correctly without a Safety role.
- **Disposition:** **Accept** for now; revisit if any sensitive setting
  is added. Document in `mem://features/safety/hardening-baseline`.
- **Action:** none in Phase 1.

### F-RLS-02 — `drill_*` and `emergency_*` policies target role `{public}` instead of `{authenticated}`

- **Risk:** Low — `qual` still requires `has_safety_role(auth.uid(),…)`,
  so `auth.uid()` is NULL for anonymous and predicate fails.
- **Disposition:** **Defer** to a tidy-up pass (cosmetic consistency
  with the `{authenticated}` convention used elsewhere). Not a Phase 1
  blocker.

No other RLS gaps detected. RLS posture is **GREEN** for Phase 2 gating.