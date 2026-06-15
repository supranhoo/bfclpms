## Problem

On `Team Reviews`, clicking a tile (Direct Pending / Skip-Level Pending / KRA Set / Reviewed) does set `statusFilter`, but for full-access roles (Admin, HR PMS, Auditor, Management) the filter is too loose. Today (`EmployeeSelectorGrid.tsx` ~L803–824):

```ts
// pending_direct
if ((isFullAccess || isDirect) && kpi.status === 'self_review') employeeIds.add(...)
// pending_skip
if ((isFullAccess || isIndirect) && skipReviewable.includes(kpi.status)) employeeIds.add(...)
```

For an admin/HR-PMS user there is no `teamMembers` / `skipLevelMembers` set, so `isFullAccess` short-circuits and *any* employee with a self_review KPI lands in **Direct Pending** — including employees whose workflow template has no `manager_check` stage at all (e.g. `self_hr_pms`, `self_audit_mgmt`). That's why the screenshot shows employees badged **Indirect / 10 reviewed** under the Direct-Pending tile.

The tiles must be **stage-true**, not relationship-true:

- *KRA Set* → KPI at `kra_set`
- *Direct Pending* → KPI at `self_review` **AND** employee's resolved workflow contains `manager_check` as the next reviewable stage
- *Skip-Level Pending* → KPI at `manager_check` (or earlier reviewable stage feeding skip) **AND** workflow contains `skip_level_check`
- *Reviewed* → KPI has passed the stage owned by the current viewer

## Risk & Impact

- **Data Impact**: none — read-side filter only, no schema/RLS change.
- **Workflow Impact**: none — submission paths untouched. Counts on tiles already use the per-stage logic via `useReviewerCounts`; we are aligning the grid filter with the count.
- **Regression Risk**: Low. Non-full-access managers continue to use `isDirect` / `isIndirect`. Only the `isFullAccess` branch tightens.
- **Mitigation**: add unit tests over the predicate; verify tile counts == filtered card count for the three reviewer templates (`self_l1_audit`, `self_hr_pms`, `self_audit_mgmt`).

## Plan

1. **Extract pure predicate** `src/lib/teamReviewTileFilter.ts`
   ```ts
   matchesTile(tile, { kpiStatus, stages, isDirect, isIndirect, isFullAccess }): boolean
   ```
   Rules:
   - `pending_kra_set`: `kpiStatus === 'kra_set'` AND (`isDirect || (isFullAccess && stages.includes('self_review'))`)
   - `pending_direct`: `kpiStatus === 'self_review'` AND `stages.includes('manager_check')` AND (`isDirect || isFullAccess`)
   - `pending_skip`: `stages.includes('skip_level_check')` AND `kpiStatus` is in `resolveReviewableStatuses('skip_level', stages)` AND (`isIndirect || isFullAccess`)
   - `reviewed`: unchanged semantics, but gated on the relevant stage existing for that employee.

2. **Wire predicate into `EmployeeSelectorGrid.tsx`** replacing the inline checks at L802–825 (team viewLevel only). No other viewLevels change.

3. **Tests** `src/test/teamReviewTileFilter.test.ts`
   - admin viewing employee on `self_hr_pms` template (no manager_check) → excluded from Direct Pending even with `self_review` KPI.
   - admin viewing employee on `self_l1_audit` → included in Direct Pending when KPI is `self_review`; excluded after it advances to `manager_check`.
   - HR PMS viewing employee on `self_audit_mgmt` → Skip-Level Pending only when `skip_level_check` exists in stages.
   - Direct manager (`isDirect=true`, `isFullAccess=false`) keeps current behaviour.

4. **Tile-count parity check** add a dev-only assertion (guarded by `import.meta.env.DEV`) that logs once when `stats.stat1 !== displayMembers.filter(...).length` so future drift is loud.

5. **Docs**
   - `DOCUMENTATION.md` §Team Reviews — describe stage-true tile semantics.
   - `POLICY.md` — add rule: "Tile filters on reviewer dashboards MUST match the tile's stage; full-access roles do not bypass stage gating."
   - `mem://features/review/reviewer-dashboard-view-architecture` — append the stage-true rule.

## UI Changes

- No new UI. Behaviour change only: clicking a tile narrows the employee grid to those who truly have a KPI at that stage. Tile counts (already correct) and filtered list now agree.

## Out of scope

- KRA Set / Reviewed semantics for non-team viewLevels (audit, hr_pms, management) — they already use `hasResolvedWorkflow` and stage-specific checks.
- Changing what `useReviewerCounts` returns.
