# ADR-218i — Bell Curve filters are interdependent (cascading)

Date: 2026-08-01
Status: Accepted

## Context
The Bell Curve Analysis filter row (Business Unit, Department, Manager,
Division/Location, PMS Grade, Scoring Source, Eligibility) built every dropdown
from the full cycle dataset. Users could pick combinations that do not co-exist
(e.g. BU = CLU with a Ferro-only division) and land on an empty analysis with no
indication of why.

## Decision
1. Each axis lists only the values present once every OTHER active filter is
   applied (AND-cascade). Setting any filter narrows the rest, clearing it
   re-expands them.
2. If a selection becomes impossible after another axis changes, it resets to
   **All** — never silently filters everything out. Heat-map group selection is
   cleared in the same reconciliation.
3. Engine SSOT for the rule: `src/lib/annualReview/bellCurveFilters.ts`
   (`matchesFilters`, `axisOptions`, `allAxisOptions`, `staleAxes`). The tab
   holds no bespoke predicate; `filtered` and the option lists share one
   eligibility-annotated, manager-scoped `baseRows` memo.
4. Reconciliation is a `useEffect`, never a `useMemo` (side effects rule).

## Consequences
- Presentation only: no schema, RPC, RLS, service or engine change;
  `bellCurve.ts` untouched. Applies to both mount points (report + Annual
  Review Admin Bell Curve tab).
- Option building is 7 memoized passes over in-memory rows — negligible.
- Rollback: revert `BellCurveTab.tsx` and delete `bellCurveFilters.ts`.

## Guards
`src/test/annualReview/bellCurveFilters.test.ts` (6 cases).
POLICY §AR-BELL-CURVE item 14.
