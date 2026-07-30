## Assumptions
- "Vrindaban Das" = Brundaban Chandra Das (102028); FM = V.A.V.S.S. Ganapathi Varma (200271), who holds the `manager` role but is NOT 102028's L1 (that is Sajid Raza, 100264).
- Scope is June 2026, but the fix is generic to every FM-mapped employee.

## Verified current state
- `profiles` 102028: `functional_manager_id = Ganapathi Varma`, `reporting_manager_id = Sajid Raza`. Both active.
- Workflow for 102028 / June 2026 resolves to `self_l1_f1_audit` = `kra_set → self_review → manager_check → functional_manager_check → audit → approved` (employee-level ongoing `workflow_config` row). So FM IS in the chain.
- All 20 June-2026 KPIs are at `status = 'manager_check'`. Per the project convention (status = last COMPLETED stage), they are pending with the Functional Manager — matching the screenshot (Manager Check 20, Functional Mgr 0).

## Root cause (two independent defects)

**RC-1 — Client: there is no Functional Manager scorecard view.**
`UnifiedScorecard`'s `ScorecardViewLevel` is `'self' | 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms'` — `functional_manager` is missing, and `VIEW_LEVEL_STATIC` has no entry for it. `Dashboard.tsx` (line ~358) maps `team` → `manager` and only special-cases `relationship === 'indirect'` → `skip_level`; the `'functional'` relationship (added by ADR-193 to the roster RPCs) is never mapped. Result: the FM opens the employee as `viewLevel='manager'`, whose `reviewableStatuses` = `['self_review']`. KPIs at `manager_check` therefore render read-only — exactly what the user reports. `workflowEngine.ts` already supports `functional_manager` in every resolver; only the scorecard/dashboard layer is unwired.

**RC-2 — Server: FM write policies gate on the wrong status.**
- `kpis` policy "FM can update KPI status on FM stage": `USING (is_functional_manager_of(employee_id) AND status = 'functional_manager_check')`
- `review_submissions` policy "FM can update review_submissions on FM stage": same `k.status = 'functional_manager_check'` predicate.

`functional_manager_check` is the status set AFTER the FM signs off. While pending with the FM the status is the PRECEDING stage (`manager_check`). So even if the UI were fixed, the write would be rejected by RLS. There is also no FM INSERT policy on `review_submissions` (needed when a submission row is absent).

## 5 Why
1. FM cannot review → the scorecard renders read-only and writes would be denied.
2. Why read-only → the scorecard runs as `viewLevel='manager'`, whose reviewable status is `self_review`.
3. Why `manager` → Dashboard's view-level map has no branch for the `functional` relationship and `ScorecardViewLevel` has no `functional_manager` member.
4. Why writes denied → FM RLS predicates were written against the FM's own completed stage instead of the pending (preceding) stage.
5. Why both → ADR-193/194/196 delivered FM data, roster, columns and report parity, but never the reviewer ACTION path; no test exercised an FM actually submitting a score.

## Risk & Impact
- Data: no schema change; policy replacement only (additive/corrective). Historical rows untouched.
- Workflow: FM stage becomes actionable; forward status already resolves via `resolveForwardStatus('functional_manager', stages)` → `audit` for this template.
- UI: Team Reviews for an FM-mapped employee gains an editable FM column/action, header label "Functional Manager Review", send-back targets from `resolveSendBackTargets`.
- Regression risk: medium-low. Guarded by keeping the L1 path untouched — the new branch fires only when `relationship === 'functional'` and the resolved chain contains `functional_manager_check`.
- Scalability: none (no new queries).
- Rollback: revert the two policies to their current definitions and drop the new view-level branch.

## Plan

### Phase A — Server (migration)
1. Replace the `kpis` FM UPDATE policy: allow when `is_functional_manager_of(employee_id)` AND the KPI's current status is the stage immediately preceding `functional_manager_check` in that employee's resolved chain, OR is already `functional_manager_check` (re-edit). Implement via a new SECURITY DEFINER helper `public.is_fm_actionable_kpi(kpi_id uuid)` that resolves the chain with `get_employee_workflow(employee_id, review_period, review_year)` — no hardcoded stage array (POLICY §105).
   Verification: `SELECT is_fm_actionable_kpi(id)` returns true for the 20 June-2026 KPIs of 102028.
2. Same helper for the `review_submissions` FM UPDATE policy; add a matching FM INSERT policy.
   Verification: simulated FM update on one KPI succeeds; a non-FM user still fails.
3. Confirm the FM stage is included in the notification/audit triggers already touched by ADR-196 (no change expected — verify only).

### Phase B — Client
4. `UnifiedScorecard.tsx`: add `'functional_manager'` to `ScorecardViewLevel` and a `VIEW_LEVEL_STATIC` entry (title "Functional Manager Review", score field `functional_manager_score`, rating/remarks/evidence/achieved-value fields, `previousScoreField: 'manager_score'`). All dynamic resolvers already accept the key.
5. `Dashboard.tsx`: extend the view-level resolution — when `viewMode === 'team'` and `selectedEmployee.relationship === 'functional'`, use `functional_manager`. Keep `indirect → skip_level` and default `direct → manager`.
   UI change: same Team Reviews screen; the KPI Details action column becomes editable for the FM and the header reads "Functional Manager Review". Stage strip and counters unchanged (already FM-aware via `CANONICAL_WORKFLOW_STAGES`).
6. `EmployeeSelectorGrid` already tags "Functional" and counts via `resolveReviewableStatuses('functional_manager')` — verify only, no change expected.

### Phase C — Tests & docs
7. New `src/test/review/functionalManagerReviewAction.test.ts`: view-level resolution for `functional`/`indirect`/`direct`; `VIEW_LEVEL_STATIC` completeness for every `ScorecardViewLevel`; FM reviewable status = stage preceding FM in `self_l1_f1_audit`; forward status = `audit`.
8. Extend `src/test/e2e/functionalManagerWorkflow.e2e.test.tsx` with an FM submit assertion.
9. `docs/adr/ADR-206.md` + `POLICY.md §WF-FM-REVIEW-ACTION` ("A reviewer stage present in a resolved chain MUST have a scorecard view level and RLS predicates keyed to the PENDING status, not the reviewer's own completed status"), plus DOCUMENTATION.md version history.

### Phase D — Verification for the reported case
10. Sign-in-equivalent check as Ganapathi Varma: 20 June-2026 KPIs of 102028 appear actionable; one test score save succeeds and advances that KPI to `functional_manager_check`.

## Not applicable
No data backfill — the 20 KPIs are correctly positioned; only access was broken.
