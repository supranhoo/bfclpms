# Why "Management" tile appears in the @Mention popup

## Root cause (RCA)

When you open a KPI from a mention notification, the popup is rendered by `MentionedKpiSheet` → `KpiReviewPanel` → `KpiJourneySection`.

`MentionedKpiSheet` (`src/components/review/MentionedKpiSheet.tsx`, lines 128–139) calls `KpiReviewPanel` **without passing `workflowStages`**. As a result:

- `KpiJourneySection` falls back to `DEFAULT_WORKFLOW_STAGES` (`src/lib/workflowEngine.ts:12`):
  `['kra_set','self_review','manager_check','audit','management_review','approved']`
- That default *includes* `management_review`, so the Journey always renders a **Management** tile (showing "N/A / No remarks" when no management score exists).

Everywhere else in the app (Dashboard "KPI Details", "View KPI Details", Team Reviews) we pass the **per-employee resolved workflow** from `useEmployeeWorkflowStages` / `resolveWorkflowForKpi`, so those views correctly hide Management when the KPI's actual workflow doesn't end in management. The mention sheet is the only entry point that skipped this — hence the inconsistency you saw for employee 101804 (whose workflow for that compliance KPI ends at Audit, not Management).

## Risk & Impact Report

- **Data Impact:** None. UI-only fix; no schema, RLS, or stored data changes.
- **Workflow Impact:** None. We only stop rendering a stage tile that was never part of this KPI's workflow.
- **UI/UX:** The mention popup will now match the Dashboard / View KPI Details exactly — same stages, same order, same evidence — eliminating the "why does Management show here but not there?" confusion.
- **Regression Risk:** Low. The change is isolated to `MentionedKpiSheet`. Other consumers of `KpiReviewPanel` already pass `workflowStages` and are unaffected.
- **Mitigation:** Add a unit test that asserts `MentionedKpiSheet` resolves and forwards the per-employee workflow, and a snapshot/assertion that Management is hidden when the workflow doesn't include `management_review`.

## Plan

1. **Resolve the real workflow inside `MentionedKpiSheet`**
   - Add a query that calls the existing helper `resolveWorkflowForKpi(kpi, employeeId, period, year)` (same one used by Dashboard / Team Reviews).
   - Pass the result as `workflowStages` into `KpiReviewPanel`.
   - While loading the workflow, keep the existing skeleton state so we never render with the default 6-stage fallback.

2. **Defensive default**
   - In `KpiJourneySection`, when `workflowStages` is `undefined` (not just empty), log a dev-only warning. This will catch any future caller that forgets to pass it.

3. **Tests (mandatory per engineering standards)**
   - `src/test/mentionedKpiSheet.workflow.test.tsx`: mocks a KPI whose resolved workflow is `['kra_set','self_review','manager_check','audit','approved']` and asserts the Management tile is **not** rendered.
   - Mock data: add a sample mention payload for a Compliance KPI matching employee 101804's real configuration (Audit-terminal workflow, N/A management).

4. **Docs / Policy sync**
   - `DOCUMENTATION.md` → "KPI Details rendering" section: document that *every* entry point into `KpiReviewPanel` must pass the per-employee resolved workflow; the default constant is a safety net only.
   - `POLICY.md` → add a one-line invariant: "Stage tiles in the Review Journey reflect the KPI's resolved workflow, never the global default."
   - `mem/features/review/unified-scorecard-component`: append note about MentionedKpiSheet now using `resolveWorkflowForKpi`.

## Files touched

- `src/components/review/MentionedKpiSheet.tsx` (resolve + pass workflowStages)
- `src/components/review/KpiJourneySection.tsx` (dev-only warning when workflowStages is undefined)
- `src/test/mentionedKpiSheet.workflow.test.tsx` (new)
- `DOCUMENTATION.md`, `POLICY.md`, `mem/features/review/unified-scorecard-component` (sync)

## Out of scope

- No change to notification dispatch, observation logic, or scoring.
- No change to other scorecards or stage rendering rules.
