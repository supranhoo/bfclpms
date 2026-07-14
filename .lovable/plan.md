# RCA — UUID shown in Team Annual Review queue

## Reproduction of the reported record
The card that shows `ea42868d-c67e-46d5-8758-6a…` with blank code/designation is **Sourabh Kumar Singh (101790, Senior Engineer)**, instance `1ab610a9…` in cycle `b82a935f…`, currently at stage **`pending_bu`**.

Reviewer chain on that instance:
- manager = Rishi Raj (101142)
- skip = **Prabhat Kumar Singh (101757)**
- dept_head = Sushanta Ghosh (101883)
- bu_head = Sajid Raza (100264)
- hr = Jaspal (101125)

Sourabh's `reporting_manager_id` = Sushanta (not Rishi). So Sourabh is Sushanta's direct report and Sajid's skip-level report through the org tree — but he is NOT under Prabhat in the reporting chain.

## Why the name renders as a UUID

`src/pages/annual-review/TeamAnnualReview.tsx` line 231:
```
{i.employee?.full_name ?? i.employee_id}
```
The card falls back to `employee_id` (a UUID) when the embedded `employee` join is `null`, and the code/designation line then renders `undefined · —`.

The embed is a PostgREST join to `profiles`:
```
employee:profiles!annual_review_instances_employee_id_fkey(id, full_name, employee_code, designation, doj)
```
PostgREST enforces RLS on the embedded side independently. The instance row is visible to every reviewer (its RLS uses `manager_id / skip_id / dept_head_id / bu_head_id / hr_id`), but the **profiles** table has NO policy for "reviewer assigned on this employee's active review instance". Its reviewer-oriented policies only cover:
- `Managers can view their direct reports` (reporting_manager_id = auth.uid())
- `Managers can view skip-level reports` (reporting_manager_id ∈ direct reports of auth.uid())
- `Annual review directory reviewers` (Admin/HR PMS/BU-head via directory access)

Consequence: Any reviewer who sees an instance solely because they are the assigned `skip_id`, `dept_head_id`, `bu_head_id`, or `hr_id` — but who is NOT on the reviewee's reporting-manager chain — gets the instance row without the joined profile row.

For this specific record, **Prabhat Kumar Singh** is the assigned skip reviewer, but his own direct report is Rishi Raj; Sourabh does not roll up through Rishi. Result → profile join is silently dropped → UI falls back to the UUID.

**Not** caused by:
- Master data / cycle mapping — the profile exists, is_active=true, department mapped, employee_code populated.
- Deleted/separated employee — Sourabh is active.
- Assignment mapping — all five reviewer IDs are populated correctly on the instance.
- Frontend binding — the binding is correct; the API response has `employee: null`.
- Cache — reloading, other queries all hit the same RLS.

## Blast radius (before fix)
Any instance where the current viewer is an assigned reviewer but not on the reporting-manager chain. Currently observed with `pending_bu` on this row, but structurally affects skip / dept / bu / hr reviewers whenever the assigned reviewer differs from the tree-derived reviewer (per-employee overrides, HOD/BU reassignments, HR seat).

## Fix (root-cause, RLS layer)

Add one SECURITY DEFINER helper and one SELECT policy on `public.profiles`, scoped strictly to "the current user is an assigned reviewer on an active (non-excluded) annual review instance for this profile". No other table, no other role, no other flow is touched.

```sql
create or replace function public.is_annual_review_reviewer_for_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.annual_review_instances i
    where i.employee_id = p_profile_id
      and i.overall_status <> 'excluded'
      and auth.uid() in (i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id)
  )
$$;

create policy "Annual review reviewers can view reviewee profiles"
  on public.profiles
  for select
  using (public.is_annual_review_reviewer_for_profile(id));
```

Why this is safe:
- Additive-only (new function, new SELECT policy). No existing policy or function is modified. Rollback = drop the policy + function.
- Scope matches the instance's own RLS envelope: if a user cannot see the instance, `auth.uid()` will not appear in any of the reviewer columns and the policy denies. So this grants exactly the profile visibility that the queue query already implicitly needs — nothing more.
- Filters `overall_status <> 'excluded'` so excluded instances don't leak profiles.
- Column exposure is unchanged: the queue only selects `id, full_name, employee_code, designation, doj`. No sensitive columns beyond what other reviewer policies already return.

## Frontend safety net (defense-in-depth, tiny)

Even after the RLS fix, the UUID-in-name fallback is a latent bug. Change `TeamAnnualReview.tsx` fallback so that when `employee` is still missing (future edge cases like archived profiles) it renders a neutral label instead of leaking the UUID:

```
{i.employee?.full_name ?? 'Employee unavailable'}
```
and hide the code/designation line (`—`) when `employee` is null. Purely presentational; no logic change.

## Verification

1. As Prabhat Kumar Singh (skip reviewer, no reporting-chain link to Sourabh): reload `/annual-review/team` → the card renders "Sourabh Kumar Singh · 101790 · Senior Engineer".
2. As Sajid Raza (BU head, on chain): unchanged behavior.
3. As Rishi Raj (manager, on chain): unchanged.
4. As an unrelated employee (e.g. a random Employee-role user): `select * from profiles where id = 'ea42868d…'` still returns 0 rows (no new leakage).
5. Directory-search flow (Admin / HR PMS / BU-head with directory access) unaffected — separate policy still applies.
6. No other module reads `profiles` embed via reviewer role; unit tests in `src/test/annualReview/*` continue to pass.

## Deliverable
Single migration adding the helper + policy, plus the two-line UI fallback hardening.
