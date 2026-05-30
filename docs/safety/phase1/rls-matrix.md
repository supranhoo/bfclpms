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

### F-RLS-03 — `safety_incidents` INSERT opened to all authenticated users (Phase 16, 2026-05-30)

- **Policy:** `Authenticated users can report incidents` —
  `FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid())`.
- **Replaces:** legacy `Safety users can report incidents` policy that
  required `has_safety_module_access(auth.uid())`. That gate blocked
  ordinary employees (e.g. HR users with no safety role) from filing
  hazard reports — contrary to standard EHS practice where every
  employee must be able to raise an incident.
- **Risk:** Low. `reporter_id = auth.uid()` still prevents impersonation;
  SELECT/UPDATE/DELETE policies are unchanged so reporters can only see
  their own incidents and cannot drive stage transitions. The server
  trigger `safety_incident_before_insert` and the `client_submission_id`
  UNIQUE guard remain in force.
- **Disposition:** **Accept** — intentional access expansion.
- **Regression lock:** `src/test/safety/incidentReportRlsPolicy.test.ts`.

### F-RLS-05 — `safety_incidents` server-authoritative submission RPC (Phase 18, 2026-05-30)

- **Entrypoint:** `public.report_safety_incident(p_payload jsonb)` —
  `SECURITY DEFINER`, `SET search_path = public`,
  `GRANT EXECUTE TO authenticated`, `REVOKE FROM anon, PUBLIC`.
- **Why:** Direct browser INSERTs into `safety_incidents` intermittently
  failed with `42501` even when the policy text was correct, because the
  WITH CHECK predicate depends on `auth.uid()` being resolvable AND on
  the client payload matching it. Routing the write through a
  `SECURITY DEFINER` RPC removes this entire failure class while
  preserving anti-impersonation (the RPC stamps `reporter_id` from
  `auth.uid()` and ignores any client-supplied `reporter_id`).
- **Defence-in-depth:** the restrictive INSERT policy from §F-RLS-03 is
  RETAINED. Direct table inserts from rogue clients remain gated; only
  the RPC bypasses RLS via definer rights.
- **Idempotency:** atomic on `(reporter_id, client_submission_id)`;
  returns `{ id, incident_number, reused }`. Offline queue flush uses
  the same entrypoint.
- **Risk:** Low. Definer rights are scoped to a single insert with
  hard-stamped identity; the function raises `not_authenticated`
  (`42501`) when `auth.uid()` is NULL.
- **Regression lock:** `src/test/safety/incidentReportRlsPolicy.test.ts`
  (Phase 18 block).