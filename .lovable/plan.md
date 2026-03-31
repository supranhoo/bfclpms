
Goal: fix the runtime error `Could not find a relationship between 'employee_incentive_records' and 'employee_id' in the schema cache` without reintroducing the earlier dashboard/RLS problems.

What I found:
- `employee_incentive_records.employee_id` is just `uuid NOT NULL` in the migration that created the table. It does not reference `public.profiles(id)`.
- The frontend query depends on an embedded relation:
  `profiles:employee_id(...)`
- The generated database types confirm the problem:
  - `employee_incentive_records.Relationships` only has `matched_slab_id` and `program_id`
  - no `employee_id` relationship exists
- Same schema gap exists on:
  - `employee_incentive_eligibility.employee_id`
  - `incentive_score_revisions.employee_id`
- That means current joins in multiple hooks are relying on a relationship that does not exist in the backend schema.

Risk & Impact Report
- Data impact: additive schema fix only; adds missing foreign keys to existing tables. No historical values should change.
- Workflow impact: none to business flow; only restores embedded profile joins.
- UI/UX impact: Monthly Incentive Report and related incentive screens should load records again instead of erroring.
- Regression risk: medium if existing orphan rows exist; FK creation can fail if bad employee_ids are already stored.
- Mitigation:
  - first add a precheck in the migration for orphan `employee_id` values and handle safely
  - update code only after the relationship exists
  - add focused tests/mocks for record fetch and rendering
  - no RLS policy changes, so no recursion risk like the earlier profiles issue

Implementation plan

1. Database migration
- Add missing foreign keys:
  - `employee_incentive_records.employee_id -> public.profiles(id)`
  - `employee_incentive_eligibility.employee_id -> public.profiles(id)`
  - `incentive_score_revisions.employee_id -> public.profiles(id)`
- Use explicit constraint names.
- Before adding each FK, include a read-safe validation step in the migration logic to identify orphan rows and prevent silent failure.
- Do not touch any `profiles` or `kpis` RLS policies.

2. Frontend query stabilization
- Keep `program_id` filtering in `useIncentiveRecords`.
- Keep current explicit error handling in `useIncentiveRecords` so schema issues remain visible.
- Review `useIncentiveRecords`, `useIncentiveEligibility`, and `useIncentiveRevisions` to ensure all embedded joins align with the restored FK-based relations.
- If needed, prefer minimal nested selects only for fields actually rendered.

3. Type/schema sync verification
- Confirm generated types expose the new `employee_id` relationships for the three incentive tables.
- Ensure the hooks compile cleanly against the regenerated relation metadata.

4. Regression protection
- Add unit tests for the incentive hooks/components covering:
  - successful fetch with embedded profile data
  - frontend error state when fetch fails
  - monthly table rendering of employee name/code and amount
- Add/update realistic mock incentive rows including employee/profile linkage.

5. Documentation and policy sync
- Update `DOCUMENTATION.md` with RCA, schema fix, affected screens, and version history.
- Update `POLICY.md` only if current policy language needs to explicitly state that incentive reporting tables must maintain referential integrity to employee master/profile data. If policy is unchanged, document-only sync is enough.

Notes
- The Stack Overflow-style hint you included is directionally correct: this is a missing backend relationship, not a UI-only bug.
- The safer reference target here is `public.profiles(id)`, not a separate `employees` table, because this project uses `profiles` as the employee master table.
- This fix should not recreate the prior dashboard outage, because it adds plain foreign keys only and does not introduce recursive RLS conditions.
