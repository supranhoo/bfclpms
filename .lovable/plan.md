# Bell Curve filters become cascading (interdependent)

## What changes for the user

In **Bell Curve Analysis** (report + Annual Review Admin tab), the filter row stops offering dead options:

- Picking **Business Unit = CLU** shrinks **Department**, **Manager**, **Division / Location**, **PMS Grade**, **Scoring Source** and **Eligibility** to only the values that actually exist inside CLU.
- The same applies in every direction — each dropdown lists the values available under all the *other* currently applied filters (classic AND-cascade), so a combination can never produce an empty table by accident.
- If an already-selected value becomes impossible after another filter changes (e.g. Department CLU-Elect is not in the newly chosen BU), that dropdown resets itself to **All** rather than silently filtering everything out.
- Counts already shown next to Eligibility follow the same narrowed set.
- Nothing is removed: any filter can still be set to **All**, and clearing a filter re-expands the others.

## Technical detail

`src/components/reports/annual-review/BellCurveTab.tsx` only — presentation layer.

1. Extract the current row-predicate into a small helper `matchesFilters(row, filters, except?)` where `except` is the axis to ignore. The existing `filtered` memo calls it with no exception; option building calls it once per axis.
2. Replace the single `options` memo (currently built from raw `rows`) with a memo that, for each axis, builds its option list from the eligibility-annotated, manager-scoped base rows passed through `matchesFilters(..., except: axis)`. Base-row annotation (eligibility resolve + manager scoping) is lifted into its own `baseRows` memo so both `filtered` and `options` share it and nothing is recomputed twice.
3. Add one `useEffect` that reconciles state: for each axis, if the current selection is not `All` and not present in that axis' option list, reset it to `All`. Side effect stays in `useEffect`, never in `useMemo` (project rule).
4. Eligibility option list keeps its counts, computed from the same `except: 'eligibility'` subset.
5. `groupSel` (heat-map multi-select) is cleared for the active view when the option set changes, so a stale group id cannot scope the charts to zero rows.

No schema, RPC, RLS, service or engine change. `bellCurve.ts` untouched.

## Risk

- Data impact: none.
- Regression risk: low, one file; the filtering predicate is unchanged in meaning, only reused. Risk of an auto-reset loop is contained by resetting only to `All` and by deriving options from a memo.
- Scalability: option building goes from 1 pass to 7 passes over the in-memory cycle rows (a few thousand at most) — negligible, all memoized.
- Rollback: revert the file.

## Tests & docs

- `src/test/annualReview/bellCurveFilters.test.ts` (new): helper-level cases — cascade narrowing per axis, `except` axis keeps its own full list, invalid-selection detection, `All` passthrough.
- ADR-218i documenting the cascade rule; POLICY §AR-BELL-CURVE gains the interdependent-filter item; memory note under the bell-curve feature file.
