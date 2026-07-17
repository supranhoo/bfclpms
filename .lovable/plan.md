# Fix: instance detail page rejects HODs/BU-Heads viewing employees in their home BU

## Root cause
The RLS SELECT policy `instances_select_directory_assistance` on `annual_review_instances` calls `public.can_access_annual_review_instance_for_assistance(id)`. That helper still reads the **single** `business_unit_id` field from `annual_review_directory_access(uid)` — it was not updated in ADR-111 when the resolver became multi-BU.

For Prabhat (101757), the resolver now returns `business_unit_ids = [Admin, 1050 TPD]` but `business_unit_id = Admin` (first entry). Mukesh's instance sits in 1050 TPD, so the helper falls through to `RETURN false`, RLS hides the row, and the detail page renders "This review isn't available…".

The helper also doesn't handle `scope='team'` — plain reporting managers who can see an employee in the directory can't open the instance either unless they're already a named reviewer.

## Decision
Extend `can_access_annual_review_instance_for_assistance(p_instance_id)` to mirror the resolver's new contract:

1. Read `business_unit_ids` (array) from `annual_review_directory_access`; fall back to `[business_unit_id]` for safety.
2. `scope='all'` → allow (unchanged).
3. `scope='bu'` → allow when `employee.department.business_unit_id = ANY(business_unit_ids)`.
4. **NEW `scope='team'`** → allow when the caller is `manager_id`/`skip_id` on the instance, OR the employee is a direct/skip report of the caller (mirrors the write-side check in `create_or_get_annual_review_instance`).
5. Everything else → deny.

No change to write policies (`instances_stage_update`, response RLS, submit RPCs) — approval rights stay gated to the named reviewer / admin / hr_pms. This is a **read-only** widening consistent with ADR-111's SSOT intent.

## Backend (one migration, extends ADR-111)
- `CREATE OR REPLACE FUNCTION public.can_access_annual_review_instance_for_assistance(uuid)` with the array + team branch above. Same signature, same return type, `STABLE SECURITY DEFINER`, `search_path=public`. RLS policy stays untouched (already calls the function by name).

## Frontend
- None. `useReviewInstance` / `TeamAnnualReviewDetail` unchanged — server RLS drives visibility.

## Tests / verification
- Post-migration psql: as Prabhat (`223ba922-…`), `SELECT can_access_annual_review_instance_for_assistance('06783199-0694-41f9-bd1f-77222b280478')` returns `true`; the instance row is returned by `SELECT … FROM annual_review_instances WHERE id = …` under his JWT.
- Regression: an unrelated employee (no leadership, not a reviewer on the instance) still returns `false`.
- `directoryAccess.test.ts` gets an extra assertion covering the multi-BU visibility path.

## Governance
- `docs/adr/ADR-111.md`: append "Read-side helper" note documenting that the assistance helper mirrors the resolver's `business_unit_ids` and adds a `team` branch.
- `POLICY.md` §AR-DIRECTORY-ACCESS-MATRIX: add "Instance visibility mirrors directory scope (read-only); write rights remain gated to named reviewers."

## Risk & rollback
Additive read widening for users who already qualify via the directory resolver. No write path affected. Rollback = restore previous function body; UI falls back to the same "not available" screen.

## Out of scope
No changes to review stages, reviewer resync, BU-Head-terminal (ADR-109), team-queue RPCs, or the global directory feature flag.
