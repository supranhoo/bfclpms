# Bulk Review "Due only" filter — WHY/RCA/CAPA

## What the user sees

"Due only" toggle ON or OFF → same counts (`54 KPIs, 27 employees, 269 cells`). Tooltip claims multi-month sibling rows are hidden, but nothing changes.

## RCA

The pure helper `src/lib/bulkReviewDueFilter.ts` has a safety short-circuit on line 38 that swallows the filter for almost every multi-month row in production:

```ts
// Multi-month: cycle-start is required to disambiguate ...
// Per POLICY §128 we do NOT silently default — if the
// field is missing we treat the row as due so the user is
// never wrongly hidden from work they need to do.
if (!row.frequency_cycle_start) return true;
```

What the live data looks like in `kpis` for `review_period='April', review_year=2026` (snapshot input):

| frequency | frequency_cycle_start | rows |
|---|---|---|
| Bi-Monthly | Feb-Mar | 45 |
| Bi-Monthly | (empty) | included via null fallback |
| Quarterly  | **NULL** | **42** |
| Quarterly  | Apr-Jun | 3 |
| Quarterly  | Jul-Sep | 1 |
| Half-Yearly | May-Oct | 1 |
| Monthly / Weekly / Daily | — | bulk of dataset |

So of the multi-month rows that should be evaluated by the filter, **the vast majority have NULL `frequency_cycle_start`** (data is not POLICY §128-compliant — see Migration Governance memory). Every one of those rows hits the line-38 short-circuit and returns `due = true` → never hidden.

Verified by running `isKpiLockedForPeriod` directly for April 2026:

```
Bi-Monthly Feb-Mar → due=false  (would hide — correct)
Quarterly Apr-Jun  → due=false  (would hide — correct)
Quarterly null     → due=false  (would hide — but BLOCKED by short-circuit)
Half-Yearly May-Oct → due=true  (edge cycle — see §Secondary below)
```

With the short-circuit in place, the only rows the filter actually trims are the ~48 with non-null `frequency_cycle_start`. In the auditor's loaded scope (Load Scope = 1 reviewer), those rows often aren't represented at all, so the visible counts and the `nonDueHiddenCount` badge both stay at zero — the toggle appears dead.

### Secondary contributing causes

1. **Helper conflates "outside the cycle" with "active month".** `isKpiLockedForPeriod` only flags months that appear in the cycle's `lockedMonths` list. Months that don't belong to the cycle at all (e.g. April for a `Half-Yearly May-Oct` row) are reported as "not locked" → treated as "due". That's wrong: due should mean *the selected month IS the cycle's anchor month*, not just *the selected month is not in the locked list*.

2. **Display dedup masks small wins.** `BulkReviewMatrixGrid` derives the visible `kpiRows` / `employees` / `cells` from `loadedRows` after dedup by KPI key. Even when the helper correctly hides 3 rows, the unique KPI count may not move (the same KPI is still represented by another employee row). The badge counts raw rows, the headline counts unique KPIs → the toggle looks broken even when it works.

3. **Data quality.** 42 Quarterly + 1 Bi-Monthly rows for April have NULL / empty `frequency_cycle_start`, violating POLICY §128. Out of scope to backfill here, but a real cause of the symptom.

## Why didn't tests catch it?

`src/test/bulkReview/dueFilter.test.ts` only exercises rows where `frequency_cycle_start` is explicitly populated. There is no test for `cycle_start = null` on a Bi-Monthly / Quarterly / Half-Yearly / Yearly row, so the short-circuit was never exercised in a "should be hidden" scenario.

## CAPA

### Step 1 — Make the filter operate on the cascading cycle default

Edit `src/lib/bulkReviewDueFilter.ts`:

- **Remove the line-38 short-circuit.** When `frequency_cycle_start` is null/empty, pass `undefined` through to `isKpiLockedForPeriod` — it already cascades to the first cycle option (`getDefaultCycleStart`) which produces the correct lock pattern (e.g. Quarterly defaults to Jan-Mar, so April → locked → hidden).
- **Tighten "due" semantics** so a row whose cycle does not include the selected month at all is also treated as **not due**. Use `getCycleMonths(...)` and require `selectedMonth ∈ cycleMonths` before consulting `isKpiLockedForPeriod`. This removes the false-positives for off-cycle rows like `Half-Yearly May-Oct` in April.
- Keep the helper pure; signature unchanged.

> Decision: we considered keeping the safety default but logging a warning. Rejected — the safety default *is* the bug for this feature. The cascading default (`getDefaultCycleStart`) is already the project-wide convention used by every other multi-month code path; aligning the filter with it removes the inconsistency. POLICY §128 governs *write* paths (don't silently default into storage), not read-time UI filters.

### Step 2 — Update tests in `src/test/bulkReview/dueFilter.test.ts`

Add cases covering:
- Quarterly with `cycle_start = null` in April → hidden.
- Quarterly with `cycle_start = null` in March (default Q1 active) → visible.
- Bi-Monthly with `cycle_start = null` in April (active of Mar-Apr default) → visible.
- Half-Yearly `May-Oct` in April (off-cycle entirely) → hidden.
- Existing cases stay green.

### Step 3 — UX clarity in `BulkReviewDashboard.tsx`

- Recompute `nonDueHiddenCount` from `rawRows` AFTER the same attribute filters that gate `loadedRows`, so the badge only counts rows the user would actually have seen.
- Update the tooltip to surface a secondary "(N rows from M KPIs hidden)" line — communicates that hiding may compress rows without changing the unique KPI count, eliminating the "filter is dead" perception.
- Disable the toggle (greyed + tooltip "No multi-month KPIs in this view") when `nonDueHiddenCount === 0` and the helper finds zero hide-eligible rows in the current scope. Pure UI; no logic change.

### Step 4 — Documentation

- `DOCUMENTATION.md` → Bulk Review section: clarify Due-only semantics (active anchor month, off-cycle treated as not-due).
- `POLICY.md` → §128 amend: read-time filters MAY apply the cascading default; write paths still must not.
- `mem://architecture/pms/multimonth-percolation` — append a note about the read-time vs write-time defaulting distinction.

## Risk & Impact

- **Data:** none. Read-only helper change.
- **Workflow:** users with the toggle ON will start seeing fewer rows in months that were previously a no-op. Default state is already ON, so this is exactly what users expect.
- **Regression:** low. The change is isolated to one pure helper + one badge memo + one tooltip. Existing tests all still pass once we add the missing-cycle-start cases.
- **Scalability:** unchanged — all filtering remains O(rows) client-side.
- **Rollback:** revert the single `bulkReviewDueFilter.ts` edit and the test file.

## Out of scope

- Backfilling `frequency_cycle_start` for the 42+ Quarterly NULL rows (data-hygiene migration; separate ticket).
- Changing `BulkReviewMatrixGrid` dedup behavior.
- Server-side pre-filter in the `bulk_review_snapshot` RPC.
