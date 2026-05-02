## RCA

I checked the code and the live data for the screenshot case.

For Amol Ashok Shivankar's **March 2026** KPI `Stack Emission and PM Monitoring Adherence`, the backend returns:

- Period-resolved workflow: `kra_set → self_review → manager_check → audit → approved`
- Current/default workflow: `kra_set → self_review → manager_check → skip_level_check → hr_pms_review → approved`
- Submission data: `self_score = 5`, `manager_score = 5`, `auditor_score = 0`, `final_score = 0`

So the dialog should show **Audit Review** and default to it. The screenshot still shows **Skip-level Review / HR PMS Review**, which means the UI is still resolving the target list from a stale/current workflow path before the period-aware/data-bearing correction is effectively reflected in the rendered dropdown.

Most likely failure points found in code:

1. `AdminStatusStepBackDialog` can render before `dataBearingStages` finishes loading, so the Select value can initialize to `HR PMS Review` from the fallback workflow and not visibly correct itself.
2. `previousStatus` is still computed independently from the target list and can influence the displayed selected value even when `availableTargets` contains a better period/data-aware option.
3. The dialog accepts optional external workflow data, but `KpiReviewPanel` passes workflow stages only into `KpiJourneySection`, not into `AdminStatusStepBackDialog`; therefore the dialog has to refetch and may briefly use fallback/current information.
4. There is no visible loading/diagnostic state to prevent admins from selecting a target before workflow + submission score evidence has been resolved.

## Risk & Impact Report

**Data Impact**
- No schema or RLS change required.
- No historical data will be modified by this fix.
- Step-back execution will still use the existing audit log and cascade-clear behavior.

**Workflow Impact**
- Only the admin Step Back target-selection UI changes.
- It will become stricter: the target dropdown will wait until the period workflow and persisted score stages have loaded.
- For the reported March 2026 case, target should become `Audit Review`, not `HR PMS Review`.

**UI/UX Impact**
- The dialog may show a short “resolving target stages” state before enabling the dropdown.
- Target labels will be clearer, including a small note when a stage is available because it has recorded data.

**Regression Risk**
- Medium, because step-back target selection touches approved KPI correction workflows and sibling reset behavior.
- Low database risk because this is UI/helper logic only.

**Mitigation Plan**
- Centralize default-target selection from the already-computed target list instead of mixing `previousStatus`, `dataAwareDefault`, and fallback values.
- Add regression tests for the exact Amol data shape: period workflow excludes HR PMS and includes Audit, `auditor_score = 0`, current status `approved`.
- Update `POLICY.md`, `DOCUMENTATION.md`, and memory to record the stricter “do not render stale target list” rule.

## Implementation Plan

1. **Make Step Back target resolution atomic**
   - In `AdminStatusStepBackDialog.tsx`, derive one canonical `resolvedDefaultTarget` from `availableTargets` after both queries finish.
   - Stop using `previousStatus` as an independent Select fallback when `availableTargets` already has a data-aware target.
   - If the exact current KPI has `auditor_score = 0`, ensure `audit` is considered data-bearing because the code already checks `!== null`, not truthiness.

2. **Prevent stale workflow dropdown display**
   - Add a loading state while the workflow query or data-bearing-stage query is pending.
   - Disable the Select and Confirm button until target stages are resolved.
   - Reset `selectedTarget` when the dialog opens for a new KPI or when the computed default changes, so hard refresh/cached React state cannot retain `HR PMS Review`.

3. **Prefer the computed target list for default selection**
   - Add a helper such as `getPreferredStepBackTarget(currentStatus, targets, dataBearingStages)` in `useAdminDataEntry.ts`.
   - Preference order:
     1. Nearest prior data-bearing stage present in `availableTargets`
     2. Nearest prior workflow stage present in `availableTargets`
     3. `kra_set`
   - This avoids a mismatch where dropdown options and selected value are calculated by different rules.

4. **Pass known workflow stages through the review panel path where available**
   - Update `KpiHeaderSection` props to accept `workflowStages`.
   - Pass `workflowStages` from `KpiReviewPanel` into `KpiHeaderSection`, then into `AdminStatusStepBackDialog`.
   - Keep the dialog’s own period-aware RPC as fallback for pages like `AllKpis`.

5. **Improve admin diagnostics in the dialog**
   - Add a small note showing the resolved basis, e.g. `Workflow for March 2026` and `Audit Review included from recorded score`.
   - Keep `(historic)` only for stages present due to data but absent from the resolved period workflow.

6. **Regression tests and mock coverage**
   - Extend `src/test/stepBackTargetComposition.test.ts` with the exact failing shape:
     - Workflow: `kra_set, self_review, manager_check, audit, approved`
     - Data-bearing: `self_review, manager_check, audit`
     - Current: `approved`
     - Expected default: `audit`
     - Expected excluded targets: `skip_level_check`, `hr_pms_review`
   - Add a test for loading/stale-state behavior at helper level by ensuring defaults are derived only from final target composition.

7. **Documentation and policy sync**
   - Update `POLICY.md §117` to add: target dropdown must not render or enable stale fallback stages while period/data-bearing resolution is still loading.
   - Update `DOCUMENTATION.md` Version History with the RCA and fix.
   - Update `mem/features/admin/workflow-resilient-status-stepback` with the stricter default/anti-stale rule.

## Expected Result

After implementation, for Amol’s March 2026 approved KPI:

- The dropdown will show `KRA Set`, `Self Review`, `Manager Review`, and `Audit Review`.
- It will **not** show `Skip-level Review` or `HR PMS Review` for that period.
- The default selected target will be **Audit Review**.
- Confirming step-back will move the KPI from `Approved` back to `Audit Review`, preserving earlier Self/Manager data and clearing only downstream approved/final fields according to existing step-back policy.