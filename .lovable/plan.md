## 1. Assumptions
- Admin Ankit can use the reviewer-stage dropdown to view Bulk Review as HR PMS, Auditor, Manager, Skip-Level, or Management.
- The top-right `Stage-ready only` filter is intended to mean: “show only rows currently waiting at the selected role’s workflow stage.”
- When the filter is OFF, upstream / downstream rows may be visible for QA, but they should not accidentally be included in role sign-off unless we deliberately design an audited admin override.
- Anil Pathak (200301), May 2026, 5S KPI is a regression case: current status is `self_review`, workflow is `kra_set → self_review → manager_check → audit → management_review → approved`; it is not HR PMS-ready.

## 2. Clarifications
- Not Applicable. I will implement the safer interpretation: filter OFF = full visibility / QA; filter ON = role-ready and actionable.

## 3. Risk & Impact Report
- **Data Impact:** No table changes expected. Likely one additive/replacement backend function update and/or guard in existing write functions. No historical data mutation.
- **Workflow Impact:** Strengthens the rule that HR PMS can only sign rows whose prior workflow stage is complete. Prevents HR PMS from acting on Auditor / Self / Manager pending rows.
- **UI/UX Impact:** The filter will become fail-closed and clearer. If role-ready scope is loading or fails, the dashboard will not temporarily show all rows as actionable.
- **Regression Risk:** Medium, because Bulk Review combines matrix rendering, row selection, bulk dialog preview, and server sign-off. The main risk is hiding legitimate rows if workflow predecessor logic is wrong.
- **Scalability Impact:** Keep the existing accumulated snapshot cap and page size. The role-ready lookup remains a compact `(kpi_id, employee_id)` pair set for the selected period/year/stage; no full dataset re-fetch.
- **Mitigation Plan:** Add regression tests for HR PMS, Auditor, stale selections, loading/error fail-closed behavior, and Anil Pathak’s KPI. Keep changes surgical and aligned with existing `my_review_scope` / `stage_ready_kpis` patterns.

## 4. Root Cause Analysis
- **Observed failure:** With `Stage-ready only` ON, Anil Pathak’s upstream KPI still appears in the HR PMS bulk sign-off path.
- **Likely root causes in current code:**
  1. The admin stage-ready filter only runs when `stageReadyScope` data exists; while it is loading/error/undefined, rows pass through instead of failing closed.
  2. Selections are stored separately in `selectedIds`; they are not consistently pruned when the role-ready filter changes or when rows become hidden.
  3. The sticky action bar and bulk dialog use `selectedIds.size` in places instead of the filtered/actionable `selectedRows.length`, so stale hidden selections can still look selected.
  4. The server write path needs an explicit readiness guard review so UI visibility and backend write rules cannot drift.

## 5. Step-by-step Plan
1. **Create a single role-ready predicate in frontend logic**
   - Derive `roleReadyPairs` from:
     - `myReviewScope.pairs` for actual reviewer roles.
     - `stageReadyScope.pairs` for admin viewing as a selected role.
   - Treat role-ready mode as fail-closed: if the filter is ON and the required pair set is still loading, errored, or missing, do not expose rows as actionable.

2. **Apply the same predicate everywhere**
   - Grid rows shown when `Stage-ready only` is ON.
   - Matrix row-level select-all.
   - Sticky action toolbar count.
   - Bulk approve/sign-off dialog `cellCount` and preview rows.
   - Final payload sent to `bulk_write_stage_scores` / draft save.

3. **Prune stale selections**
   - Add an effect that intersects `selectedIds` with currently visible/actionable submission IDs whenever:
     - `loadedRows` changes,
     - selected reviewer stage changes,
     - `Stage-ready only` toggles,
     - period/year/scope reload changes.
   - This prevents an upstream row selected while filter OFF from remaining selected after filter ON.

4. **Improve the filter UX**
   - Rename label dynamically to `Role-ready only` or `HR PMS-ready only` / `Auditor-ready only`.
   - Keep the filter near `Due only` in the top-right filter cluster.
   - Badge should show `ready / loaded` context where possible.
   - Tooltip should state: filter ON shows rows waiting at selected role; filter OFF shows full QA scope but upstream rows are not safe for role sign-off.

5. **Backend hardening**
   - Review `bulk_write_stage_scores` and `bulk_save_stage_drafts` readiness checks.
   - If they do not already enforce “current status = predecessor stage in resolved workflow,” update them so non-ready rows are skipped with a clear reason like `stage_not_ready`.
   - Keep admin override of workflow stage out of this fix unless explicitly requested later.

6. **Add regression tests and mocks**
   - Add Anil Pathak May 2026 5S mock row with `status=self_review` and no HR PMS stage.
   - Add ready rows for HR PMS (`status=audit`) and Auditor (`status=manager_check`).
   - Test filter ON hides Anil for HR PMS.
   - Test filter OFF shows Anil but does not remain selected when switching back ON.
   - Test bulk dialog count uses actionable selected rows, not stale `selectedIds.size`.
   - Test loading/error role-ready scope fails closed.

7. **Documentation and Policy sync**
   - Update `DOCUMENTATION.md` version history with RCA, fix, validation, rollback.
   - Update `POLICY.md` Bulk Review role-ready rule: admin view-as filter ON must match selected role readiness; filter OFF is QA visibility, not a bypass of workflow readiness.

## 6. UI Changes
- **Location:** Bulk Review top-right filter cluster beside `Due only`.
- **Visual change:** Rename `Stage-ready only` to a clearer dynamic label such as `HR PMS-ready only` when HR PMS is selected, and `All stages` when OFF.
- **Interaction impact:**
  - ON: only selected-role-ready rows appear and can be selected/signed.
  - OFF: full loaded scope appears for QA; switching ON prunes non-ready selections.
- **Responsiveness:** Keep the current compact button style and horizontal filter scroll; no layout expansion on smaller screens.

## 7. Implementation
- After approval, I will modify only the Bulk Review dashboard / related predicate utilities, the minimum backend function guard if required, tests, `DOCUMENTATION.md`, and `POLICY.md`.
- No unrelated refactor.

## 8. Tests
- Unit tests for role-ready filtering, stale selection pruning, dialog count correctness, fail-closed loading/error behavior, and Anil Pathak regression.
- SQL/function contract test if backend readiness guard is changed.

## 9. DOCUMENTATION.md updates
- Add a new version entry documenting:
  - RCA: stage-ready UI was not consistently fail-closed and selection state could leak upstream rows into bulk sign-off.
  - Fix: single role-ready predicate applied to grid, selection, dialog, and write payload.
  - Regression case: Anil Pathak (200301), May 2026, 5S KPI.
  - Rollback steps.

## 10. POLICY.md updates
- Add/extend Bulk Review policy:
  - Admin view-as role must respect selected role readiness when role-ready filter is ON.
  - Filter OFF is full-scope QA visibility, not permission to bypass workflow sequence.
  - Bulk write must skip non-ready rows unless a separately audited override feature is explicitly introduced.

## 11. Post-implementation notes
- Rollback is safe: revert the frontend predicate/selection changes and any function replacement migration.
- No backup table changes required because no new data table is planned.