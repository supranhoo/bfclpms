# TNI Report shows nothing for Apr–Jun 2026 @ threshold 2 / 3 months

## What I verified against live data (not assumed)

Running the qualification function for April–June 2026:

| Query | Result |
|---|---|
| `tni_qualified_kpis(Apr,May,Jun 2026, threshold 2, min 3 scored months)` | **252** qualifying (employee, KPI) rows |
| same, min 1 month | 644 rows |
| Saved settings | `pms_tni_threshold = 2`, `pip_consecutive_months = 3` — correct |
| `training_needs` rows in Apr–Jun 2026 | 2,290 |

So the rule and the settings are right, and 252 employee/KPI combinations really are at or below 2 in all three months. The report still shows nothing, so the loss happens **after** the SQL, in the page's assembly step.

Two defects confirmed in that step:

1. **The report can only display a KPI that also has a stored `training_needs` detection record.** The qualification SQL is authoritative, but the page renders persisted detection rows and keeps only those found in the qualified index. Of the 252 qualifying combinations, **30 have no stored record at all** — they can never appear, whatever filter is used. Records are only created by the per-month "Detect TNI" run, at whatever threshold was configured that day, so lowering the threshold to 2 today does not create them.
2. **The stored-rows fetch is unpaginated and silently truncated at 1,000 rows.** Apr–Jun holds 2,290 rows; the query orders by priority (all 1,600 "high" rows first) and returns only the first 1,000. That drops whole slices of months — a further 30 qualifying combinations disappear this way, and with a different priority mix the survivors can collapse to zero.

Beyond those two, if either query fails the page renders as an empty report with no message, so a failure is indistinguishable from "no training needs". That has to stop being silent before anything else can be diagnosed.

## What changes

1. **Make the qualification result the source of the report.** The report renders one row per qualifying (employee, KPI) returned by the SQL for the selected range. Stored `training_needs` rows are used only to enrich a row with its descriptive fields (priority, gap type, recommendation, status). A qualifying KPI with no stored record still appears, marked "not yet actioned", instead of vanishing. This removes the dependency on when detection was last run and at which threshold.
2. **Page both fetches to completion.** The stored-rows query fetches in batches until exhausted, so no month or priority band is silently cut off. Card counts, grid and export will reconcile.
3. **Surface failures.** If either query errors, the report shows an error state naming the failure with a Retry action — never a blank "no training needs identified" panel.
4. **Explain the numbers on screen.** The rule banner gains the reconciliation: qualifying combinations found, of which actioned / not yet actioned, and how many stored records the continuity rule excluded.

## Verification

After the change, with Apr–Jun 2026 / threshold 2 / 3 months, the report must show 252 rows and the summary cards must add up to 252. I will confirm that against the same SQL count before handing back.

## Technical notes

- `src/hooks/useTNI.ts` — `useTrainingNeeds` gains range-based paging (`.range()` loop, 1,000-row pages); keeps `placeholderData: undefined` (ADR-252c).
- `src/pages/reports/TNIReport.tsx` — build the row-set from `qualified.rows`, left-joining the persisted record by `tniRowKey`; `filterQualifiedNeeds` becomes the enrichment path rather than the gate. Employee / department / designation for unactioned rows come from a profiles lookup keyed by the qualified `employee_id` values.
- `src/lib/tni/tniQualification.ts` — add `mergeQualifiedWithNeeds(rows, needs)` returning display rows; `scoreForMonth` / `monthColumnLabel` (ADR-253) unchanged.
- Export follows the same merged set with an added `Actioned` column; the explicit-header rule (ADR-236) still applies.
- No schema, RPC or data changes — read path only. Rollback = revert the three files.
- Tests: `src/test/tni/mergeQualified.test.ts` (qualifying row with no stored record still renders; stored record outside the qualified set is excluded) plus a paging test asserting more than 1,000 stored rows are returned.
- Docs: `DOCUMENTATION.md` and `POLICY.md` §PMS-CONTINUITY-AT-OR-BELOW updated as **ADR-254** (qualification set is the report's source of truth; no unpaginated report reads).

## Risk

- Row counts rise (previously hidden qualifying KPIs appear). That is the correction, not a regression.
- Slightly heavier read for wide ranges — bounded by paging and the existing 2-minute cache.