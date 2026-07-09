## Root cause

`KpiScorecardDetail` crashes with `ReferenceError: Cannot access 'ue' before initialization` inside a `useMemo` → `Array.map`. `ue` is the minified name of the local helper `getOrgTypeLabel`.

In `src/pages/reports/KpiScorecardDetail.tsx`:

- `getOrgTypeLabel` is declared as a `const` arrow function at **line 404**.
- It is called inside two `useMemo` callbacks that live **above** it:
  - `filtered` useMemo, line 333 (`typeFilter.has(getOrgTypeLabel(r))`)
  - `typeValues` useMemo, line 372 (`baseForDistinct.map(r => getOrgTypeLabel(r))`)

`useMemo` callbacks execute synchronously during render. On first render, evaluation reaches line 316/371 before line 404 has run, so `getOrgTypeLabel` is still in its Temporal Dead Zone → TDZ ReferenceError → React ErrorBoundary shows "Something went wrong".

This is a pure JS scoping bug, not data / RLS / auth related. The `AuthApiError: Invalid Refresh Token` and `content.js` messages in the console are unrelated (browser extension + expired session on /auth).

## Risk & Impact Report

- **Data Impact:** None. No schema, RLS, or query change.
- **Workflow Impact:** None.
- **UI/UX Impact:** Page renders instead of crashing. No visual change on the working path.
- **Regression Risk:** Negligible — the helper is pure (depends only on its `row` argument) and is being moved, not rewritten.
- **Scalability:** Not affected.
- **Mitigation:** Add a targeted unit test that renders the page (or the pure helper) to lock the ordering invariant.

## Fix

Hoist the two pure helpers out of the component to module scope, above `KpiScorecardDetailContent`, so they are defined before any `useMemo` runs:

1. Move `getOrgTypeLabel` (currently line 404) to module scope (near `MONTHS` / `statusLabels`).
2. Move the companion lookup `orgTypeColors` (currently line 414) to module scope alongside it — it is a plain object with no component dependency and is only used in JSX further down.
3. Delete the in-component declarations.
4. Leave every call site (`getOrgTypeLabel(r)`, `orgTypeColors[label]`) unchanged — the identifiers now resolve to the module-level versions.

No other file changes.

## Verification

- Reload `/reports/kpi-scorecard-detail`; page mounts, table renders, filters work.
- Toggle the "Type" column filter → options list populates (proves `typeValues` useMemo runs).
- `bun run tsgo` clean.
- Vitest: add `src/test/kpiScorecardDetailHelpers.test.ts` exercising `getOrgTypeLabel` for Individual, Org (Organization), Org (Department), Org (Employee), and unknown scope fallback.

## Documentation

- **DOCUMENTATION.md** — add a Version History entry: "KpiScorecardDetail: hoisted `getOrgTypeLabel` / `orgTypeColors` to module scope to fix TDZ crash in filter/sort useMemos."
- **POLICY.md** — Not Applicable (no business-rule change).

## Rollback

Single-file revert of `src/pages/reports/KpiScorecardDetail.tsx`.
