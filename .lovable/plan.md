## 1. Root Cause

The new `public.stage_ready_kpis(period, year, stage)` RPC (migration `20260617152650_…`) compares `k.status` (enum `review_status`) against `prev_stage` (text from `jsonb_array_elements_text`). Postgres has no `review_status = text` operator, so the RPC raises:

```
ERROR: 42883 operator does not exist: review_status = text
```

For Ankit (admin, HR PMS view, May 2026):
- `useStageReadyScope` → RPC error → `stageReadyScopeQ.isError = true`.
- The v2.66.38 fail-closed gate then treats the role-ready pair set as **empty**.
- The grid filter drops every row → "No KPIs match the selected scope."

Manually running the function body with `kpi_status::text = prev_stage` against May 2026 would yield ~217 HR PMS-ready rows (215 with workflow `…manager_check→hr_pms_review…` at status `manager_check`, plus 2 skip-level rows). None of them is Anil Pathak's 5S row (he's at `self_review` in an `audit→management_review` workflow without HR PMS), so the original regression remains fixed.

## 2. Risk & Impact

- **Data:** None — function body only; no schema or row changes.
- **Workflow:** Restores admin "role-ready only" filter to its intended behavior (only KPIs whose predecessor stage is complete).
- **UI/UX:** HR PMS-ready (and all other admin view-as roles) will again show actionable rows + count chip.
- **Regression risk:** Low — single CAST in one function; existing fail-closed behavior preserved on real loading/errors.
- **Scalability:** Same plan; cast is free.
- **Mitigation:** Add a SQL-shape test (`SELECT count(*) FROM stage_ready_kpis(...)` works without erroring) and keep existing pure-TS tests.

## 3. Plan

1. **Migration** — replace `public.stage_ready_kpis` so the `base` CTE selects `k.status::text AS kpi_status`. Everything else unchanged. Keep SECURITY DEFINER + admin guard + GRANT.
2. **Test** — add a vitest case asserting our TS simulator treats enum-shaped statuses correctly (string compare) and a comment pointing to the SQL fix. (We already have `adminStageReadyFilter.test.ts`; extend with an HR-PMS-via-manager-predecessor case to mirror the live data shape.)
3. **DOCUMENTATION.md** — append v2.66.39 entry: RCA (enum vs text), fix (cast to text), regression case (admin HR PMS view-as May 2026), rollback (revert migration).
4. **POLICY.md** — append a one-liner under §111.7.t.1 noting that workflow-stage comparisons inside RPCs must cast enums to text to remain compatible with `jsonb_array_elements_text`.

## 4. UI Changes

Not Applicable — pure backend fix. The existing "hr pms-ready only" pill, count chip, and selection-pruning logic all start working again once the RPC returns rows.

## 5. Tests

- Extend `src/test/bulkReview/adminStageReadyFailClosed.test.ts` with an HR-PMS-ready scenario where `prev_stage = manager_check` and `status = manager_check` (mirrors the 215-row case).
- Existing tests continue to pass.

## 6. Rollback

Re-apply the previous version of `stage_ready_kpis` from migration `20260617152650_…`. No data to revert.

## 7. Out of scope

- No change to `my_review_scope`, write RPCs, or frontend dashboard code.
- Anil Pathak regression remains covered.
