
## What Sajid is seeing
On `/dashboard?view=team`, every tile reads `0` and the amber banner **"Dashboard data could not be loaded — The roster or KPI query failed to return"** is shown, even though the DB confirms he has **13 active direct reports** mapped to him.

That banner is `TeamReviewsZeroDiagnostic`'s `data_load_error` branch, which fires when ANY of `teamError | skipError | profilesError | periodKpisError | stageFilteredError` is truthy in `EmployeeSelectorGrid` (lines 2021-2040).

## Risk & Impact Report
- **Data impact:** None — purely a read path. No writes affected.
- **Workflow impact:** Managers (Sajid + likely others) cannot review their team until reload luck lands. This is the same population the v2.66.11.13 fix covered, but a different failure mode.
- **UI/UX impact:** Banner + zeroed tiles; existing diagnostic copy stays.
- **Regression risk:** Low — fix is scoped to query gating and an RPC grant, not to scoring or workflow logic.
- **Scalability impact:** Removes a class of wasted/failing requests fired pre-auth.
- **Mitigation:** Cover with unit tests; keep RLS posture intact (no widening of `anon`).

## Root-cause evidence (Postgres logs, last ~30 min, project DB)
Three distinct PostgREST errors line up with Sajid's session:

1. `permission denied for function has_role` — query against `public.system_settings` (×2, most recent). `authenticated` does have EXECUTE on `public.has_role(uuid, app_role)`; `anon` does **not**. The only way this error is raised is if the request reached PostgREST **without a JWT** (role stays `anon`). Conclusion: at least one query is firing before the Supabase client has the session attached.
2. `invalid input syntax for type uuid: "undefined"` — `profiles WHERE reporting_manager_id = 'undefined'`. A hook fired with the literal string `"undefined"` for the manager id.
3. `invalid input syntax for type uuid: "null"` — `profiles WHERE id = ANY [null]`. A batched lookup ran before its input array was populated.

All three are **auth-readiness / input-readiness races**, not an RLS or schema bug. The roster itself (13 direct reports, active) is intact.

## Plan

### Step 1 — Confirm the exact failing query in Sajid's session
- Add one-shot `console.warn` instrumentation (gated behind a `?debug=team` flag so it doesn't spam prod) inside `EmployeeSelectorGrid` printing `{ teamError, skipError, profilesError, periodKpisError, stageFilteredError }.message` plus the resolved `user?.id` at the moment the banner renders.
- **Verification:** Ask Sajid to reload once with `?view=team&debug=team`; capture the console line. Confirms whether the error is (a) anon→`has_role` PD on `system_settings`, (b) the `"undefined"` profiles call, or (c) something else.

### Step 2 — Close the auth-readiness race on the dashboard query fan-out
In `EmployeeSelectorGrid.tsx`:
- Gate `useTeamMembers`, `useSkipLevelTeamMembers`, `useProfiles`, `useKpisByPeriodRanges`, and the stage-filtered profile hook behind a single `authReady` boolean from `AuthContext` (must be true AND `user?.id` must be a valid UUID — add a small `isUuid()` guard). Today only `!!user?.id` is checked, which still allows a render pass with `user?.id === undefined` to be skipped but does not stop downstream hooks that read other primitives (period/year) from issuing requests before the session is attached.
- In any hook that accepts an `id[]` or a manager id, short-circuit to `[]` / `enabled=false` if the array contains a falsy / non-uuid entry.
- **Verification:** Vitest covers `useTeamMembers`/`useSkipLevelTeamMembers` enabled-gate (no fetch when authReady=false, manager id non-uuid, or array contains null). Manual: Sajid reloads, no `permission denied`/`uuid: undefined` errors in logs.

### Step 3 — Defensive `has_role` posture (no privilege widening)
- Do NOT grant `anon` EXECUTE on `public.has_role` — that would weaken RLS. Instead, ensure no policy-bearing table is queried before auth-ready (Step 2 covers this).
- Add a Vitest assertion that the singleton Supabase client is constructed with `persistSession: true, autoRefreshToken: true` and that `AuthContext` flips `authReady` only after `getSession()` resolves with a token — protects against future regressions where a hook leaks a pre-JWT request.
- **Verification:** Lint + unit tests pass; postgres logs free of `has_role` PD after one full day in prod.

### Step 4 — Documentation + memory
- Append a new RCA paragraph to `mem/features/review/team-reviews-zero-kpi-rca` noting the auth-readiness race as the second failure mode (distinct from the v2.66.11.13 SECURITY DEFINER ambiguous-column bug).
- Update `DOCUMENTATION.md` "Team Reviews diagnostic" section + `POLICY.md` data-readiness contract: **No dashboard query may fire before `authReady === true` AND `auth.uid()` is a valid UUID.**
- **Verification:** Files reviewed; version-history bumped.

### Step 5 — Tests + mock data
- `src/test/teamReviewsAuthReadyGate.test.ts` — asserts:
  - `useTeamMembers(undefined)` / `useTeamMembers("undefined")` never fires the network call.
  - `useSkipLevelTeamMembers(null as any)` does not fire.
  - `useProfilesByIds(["00000000-…", null])` short-circuits.
- Extend `src/test/teamReviewsZeroDiagnostic.test.ts` to assert `data_load_error` precedence is unchanged.
- **Verification:** `bunx vitest run` green.

## What changes visually
- **No visual change** when the page works. Existing amber banner copy and tile layout remain.
- The banner will simply stop appearing for managers whose only fault was the auth-race; the tiles will show real counts.

## Rollback strategy
- Step 2 is a single-file React change behind a guard variable — revert one commit.
- No DB migration in Steps 2–3 (the only DB touch considered, granting anon, is **rejected**).
- Step 4 is docs/memory-only.

## Out of scope
- Re-litigating the v2.66.11.13 RPC fix (already shipped and verified for Sajid).
- The unrelated `password-rollout` and `kpi_mention_access` work from earlier today.

## Decision log
- **Rejected:** `GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon`. Reason: weakens the RLS surface on every table whose policy invokes `has_role` (admin/manager checks); treats a symptom (anon-role request) instead of the cause (request fired pre-JWT).
- **Rejected:** Suppressing the diagnostic banner. Reason: hides real failures and the v2.66.11.13 work explicitly added `data_load_error` precedence so failures stop showing as "No KPIs assigned".

## Open question for you before I implement
Should I deploy Step 1 (the debug-flag instrumentation) first and wait for Sajid's console line, or proceed straight to Steps 2-5 since the postgres-log evidence is already conclusive? My recommendation: **skip Step 1 and ship Steps 2-5** — the logs already pin the race to auth-readiness, and Step 2 is safe on its own.
