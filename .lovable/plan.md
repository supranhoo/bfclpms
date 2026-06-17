## 1. Assumptions

- Ankit is an **admin** using the admin role-switch / viewer-stage dropdown to act as "HR PMS". His `effectiveRole === 'admin'`, while `viewerStage === 'hr_pms'`.
- The complaint "HR PMS sees auditor-stage data" reproduces because the admin pathway has **no scope/stage filter at all** — confirmed below.
- True HR PMS / Auditor / Manager / Skip-Level / Management users already get the correct stage-readiness gate from `my_review_scope` (shipped last cycle).

## 2. Evidence (RCA)

- Anil Kumar Pathak (200301), KPI "Implement 5S … Common KPI 5S", May 2026: `kpis.status = 'self_review'`. Next due stage = `manager_check`. He should NOT appear in any HR PMS / Auditor / Management view yet.
- `BulkReviewDashboard.tsx:343–349` defines:
  ```ts
  const isReviewerRole = effectiveRole === 'auditor' || 'manager' || 'hr_pms' || 'skip_level' || 'management';
  ```
  **`admin` is intentionally absent.** Therefore:
  - The "My scope only" toggle is hidden (`{isReviewerRole && ...}` on line 1065) → user reports "toggle is missing entirely".
  - The client-side filter `if (isReviewerRole && myScopeOnly && myReviewScope)` (line 393) never runs → every row of every status leaks into the grid for admin.
- The new `my_review_scope` RPC (verified in DB) correctly enforces `kpis.status = prev_stage` AND a reviewer-identity gate. For admin both gates are wrong: admin is not a reviewer, but admin still needs the stage-readiness gate so the dropdown means something.

## 3. 5 Why · RCA · CAPA

### 5 Why

1. Why does HR PMS view show Anil's KPI? — Because nothing filtered it out.
2. Why no filter? — `isReviewerRole` is false for admin, so the `myScopeOnly` filter branch is skipped.
3. Why was admin excluded? — Original toggle was about "rows assigned to **me**"; admin isn't a reviewer, so the concept didn't apply.
4. Why is that wrong now? — Admins routinely use the viewer-stage dropdown to QA / bulk-act AS another stage; without a stage-readiness filter the grid shows pre-stage rows that look like a workflow bug to them.
5. Why didn't tests catch it? — Existing tests assert behavior for reviewer roles. There is no test for `effectiveRole === 'admin'` + non-admin `viewerStage`.

### Root Cause

The Bulk Review filter bar conflates **"who am I"** (reviewer identity) with **"which stage am I acting at"** (viewer stage). The stage-readiness gate is bolted onto the reviewer-identity gate inside `my_review_scope`, so it is unreachable for admins.

### CAPA

- **Corrective:** Split the two concerns. Add a separate "Stage-ready only" filter that admin sees (and reviewers can optionally consult too), independent of reviewer identity.
- **Preventive:** Regression tests covering `effectiveRole='admin'` + each `viewerStage`.
- **Detective:** Optional one-off audit query: rows in current view whose `kpis.status` is upstream of the chosen `viewerStage`'s predecessor.

## 4. Risk & Impact Report

- **Data Impact:** None. Read-only filter change + one new SECURITY DEFINER read RPC.
- **Workflow Impact:** None. No write paths altered.
- **UI/UX Impact:** One new toggle button visible only when `effectiveRole === 'admin'` AND `viewerStage !== 'admin'`. Default ON. Same look as existing toggle (UserCheck → ListChecks icon, "Stage-ready only" / "All stages").
- **Regression Risk:** Low. Reviewer-role path is untouched; admin path adds a filter that defaults to a stricter view — if surprised, admin clicks to disable.
- **Scalability:** New RPC runs the same workflow-resolution CTE as `my_review_scope` minus the identity check; equivalent cost.
- **Rollback:** Drop the new RPC + revert the dashboard hunk (single component, < 60 LOC).

## 5. Step-by-step Plan

