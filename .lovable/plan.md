# Functional Manager visibility + mid-flight workflow change safety

## 1. Assumptions
- "Functional Manager" (FM) stays a **relationship** (`profiles.functional_manager_id`), not an `app_role` — consistent with `useIsFunctionalManager`.
- FM must see/act only on employees mapped to them, only at the `functional_manager_check` stage (RLS already enforces this).
- "No rating should be lost" = when a workflow template changes mid-flight, previously captured stage scores (self/manager/FM/auditor…) and the previously computed final score must be preserved/restorable, and only genuinely-new stages should be requested again.

## 2. Verified current state (from reads/queries this turn)
- `profiles.functional_manager_id` is populated for **22 active employees**, all mapped to Saibal Kunar (200834, role `manager`); none of them report to him directly.
- Two active templates contain `functional_manager_check`: `self_l1_fm_hr_pms`, `self_l1_f1_audit` (2 employees currently on the FM template via `workflow_config`).
- **Roster RPCs ignore FM entirely**: `get_manager_team_roster(_viewer_id)` and `get_reviewer_roster_slim()` build direct/indirect sets purely from `reporting_manager_id`. `useTeamMembers` filters `.eq('reporting_manager_id', …)`. So an FM's Team view is empty.
- `Dashboard.tsx` `availableModes` grants the `team` tab only for roles `manager|admin|management` or when skip-level reports exist — no FM condition.
- No client hook/resolver in `src/services/reports/pendingWithResolver.ts`, `useReviewerDashboardPage.ts`, `useKpis.ts`, `usePendingSelfReviews.ts`, `EmployeeSelectorGrid.tsx`, `useKpiFilters.ts` references `functional_manager` at all — so "Pending With", reviewer counts, filters and grids can't attribute the FM stage.
- RLS is already correct: policies `FM can view/update KPIs…` and `…review_submissions…` exist, plus helper `is_functional_manager_of`. Bulk Review already exposes the FM stage (`bulkReviewerStages.ts`, `workflowEngine.ts`).
- Trigger `workflow_change_step_back()` uses a **hardcoded canonical array** that omits `functional_manager_check`:
  `ARRAY['kra_set','self_review','manager_check','skip_level_check','hr_pms_review','audit','management_review']`.
  Consequences: (a) adding an FM stage mid-flight never triggers a step-back, so the FM never gets the item; (b) if the *old* terminal was `functional_manager_check`, its canonical position resolves to `0`, so **any** stage in the new template looks "beyond it" and the KPI is stepped back unnecessarily.
- The same trigger does `UPDATE review_submissions SET final_score = NULL, final_rating = NULL` for the terminal KPI **and all multi-month siblings**, with no snapshot — this is the rating-loss path the user is reporting.

## 3. RCA / 5-Why
**Symptom A — FM sees nothing.**
1. Why? FM's Team view is empty → 2. Why? Roster comes from `get_manager_team_roster` / `get_reviewer_roster_slim` → 3. Why? Both derive membership only from `reporting_manager_id` → 4. Why? FM was added later as a workflow stage only (engine + RLS + bulk review) → 5. **Root cause:** no single source of truth for "employees I review"; each surface re-implements reporting-line SQL.

**Symptom B — ratings lost on mid-flight workflow change.**
1. Why? Final score blanks out → 2. Why? Step-back trigger nulls `final_score`/`final_rating` → 3. Why? It assumes re-approval will recompute → 4. Why? No snapshot/restore and no stage-aware diff (only "is any new stage beyond old terminal?") → 5. **Root cause:** structural workflow edits are treated as destructive resets rather than an additive stage diff, and the stage ordering is hardcoded (FM missing), so the diff is wrong.

## 4. Risk & Impact Report
- **Data impact:** New DB function + trigger rewrite; adds an audit-logged snapshot column/table for prior final score. No column drops. Backfill limited to repairing FM-affected KPIs (currently 0 KPIs exist for FM-mapped employees, so blast radius today is minimal).
- **Workflow impact:** FM gains read+act access to mapped employees' KPIs at the FM stage only. Existing manager/skip/HR/auditor scoping unchanged (additive union).
- **UI/UX impact:** Team tab becomes available to FMs; grids gain an "FM" relationship badge and an FM column/filter; "Pending With" resolves FM names instead of blank.
- **Regression risk:** Medium — roster RPCs are consumed by many dashboards. Mitigated by making FM inclusion a **union** (never removes rows) and by keeping the `relationship` values additive (`'functional'`).
- **Scalability:** Union adds one indexed predicate (`functional_manager_id`); add an index if absent. No N+1 added.
- **Rollback:** All changes are additive; previous RPC bodies restorable via a one-statement `CREATE OR REPLACE`, trigger revert documented in the ADR.

