## 1. Assumptions

- "End-to-end" = a full-flow automated test, run in CI without touching the live production database. The app's backend is the live BFCL Cloud project, so a test that literally writes `functional_manager_id` onto a real profile and advances real KPIs would mutate production data. I will build the E2E as a **backend-mocked, full-render integration flow** (React Testing Library + a fake Supabase client) that exercises the real components, hooks and resolvers end to end, plus an optional **read-only** Playwright smoke against the running preview. I will not write to production.
- "Every relevant dashboard view" = KPI dashboard stage strip/filters, Team review views, admin All-KPIs grid, scorecard/timeline surfaces, and management/bulk review grids.
- "All reports where this will need to be added" = every report that already enumerates per-stage columns, counts or fallbacks (verified list below).
- FM stage key is `functional_manager_check`; score fields are `functional_manager_score / _rating / _remarks / _evidence_urls`; mapping lives on `profiles.functional_manager_id`.

## 2. Verified current state

Confirmed by reading the code this turn:

- `src/lib/reviewConstants.ts` already exports `CANONICAL_WORKFLOW_STAGES` including `functional_manager_check`, plus label and colour entries.
- Already FM-aware: `workflowResolver.ts`, `bottleneckResolver.ts`, `kpiPendingWith.ts`, `finalApproverMap.ts`, `multimonthCycle.ts`, `inboxUtils.ts`, `finalScoreResolver.ts`, `KpiDetailsTable.tsx`, `KpiFilterBar.tsx`, `WorkflowProgressTracker.tsx`, `KpiTimeline.tsx`, `AllKpis.tsx`, `useKpiFilters.ts`, `useAdminDataEntry.ts`, `useKpiRollbackRequests.ts`, `EmployeeSelectorGrid.tsx`.
- **Not** FM-aware — every file below references `skip_level_*`/`hr_pms_*` but contains zero `functional_manager` references (grep-verified):
  - Reports: `KpiDetailReport.tsx`, `MonthlyScorecardReport.tsx`, `CompletionReport.tsx`, `DepartmentReport.tsx`, `KRAIssuance.tsx`, `KpiJourneyReport.tsx`, `PerformanceReport.tsx`.
  - Report plumbing: `src/lib/reportFieldRegistry.ts` (has Manager/Skip-Level/HR PMS/Auditor score fields, no FM score field).
  - Dashboards/components: `ManagementDashboard.tsx`, `PendingSelfReviews.tsx`, `DirectReporteesMonitor.tsx`, `KpiTrackerModal.tsx`, `EmployeeScorecard.tsx`, `ManagementScorecard.tsx`, `UnifiedScorecard.tsx`, `PreviousMonthsScoreMini.tsx`, `DailySubmissionSummary.tsx`, `BulkCellDrawer.tsx`, `BulkReviewMatrixGrid.tsx`, `BulkReviewVirtualGrid.tsx`, `AdminDataEntryDialog.tsx`, `AdminStatusStepBackDialog.tsx`, `BulkZeroScoreSection.tsx`, `FixCorruptedScoresDialog.tsx`, `PropagationPreviewDialog.tsx`.
  - Hooks/lib: `useKpis.ts`, `useEmployeeScoresForPeriod.ts`, `useKpiEmployeeMatrix.ts`, `usePendingSelfReviews.ts`, `useCompliancePenalty.ts`, `carriedScoreResolver.ts`, `bulkProcessedFilter.ts`, `teamReviewTileFilter.ts`.
- `src/lib/reports/catalog.ts` already has a `functional_manager` **person** field, but no FM **score/stage** field.
- No Playwright/E2E harness exists in `package.json`; Vitest + jsdom is the only test runner.

Not yet verified (will confirm before touching): whether the `report_field_registry` DB table needs an FM row seeded so admins can map the new columns, and whether any report RPC returns stage columns server-side.

## 3. Risk & impact report

- **Data impact**: none from the tests. The report-field additions are additive columns; if a `report_field_registry` seed is needed it is insert-only, reversible by delete. No schema drops, no RLS change.
- **Workflow impact**: none — FM stage semantics already exist server-side. This work makes existing data visible where it is currently dropped.
- **UI/UX impact**: one extra column/badge/count per affected report and dashboard, rendered **only** when the resolved workflow contains `functional_manager_check`. Non-F1 employees see no change. Column order: always immediately after Manager.
- **Regression risk**: medium-low but broad (30+ files). Two real hazards: (a) score-fallback chains — inserting FM into a cascade changes which score wins for F1 KPIs; (b) horizontal table width on already-wide reports.
- **Mitigation**: fallback-chain edits are covered by dedicated unit tests asserting F1 and non-F1 chains separately; every column addition is workflow-gated so non-F1 output is byte-identical (asserted in tests); changes are additive-only with no removals, so rollback = revert the commit.
- **Scalability**: no new queries. FM name resolution reuses the profile maps already fetched by each report; column selects add one nullable numeric field per row.

## 4. Plan

### Phase A — E2E flow test (the headline deliverable)

Create `src/test/e2e/functionalManagerWorkflow.e2e.test.tsx` with a shared harness `src/test/e2e/fmHarness.tsx`:

