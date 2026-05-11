# RCA: "32 could not be advanced" + "34 may have mismatched KPI names" after Propagate

## Short answer

Org KPI propagation is **not actually failing**. The server-side RPC (`propagate_org_kpi_value`) is doing the right thing — it correctly refuses to overwrite employee KPIs that have already advanced past the data-owner stage (POLICY §88). The DB matches what the per-row pills show ("31 Propagated / 4 Not propagated").

What is failing is the **client-side toast accounting**. Two separate code paths each turn a benign "already past kra_set" condition into a red, alarmist toast. They produce two simultaneous false alarms for the same Propagate click.

## What the screenshots actually mean

For the April 2026 "Fugitive Particulate Matter" KPI, the DB shows 37 employee KPI rows in this state:

```
self_review     :  9
manager_check   : 23
hr_pms_review   :  5
kra_set         :  0
```

So **none** of the mapped employees are still in `kra_set`. Most have already self-reviewed (or moved further). Per POLICY §88, a data owner cannot overwrite those — that is by design.

## Toast #1 — "32 employee KPI(s) could not be advanced … Repair Gap"

Source: `src/pages/admin/OrgKpiDataEntry.tsx` lines 974‑1011 (the half-propagation forward-guard).

It compares every `kpis` row that exists for this org KPI against `propagatedScopeIds` (the per-employee scope IDs the loop actually called). The bug:

- `propagatedScopeIds.push(sv.scopeId)` only runs **after** `propagate.mutateAsync` returns (line 918).
- Inside the loop, lines 891 and 895 `continue` early for any sub-row that is `null`, or is `0` and not `_touched` this session.
- Any employee whose sub-row was skipped client-side is therefore never added to `propagatedScopeIds`, so the guard later flags them as "missed" and prints the red Repair-Gap toast — even though there is nothing to repair (the row is already past the data-owner stage).

## Toast #2 — "Partial propagation: 1/35 employees updated, 34 may have mismatched KPI names"

Source: `src/pages/admin/OrgKpiDataEntry.tsx` lines 950‑965, combined with the early-return in `usePropagateOrgKpiValue.ts` line 289.

- For each per-employee call, the hook resolves target KPIs first; if the resolver returns 0 rows for that employee (e.g. RLS, name drift, or the row was deleted/moved), the hook returns `{ propagatedCount: 0, details: [] }` **without** any `skipped` field.
- Back in the page, `result.skipped || []` is empty, so neither `totalSkippedBenign` nor `totalSkippedHard` is incremented.
- `unaccounted = expectedCount − totalPropagated − accountedSkips` then equals every benignly-skipped employee.
- The page falls into the `else if (unaccounted > 0)` branch and prints "may have mismatched KPI names" — even though the real reason is "already past the data-owner stage".

## Why both toasts are wrong (and confusing)

- They tell the user to use **Repair Gap** or check the **Pending Report**, when in reality there is nothing to repair: the employee KPIs the toasts list have a fully populated `review_submissions` row already, just at a later workflow stage.
- The card chip and per-row pills (which use the ADR-055 `everyChildAdvanced` truth) correctly say "31 Propagated / 4 Not propagated". Only the toast layer is lying.
- Net effect: data integrity is fine; display copy contradicts itself ("31/35 Propagated" + "32 could not be advanced").

## Plan to fix (display layer only — no DB writes, no policy change)

1. **`usePropagateOrgKpiValue.ts` — close the silent-zero branch.**
   In the `if (targetKpis.length === 0)` early returns (lines ~289 and ~390), include an explicit `skippedCount` and a synthetic `skipped` entry:
   ```ts
   return {
     propagatedCount: 0,
     details: [],
     skippedCount: 1,
     skipped: [{ kpi_id: '—', current_status: 'unresolved', reason: 'no_target_rows' }],
   };
   ```
   This guarantees the page always sees a typed skip reason instead of an empty array.

2. **`OrgKpiDataEntry.tsx` — recognise benign skip reasons uniformly.**
   Extend the bucketing on line 915 to treat the workflow-locked reasons as benign:
   ```ts
   const BENIGN = new Set(['not_in_kra_set', 'reviewer_locked', 'no_target_rows']);
   if (BENIGN.has(s.reason)) totalSkippedBenign++;
   else totalSkippedHard++;
   ```
   `reviewer_locked` is what the RPC returns for `manager_check`/`hr_pms_review`/etc. — those are POLICY-§88 expected, not failures.

3. **`OrgKpiDataEntry.tsx` — push `propagatedScopeIds` for client-skipped svs too.**
   In the per-scope loop, when we `continue` at lines 891/895, still push `sv.scopeId` into `propagatedScopeIds` (or use a separate `consideredScopeIds` set in the half-prop guard). This stops the guard from flagging client-skipped rows as "missed" and eliminates the false Repair-Gap toast.

4. **`OrgKpiDataEntry.tsx` — soften the unaccounted-shortfall toast.**
   When `unaccounted > 0` but `propagatedScopeIds.length === expectedCount` AND every mapped child is past `kra_set` (already known via `orgLevelData.mappedEmpIdsByKey` + `kraSetEmpIdsByKey`), suppress the red toast and emit a single neutral "Already propagated — N rows past data-owner stage (POLICY §88)" toast instead.

5. **Tests — regression coverage.**
   - Extend `src/test/orgKpiPropagationToast.test.ts` with three cases: (a) all rows past `kra_set` → single "Already propagated" toast, no Repair Gap; (b) mixed (1 propagated + 34 reviewer-locked) → one summary toast, no false "mismatched names"; (c) genuine name mismatch (resolver returns 0 AND no kpis row exists) → keep showing the existing diagnostic.
   - New unit test on the bucketing helper to ensure `reviewer_locked` and `no_target_rows` are classified benign.

6. **Docs / Policy / Memory sync (atomic with the code change).**
   - `POLICY.md` — add §111.6 "Propagation toast classification" explaining benign vs hard skip reasons.
   - `DOCUMENTATION.md` — version note 2.66.10.3 with the RCA summary.
   - `mem/features/admin/org-kpi-propagation-truth.md` — append a 2026-05-11 bullet describing the toast-layer fix and the BENIGN reason set.
   - `docs/adr/ADR-055.md` — short follow-up note ("toast accounting now agrees with chip/pill").

## Risk & Impact Report

- **Data Impact**: None. No DB schema, RLS, or RPC changes. Only client-side toast logic.
- **Workflow Impact**: None. POLICY §88 (no overwrite past kra_set) remains enforced server-side.
- **UI/UX Consistency**: Removes contradiction between chip ("31/35 Propagated") and toast ("32 could not be advanced"). Brings toast layer in line with ADR-055 truth used by chip + per-row pill.
- **Regression Risk**: Low — the bucketing change is additive; the `propagatedScopeIds` widening only affects guard math; the early-return now emits a benign reason instead of nothing.
- **Mitigation**: New tests in step 5 cover both the false-alarm and the genuine-failure cases, so a future regression of either direction is caught.