## 5. Implementation plan

### Phase 1 — Reviewer-scope SSOT (backend)
1. Add `public.get_functional_report_ids(_viewer uuid)` (SECURITY DEFINER, STABLE) returning active employees with `functional_manager_id = _viewer`.
2. `CREATE OR REPLACE get_manager_team_roster` — add a third CTE `functional_reports`, tagged `relationship = 'functional'`, de-duplicated against direct/indirect.
3. `CREATE OR REPLACE get_reviewer_roster_slim` — union FM reports into the non-full-access branch.
4. Index check: `idx_profiles_functional_manager_id` (create if missing).
5. Grants unchanged (functions are SECURITY DEFINER, `EXECUTE` to `authenticated`).

### Phase 2 — Stage-order SSOT (no more hardcoded arrays)
6. Add `public.canonical_stage_order(stage text) → int` including `functional_manager_check` between `manager_check` and `skip_level_check`, mirroring `src/lib/workflowEngine.ts`.
7. Replace every hardcoded canonical array in `workflow_change_step_back()` with this function.
8. Mirror check in TS: extend `src/lib/workflowEngine.ts` canonical list assertions with a unit test that the DB order and TS order match (string-compare against the migration file, same pattern as `supersedeTerminalPromotion.test.ts`).

### Phase 3 — Rating-preserving workflow change
9. Rewrite `workflow_change_step_back()` to an **additive diff**:
   - Compute `added_stages = new \ old` and `removed_stages = old \ new`.
   - If no stage is added *after the currently completed stage*, **do nothing** (no step-back, no score nulling).
   - If stages are added downstream, step the KPI back to the stage immediately preceding the first new stage, **preserving all existing stage scores** (`self_score`, `manager_score`, `functional_manager_score`, `auditor_score`, …).
   - Instead of nulling, snapshot `final_score`/`final_rating` into `review_submissions.prior_final_score` / `prior_final_rating` (new nullable columns) **and** into `kpi_audit_logs.old_value`; only then clear the live final fields.
10. Add `restore_final_score_if_unchanged()` behaviour: if a later workflow edit reverts to a template whose terminal is already satisfied, re-promote using the snapshot rather than forcing a re-review.
11. Removed stages: never delete their captured scores — mark them superseded in the audit log (same principle as `§AR-SUPERSEDE-NO-FALSE-REWIND`).

### Phase 4 — FM in the UI
12. `Dashboard.tsx`: include `team` mode when `useIsFunctionalManager()` is true.
13. `useOrganization.ts` (`useTeamMembers`, `useManagerTeamRoster`): surface the `'functional'` relationship; keep types additive.
14. `EmployeeSelectorGrid.tsx`: FM relationship badge, FM name column, and "Functional Manager" option in the manager filter.
15. `src/services/reports/pendingWithResolver.ts` + `useReviewerDashboardPage.ts` + `useKpiFilters.ts` + `usePendingSelfReviews.ts`: map `functional_manager_check` → the employee's `functional_manager_id` for "Pending With", counts, and stage filters (`bottleneckResolver.ts` already has `awaiting_functional_manager`).
16. Reports: ensure the existing `functional_manager` column in `EmployeePerformanceSummary` / `catalog.ts` is populated from the resolver, and add the FM stage column to KPI Status Tracker's dynamic workflow columns.

### Phase 5 — Verification
17. Unit tests: canonical stage order parity; step-back diff (no-op / additive / removal cases); FM roster inclusion shape; pending-with FM resolution.
18. Live check with employee codes 201159 / 201162 (FM = 200834) after assigning them an FM template: FM sees them in Team, can score at `functional_manager_check`, and a template swap mid-flight leaves prior scores intact.
19. Update `DOCUMENTATION.md`, `POLICY.md` (new **§FM-REVIEWER-SCOPE** and **§WF-CHANGE-NO-RATING-LOSS**), and add **ADR-193**.

## 6. Open question (answer changes Phase 1 scope)
Should the FM see **only** their FM-mapped employees, or FM-mapped employees **plus** their normal reporting line merged into one Team list? The plan currently assumes a merged list with a distinguishing `'functional'` badge.