1. **Fake backend**: an in-memory store (profiles, kpis, review_submissions, workflow templates) behind a mocked `@/integrations/supabase/client`, so mutations really persist within the test and are read back — this is what makes it end-to-end rather than a render snapshot.
2. **Step 1 — Map the FM.** Render the admin Edit User dialog for a test employee, select a Functional Manager, save. Assert the mutation payload contains `functional_manager_id` and the store row is updated.
3. **Step 2 — Persistence / read-back.** Re-open the dialog and re-render the user list; assert the FM is shown (this is the exact ADR-194 read-back bug class).
4. **Step 3 — Workflow resolution.** Assert `resolveWorkflow` yields the `Self + L1 + F1 + Audit` chain with the FM as the named reviewer, and no `no_functional_manager_on_profile` reason.
5. **Step 4 — Render in every relevant view.** Parameterised over each surface, assert the FM stage appears with the right label/order, and assert the FM score renders once written:
   - KPI dashboard stage strip and status filter (`KpiFilterBar`)
   - `WorkflowProgressTracker`
   - `KpiTimeline`
   - `KpiDetailsTable`
   - `UnifiedScorecard` / `EmployeeScorecard`
   - Team review grid (`EmployeeSelectorGrid`) and admin `AllKpis`
   - Management / bulk review grids
6. **Step 5 — Stage progression persists.** Drive Self → Manager → **Functional Manager** → Audit through the real submit paths; after each step assert stored status and that "Pending With" resolves to the FM at the FM stage.
7. **Step 6 — Negative control.** Same run with `functional_manager_id = null` and a non-F1 template: assert no FM column, no FM chip, and that the workflow flags the missing-FM reason.

Plus an **optional read-only Playwright smoke** (`/tmp`-scoped, not committed unless you want it) that loads the current dashboard route for an existing F1 employee and screenshots the stage strip and KPI Details table as visual evidence. No writes.

### Phase B — Reports (no exceptions)

For each report, add the FM column/count/fallback, gated on the resolved workflow, positioned after Manager:

| Report | Change |
|---|---|
| KPI Detail Report | `functional_manager` field def + select + row mapping + the `stages.includes(...)` null-out guard that Skip-Level already has |
| Monthly Scorecard Report | `avg_functional_manager_score` field + weighted accumulator |
| Completion Report | `functional_manager_reviewed` count, chart bar, colour class, status branch |
| Department Report | `functional_manager_check` status-breakdown count, column, chart entry |
| KRA Issuance | status colour + label + count for `functional_manager_check` |
| KPI Journey Report | `functional_manager_at` timestamp column + label + header |
| Performance Report | FM inserted into the rating and score fallback chains |
| KPI Scorecard Detail / Status Tracker / Employee Matrix | verify Pending-With and score columns surface FM (they use the shared resolvers; fix any local chain found) |
| `reportFieldRegistry.ts` | add `scores.functional_manager_score` |
| `reports/catalog.ts` | add FM score/stage field alongside the existing FM person field |
| `report_field_registry` (DB) | if a row is required for admin mapping, seed it via migration (insert-only) |

### Phase C — Remaining dashboard/hook gaps

Apply the same FM treatment to the non-report files listed in §2, prioritised: score-fallback chains (`carriedScoreResolver`, `useKpis`, `useEmployeeScoresForPeriod`, `useKpiEmployeeMatrix`) → review surfaces (`UnifiedScorecard` cascade-clear + previous-score unions, `EmployeeScorecard`, `ManagementScorecard`, `PreviousMonthsScoreMini`, bulk grids) → admin dialogs (step-back, bulk-zero, propagation preview, corrupted-score fix) → tiles/filters (`teamReviewTileFilter`, `bulkProcessedFilter`, `usePendingSelfReviews`, `DirectReporteesMonitor`, `ManagementDashboard`).

### Phase D — Tests, docs, policy

- Unit tests per changed resolver/report: F1 path, non-F1 path, FM-unmapped path, zero-vs-null FM score.
- Extend existing stage tests (`kpiTimelineStages`, `teamReviewTileFilter`, `workflowResolver`, `kpiPendingWith`, `finalApproverMap`) with FM cases.
- Add a **drift guard** test: any module holding a stage array must equal `CANONICAL_WORKFLOW_STAGES` — this is what stops the next stage from silently vanishing.
- Update `DOCUMENTATION.md` (ADR-194 completion record) and `POLICY.md` (§WF-STAGE-SSOT extended to reports, plus §RPT-STAGE-COLUMN-PARITY: every stage-enumerating report must derive from the SSOT).

## 5. Verification

Step → check: A) `vitest run src/test/e2e` green; B) each report test green + manual render of one F1 and one non-F1 employee; C) full `vitest run` with no pre-existing failures introduced; D) `tsgo --noEmit` clean.

## 6. Rollback

Every change is additive and behind a workflow gate; reverting the commit restores prior behaviour. The only DB touch would be an insert-only registry seed, removable with a delete.

## 7. Open question

Confirm the E2E should stay backend-mocked (no production writes). If you want a true live-DB E2E, I would need a dedicated test employee and your explicit go-ahead to write to production data.
