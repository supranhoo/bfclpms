
## Root Cause — why employee 200079 is invisible

Siddharth Kumar Sharma (200079) is correctly:
- `is_active = true`
- has 17 April-2026 KPIs, all at status `approved`
- has a resolved workflow that includes `hr_pms_review`
- has `hr_pms_score` signatures on all 17 review_submissions

So his 17 KPIs **are** counted inside the “HR PMS Reviewed = 116/1090” tile (via the score-signature branch at `EmployeeSelectorGrid.tsx:1071`). But his **card never appears** in the “Reviewed” list.

The bug is in `src/hooks/useWorkflowConfig.ts` → `useBulkEmployeeWorkflows`:

```ts
const { data, error } = await supabase
  .rpc('get_bulk_employee_workflows', params);   // ← NOT paginated
```

For the HR PMS panel, `allEmployeeIds` = `stageFilteredProfiles` = **2,466 ids** (every active employee whose workflow contains `hr_pms_review`). PostgREST silently caps RPC responses at **1000 rows** (POLICY §125 — same class of bug we already fixed for `get_reviewer_roster_slim` and `get_reviewer_kpis_for_period`). The hook therefore returns workflow stages only for the first ~1000 employee_ids and drops the rest.

For every employee past that cut-off (Siddharth sits alphabetically around position ~1900):
- `workflowMap.has(empId)` → `false`
- `getStages(empId)` falls back to `DEFAULT_WORKFLOW_STAGES = [kra_set, self_review, manager_check, audit, management_review, approved]` — **no `hr_pms_review`**
- displayMembers filter (`EmployeeSelectorGrid.tsx:800`) computes `stages.indexOf('hr_pms_review') = -1` → employee is **not added** to the Reviewed list
- The same exclusion silently hits Audit (line 1029), Skip-Level, and Management panels for any org with >1000 stage-eligible profiles

This also explains the earlier 4 vs 27 discrepancy: only employees who happen to fall in the first 1000 ids (alphabetical) get cards. The tile counts are higher because the signature branch doesn’t depend on `workflowMap`.

## Fix

1. **`src/hooks/useWorkflowConfig.ts` — paginate `useBulkEmployeeWorkflows`**
   - Chunk `employeeIds` into 500-id batches (same size used in `useOrganization.ts`).
   - Call the RPC once per chunk in parallel via `Promise.all`, with one retry on failure (mirror the resilient pattern already in `useProfilesByWorkflowStage`).
   - Merge all rows into a single `Map<string, string[]>`.
   - Keep the query key + 5-min `staleTime` unchanged so cached pages still hit.

2. **Regression test — `src/test/bulkEmployeeWorkflowsPagination.test.ts` (new)**
   - Mock `supabase.rpc` to return 1000 rows on the first call and 500 on the second; assert the merged map has 1500 entries.
   - Assert chunking kicks in above 500 ids (verify `rpc` is called ≥2 times for a 1500-id input).
   - Static-source assertion: `useBulkEmployeeWorkflows` source contains `fetchAllRpcPaged` or an explicit chunk loop (mirrors `BUG-049` test style in `bugBountyFixes.test.ts`).

3. **Card-visibility parity test — `src/test/hrPmsRosterCompleteness.test.ts` (new)**
   - Given a synthetic roster of 1200 employees all with `hr_pms_review` in their workflow and one KPI structurally past HR PMS, the reviewer-stage filter (`statusFilter='reviewed'`) must return all 1200, not ~1000.
   - Locks the invariant: card count under Reviewed ≥ employees-with-signature in the tile.

4. **Documentation & policy sync**
   - `DOCUMENTATION.md` v2.66.11.18 — RCA: PostgREST 1000-row cap silently truncates `get_bulk_employee_workflows` for orgs >1000 stage-eligible profiles; fixed by chunked fetch.
   - `POLICY.md` §125 — extend the “any RPC that may return >1000 rows must paginate” rule to include hooks (not just reporting screens). Add `useBulkEmployeeWorkflows` to the enumerated list.
   - `mem/architecture/data-import-engine` or a new `mem/infrastructure/postgrest-1000-row-cap` note — record that any new bulk-resolution hook must chunk inputs at ≤500 ids.

## Risk & Impact

- **Data Impact:** none — read-only fix. No schema, RLS, or migration changes.
- **Workflow Impact:** none on stored data. Visible-roster size will grow for HR PMS / Audit / Skip-Level / Management panels in orgs >1000 stage-eligible profiles. Tile values (which already used signatures) stay identical; per-card badges become consistent with the tile.
- **UI/UX Consistency:** existing layout, pagination (24/page), and sort order unchanged. More cards may now appear on later pages.
- **Regression Risk:** Low. The hook is called from `EmployeeSelectorGrid` and `useBottleneckReport`; both already treat `workflowMap` as “lookup with fallback”, so a fuller map can only improve correctness. Parallel chunked RPC calls are the same pattern already proven in `useProfilesByWorkflowStage`.
- **Mitigation:** New pagination unit test + roster-completeness test guard against the 1000-row cap returning. Keep `staleTime` so we don’t inflate request volume.

## Out of scope

- Bulk-zero engine changes (already shipped in v2.66.11.17).
- Tile/list semantics — both branches already agree once the workflow map is complete.