1. **DB migration** — add `public.stage_ready_kpis(p_period text, p_year int, p_stage text)` returning `(kpi_id uuid, employee_id uuid)`. Body = the `base + staged + ready` CTEs from `my_review_scope` (workflow → prev_stage → status match) **without** the reviewer-identity `CASE`. SECURITY DEFINER, search_path=public, EXECUTE granted to `authenticated`. Internally guarded with `public.has_role(auth.uid(),'admin')` so non-admins get an empty set (no information leak about other employees' workflow positions).
2. **New hook** `useStageReadyScope(period, year, stage, enabled)` in `src/hooks/useBulkReview.ts` mirroring `useMyReviewScope`; same `pairs: Set<\`${kpi}|${emp}>`shape so it can reuse`isRowInMyReviewScope` predicate.
3. `**BulkReviewDashboard.tsx**` — minimal edits:
  - Add `const isAdminViewer = effectiveRole === 'admin';`
  - Add localStorage-backed `[adminStageReadyOnly, setAdminStageReadyOnly]` defaulted to `true`.
  - Wire `useStageReadyScope(period, year, viewerStage, isAdminViewer)`; when toggle is ON, apply `isRowInMyReviewScope(row, stageReadyScope.pairs)` inside the existing `loadedRows` memo (before the reviewer branch).
  - Render a second toggle button next to "My scope only", visible only when `isAdminViewer`, with the same chip count UX and a tooltip: *"Showing only KPIs whose previous stage has been completed in {viewerStage}. Rows still upstream are hidden."*
4. **Tests** —
  - `src/test/bulkReview/adminStageReadyFilter.test.ts` — pure-function simulator over a fixed workflow `[self_review, manager_check, audit, hr_pms_review]` with rows in every status; assert that `viewerStage='hr_pms'` returns only `status='audit'` rows; `viewerStage='auditor'` returns only `status='manager_check'`; etc.
  - Extend `auditScopeAndCategoryFilters.test.ts` with one case: admin + `viewerStage='hr_pms'` + `adminStageReadyOnly=true` → Anil's `self_review` row is filtered out.
5. **Docs** — version entry in `DOCUMENTATION.md` (RCA + the split between reviewer-identity and stage-readiness); add §111.7.t to `POLICY.md`: *Admin acting as a stage sees stage-ready rows by default; toggle off to see the full matrix for QA.*
6. **Post-deploy sanity** — re-open Bulk Review as admin → choose HR PMS → confirm Anil Pathak's 5S row disappears; toggle off → it re-appears.

## 6. UI Changes

- Location: filter-bar of `/dashboard?view=review/bulk` (BulkReviewDashboard).
- New button right of "My scope only": `<ListChecks/> Stage-ready only` (or `All stages` when OFF) with a small count chip. Visible only when `effectiveRole === 'admin'`. Same height/typography as siblings, no layout shift.
- Tooltip explains the gate in plain English and names the active `viewerStage`.
- Responsive: identical to the existing toggle; wraps on small screens.

## 7. Implementation (technical)

- `stage_ready_kpis` SQL skeleton:
  ```sql
  CREATE OR REPLACE FUNCTION public.stage_ready_kpis(p_period text, p_year int, p_stage text)
  RETURNS TABLE(kpi_id uuid, employee_id uuid)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
  DECLARE uid uuid := auth.uid(); stage_token text;
  BEGIN
    IF uid IS NULL OR NOT public.has_role(uid,'admin'::public.app_role) THEN RETURN; END IF;
    stage_token := CASE p_stage WHEN 'manager' THEN 'manager_check' WHEN 'functional_manager' THEN 'functional_manager_check'
       WHEN 'skip_level' THEN 'skip_level_check' WHEN 'auditor' THEN 'audit'
       WHEN 'hr_pms' THEN 'hr_pms_review' WHEN 'management' THEN 'management_review' END;
    IF stage_token IS NULL THEN RETURN; END IF;
    RETURN QUERY
    WITH base AS (...), staged AS (...), ready AS (...)
    SELECT r.kpi_id, r.employee_id FROM ready r;
  END $$;
  GRANT EXECUTE ON FUNCTION public.stage_ready_kpis(text,int,text) TO authenticated;
  ```
- Client filter integration:
  ```ts
  if (isAdminViewer && adminStageReadyOnly && stageReadyScope) {
    rows = rows.filter(r => isRowInMyReviewScope(r, stageReadyScope.pairs));
  }
  ```

## 8. Tests

- New: `src/test/bulkReview/adminStageReadyFilter.test.ts` (≥6 cases, every stage + missing workflow + null status + custom workflow without `audit`).
- Extended: `auditScopeAndCategoryFilters.test.ts` with admin/HR-PMS Anil regression case.
- Existing 47 bulk-review tests must remain green.

## 9. DOCUMENTATION.md updates

- New v-entry "Bulk Review — admin stage-ready filter": 5-Why, RCA, fix, rollback. Note the conceptual split between reviewer-identity and stage-readiness.

## 10. POLICY.md updates

- §111.7.t **Admin stage-aware viewing**: admins acting through the viewer-stage dropdown see only stage-ready KPIs by default; toggling off is QA-only and audit-logged via the existing review-action timeline (no additional logging needed — no write occurs).
- Reaffirm: HR PMS users never see Auditor-stage rows; the admin path now enforces the same invariant via a separate filter rather than the reviewer-identity gate.

## 11. Post-implementation notes

- Quick read-only verification query I will run post-deploy:
  ```sql
  SELECT k.kpi_name, p.full_name, k.status FROM kpis k JOIN profiles p ON p.id=k.employee_id
  WHERE k.review_period='May' AND k.review_year=2026 AND k.status='self_review' LIMIT 20;
  ```
  These are the rows that disappear from the HR PMS admin view.
- If you'd rather not touch the admin path and instead **hide the viewer-stage dropdown for admin entirely** (force admin to use a dedicated /admin/bulk-override page), say the word and I'll re-plan.