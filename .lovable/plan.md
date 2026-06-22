
## 1. Assumptions
- "Today's changes" = the 13 migrations dated 2026-06-22 plus the matching frontend edits in `useProductionDailyEntries.ts`, `ProductionRatesTab.tsx`, `ProductionDailyGrid.tsx`, and `EmployeeSelectorGrid.tsx`.
- The Sajid Raza class of bug = a PII-hardening change silently breaks a downstream screen because PostgREST drops blocked `profiles(...)` embeds or a feature still reads from legacy hooks/policies that were tightened.
- Audit scope is read-only investigation + a remediation plan; no code/SQL is written until you approve.

## 2. Clarifications
None blocking. If you want a narrower scope (e.g. "only incentive module" or "only Team Reviews"), say so and I'll trim.

## 3. Risk & Impact Report
- **Data Impact:** None during the audit. Remediation will be RLS/RPC/hook adjustments only — no schema or data writes.
- **Workflow Impact:** Restoring visibility for roles that lost access (Org KPI Data Owners, Value Enterers, Incentive Data Entry users, non-full-access managers) without re-introducing PII leakage.
- **UI/UX Impact:** Affected screens go from blank / "no data configured" back to populated lists; error states surface real failures.
- **Regression Risk:** Medium — `profiles` is read from ~50 files. The audit must distinguish admin-only screens (unaffected) from role-restricted screens (affected).
- **Scalability Impact:** Prefer existing SECURITY DEFINER directory RPCs (`get_profile_directory_entries`, `get_incentive_program_employees`, `get_manager_team_roster`) over re-broadening RLS.
- **Mitigation Plan:** Each finding gets a regression test before the fix lands; document in `POLICY.md` so the pattern isn't reintroduced.

## 4. Today's Changes Under Audit

### A. Database migrations (2026-06-22)
1. `070708` — REVOKE EXECUTE on all SECURITY DEFINER functions from `anon`/PUBLIC (allowlist of 3).
2. `071402` — Tightened `kpi_mention_access` INSERT policy.
3. `103026` — New `get_manager_team_roster(uuid)` RPC.
4. `103745` — Tightened `email_logs` and `auth_lookup_attempts` policies; widened `review-evidence` storage SELECT to skip-level + hr_pms.
5. `104035` — **Dropped 3 broad profile SELECT policies** (org KPI data owner, value enterer, incentive data entry) and added `get_profile_directory_entries`.
6. `114857` + `115002` — `get_incentive_program_employees` RPC.

### B. Frontend changes
- `useProductionDailyEntries.ts` — removed `profiles:employee_id(...)` embed from `useProductionRates`.
- `ProductionRatesTab.tsx` — resolves names from local roster.
- `ProductionDailyGrid.tsx` — surfaces real rate errors.
- `EmployeeSelectorGrid.tsx` — Direct/Skip tile counters now prefer `get_manager_team_roster` relationship tags (Sajid Raza fix).

## 5. Audit Method (read-only)

### Pass 1 — anon REVOKE fallout (migration 070708)
Confirm no pre-auth code paths invoke SECURITY DEFINER RPCs other than the 3 allow-listed (`get_public_branding`, `lookup_synthetic_email_by_code`, `get_public_registry_view`). Grep `supabase.rpc(` and `functions.invoke(` calls reachable before sign-in (Login, ResetPassword, AccessDenied, employee-code lookup, branding fetch). Any hit outside the allowlist is a regression.

### Pass 2 — dropped profile policies fallout (migration 104035)
Enumerate every read that joins/embeds `profiles` and is reachable by a non-admin/non-manager role. Risk pattern = a query in a hook/page used by Org KPI Data Owners, Value Enterers, or Incentive Data Entry users that either:
- Uses PostgREST embed syntax `profiles:fk(...)` or `profiles(...)` (silently returns 0 rows under tightened RLS), or
- Selects `*` from a table that the user can read but joins a `profiles(...)` it can't.
High-priority files to inspect (already listed by grep):
- `hooks/useSentBackOrgKpiEmployees.ts`
- `hooks/useSendBackOrgKpiValue.ts`
- `hooks/useRequestOrgKpiRevision.ts`
- `hooks/useAllRollbackRequests.ts`
- `hooks/useMentionSearch.ts`
- `hooks/useActiveEmployeesForCopy.ts`
- `hooks/useManagersWithoutKras.ts`
- `components/incentive/ProgramEmployeeMapping.tsx`
- `components/incentive/CustomTabDataGrid.tsx`
- `components/incentive/VesselRateEditor.tsx`
- `hooks/useVesselMonthlyEntries.ts`
- `pages/admin/IncentiveDataEntry.tsx`
- Any KPI Observations / mention list rendered for non-admin authors.

For each, classify: (a) admin-only → safe; (b) role-restricted → must migrate to `get_profile_directory_entries` / `get_incentive_program_employees` / `get_manager_team_roster`.

### Pass 3 — kpi_mention_access tightening (migration 071402)
Manually walk through the new `WITH CHECK`: confirm a manager who is replying to (not authoring) an observation can still grant mentions. If not, that's a regression for cross-team conversations.

### Pass 4 — Team Reviews parity (migration 103026 + EmployeeSelectorGrid fix)
Find any other surface that still derives "direct vs skip" from the legacy `useTeamMembers` / `useSkipLevelTeamMembers` hooks instead of `useManagerTeamRoster`. Same Sajid Raza class:
- Annual Review team views
- Bulk Review batch employee picker
- Audit assignment screens
- PIP create dialog
- Training Needs grids
- Reports filtered "my team" toggles
- Notifications "my team" pivot

### Pass 5 — review-evidence storage widening (migration 103745)
Verify no UI assumed exclusive visibility (e.g., "shared with X people" badges). Low risk; sanity check only.

## 6. Deliverable per finding
For each confirmed regression I will, in build mode:
1. Repro path (role + screen).
2. Surgical fix (swap embed for SECURITY DEFINER RPC, or repoint hook).
3. Vitest regression test in `src/test/`.
4. `DOCUMENTATION.md` + `POLICY.md` entry.
5. Rollback note.

## 7. UI Changes
Not applicable to the audit pass. Each remediation will list visual change in its own plan if material; most are "screen renders rows again instead of empty state."

## 8. Tests
Audit pass produces zero code. Remediation patches each add a focused Vitest covering the role + query shape (mirroring `incentiveProductionRatesNoProfilesJoin.test.ts` and `managerRosterRelationshipFallback.test.ts`).

## 9. DOCUMENTATION.md updates
After the audit, add a v2.66.50 entry listing every confirmed regression and the fix.

## 10. POLICY.md updates
Add an explicit rule: **"Any feature reachable by a non-admin role that needs to display profile name / employee code MUST go through `get_profile_directory_entries`, `get_incentive_program_employees`, or `get_manager_team_roster` — never a direct `profiles` embed."** Cross-link the Sajid Raza and Sandeep 200291 RCAs.

## 11. Post-implementation notes
- Audit produces a findings table; you approve which findings to remediate now vs defer.
- Rollback for each remediation = revert the single hook/component file; no migration rollback required because the audit avoids re-broadening RLS.

**On approval I will start with Pass 1 + Pass 2 (highest user-visibility risk) and report findings before touching code.**
