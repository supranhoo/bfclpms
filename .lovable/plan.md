## Root cause

The department head **Rupesh** cannot see the submitted review because the Postgres RLS policies on `annual_review_instances` were never taught about the `dept_head_id` slot. The app-layer query (`annualReviewService.ts:554`) already `.or(...)`s across manager/skip/**dept_head**/bu/hr, but PostgREST enforces RLS *first*, so the row is filtered out before the app sees it. Everything else is correct:

- Instance `e35bbe35-…` is at `overall_status = 'pending_dept'` with `dept_head_id` set to Rupesh and `enabled_stages = [self, dept_head, bu_head, hr]`.
- `STATUS_FILTERS` / "Dept Head" tab wiring, `stageForReviewer`, and `stageChain.nextStatus` all handle `pending_dept` correctly (from last turn's fix).

The gap is server-side:

```sql
-- instances_select_visible (current)
employee_id = auth.uid() OR manager_id = auth.uid() OR skip_id = auth.uid()
  OR bu_head_id = auth.uid() OR hr_id = auth.uid()
  OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr_pms')
-- ❌ dept_head_id missing
```

`instances_stage_update` has the same gap — even after the SELECT fix, Rupesh could not submit/send-back without the UPDATE arm.

## Fix scope

### 1. Migration — restore Dept Head RLS (the only real change)
New migration adds `dept_head_id` to both policies on `annual_review_instances`. Uses `DROP POLICY IF EXISTS … / CREATE POLICY …` (safe re-run, additive semantics).

```sql
-- SELECT: add dept_head_id arm
DROP POLICY IF EXISTS instances_select_visible ON public.annual_review_instances;
CREATE POLICY instances_select_visible ON public.annual_review_instances
FOR SELECT TO authenticated
USING (
  employee_id  = auth.uid()
  OR manager_id   = auth.uid()
  OR skip_id      = auth.uid()
  OR dept_head_id = auth.uid()   -- ← added
  OR bu_head_id   = auth.uid()
  OR hr_id        = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'hr_pms')
);

-- UPDATE: allow dept_head to advance/send back only while pending_dept
DROP POLICY IF EXISTS instances_stage_update ON public.annual_review_instances;
CREATE POLICY instances_stage_update ON public.annual_review_instances
FOR UPDATE TO authenticated
USING (
  (manager_id   = auth.uid() AND overall_status = 'pending_manager')
  OR (skip_id      = auth.uid() AND overall_status = 'pending_skip')
  OR (dept_head_id = auth.uid() AND overall_status = 'pending_dept')   -- ← added
  OR (bu_head_id   = auth.uid() AND overall_status = 'pending_bu')
  OR (hr_id        = auth.uid() AND overall_status = 'pending_hr')
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'hr_pms')
)
WITH CHECK (/* same predicate */);
```

Exact `USING`/`WITH CHECK` bodies will be read from the live policy first and preserved verbatim except for the added arm, so we don't drop any pre-existing carve-outs (proxy submissions, admin bypasses, etc.). No `GRANT` change — grants already exist.

### 2. No client changes
Service query, hook, tab wiring, and reviewer role SSOT already handle dept_head. Confirmed at `src/services/annualReview/annualReviewService.ts:515,554`, `src/pages/annual-review/TeamAnnualReview.tsx:27–36`, `src/lib/annualReview/stageForReviewer.ts:28`.

### 3. Tests
- `supabase/tests/rls/annual_review_instances_dept_head.sql` (new, or pgTAP-style seed script under existing test folder) — asserts a dept_head user can SELECT and UPDATE only their own `pending_dept` row, and cannot touch other stages.
- Extend `src/lib/annualReview/stageForReviewer.test.ts` with a "queue predicate" contract test that spells out all 5 reviewer id slots the RLS policy must cover — so the next time someone adds a slot (e.g. a new stage) the test forces them to update RLS too.

### 4. Docs & policy
- `DOCUMENTATION.md` — `v2.66.75` entry: "Dept Head RLS parity on annual_review_instances (SELECT + UPDATE)." RCA: Rupesh Vithal Dalvi, instance `e35bbe35-…`.
- `POLICY.md` — under Annual Review Governance: reviewer visibility SSOT — RLS on `annual_review_instances` must include every reviewer id in `stageChain.ALL_STAGES`.
- `mem://features/annual-review/overview.md` — one-liner: RLS SELECT/UPDATE on `annual_review_instances` must cover all five `*_id` reviewer slots; regression-guarded by the new pgTAP test.

## Risk & impact

- **Data:** additive. No column change, no data rewrite. Existing rows unchanged.
- **Workflow:** Rupesh (and every other Dept Head sitting on a `pending_dept` instance today) immediately sees and can act on their queue. Matches the intent already reflected in the app query.
- **Regression risk:** low. Policy change is strictly a widening for the `dept_head_id` slot; other arms preserved verbatim. UPDATE is scoped to `overall_status = 'pending_dept'` so a dept_head cannot mutate rows outside their stage.
- **Security:** no new roles/grants; auth.uid() equality only. Admin/HR bypasses unchanged.
- **Rollback:** re-run the previous `CREATE POLICY` bodies (kept in the migration comment header) — pure DDL, instantaneous.

## Not applicable
Backup coverage, pagination, offline resilience, UI layout — unchanged.
