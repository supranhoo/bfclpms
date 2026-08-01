# Bell Curve filters: multi-select + search (and a new project-wide filter standard)

## What changes for you

The seven filter dropdowns in **Bell Curve Analysis** (Business Unit, Department, Manager, Division / Location, PMS Grade, Scoring Source, Eligibility) become multi-select boxes with a search field:

- Pick any number of values per filter, e.g. Eligibility = *Exempted* **and** *Ineligible*.
- Type to search inside each dropdown — important for long Manager and Department lists.
- "Select all (filtered)" and "Clear" inside the dropdown; a chip/count on the closed trigger showing what is selected.
- Empty selection keeps meaning **All**, so today's default view is unchanged.
- The filters stay interdependent (ADR-218i): each dropdown only lists values that still exist under the other selections, and any selected value that becomes impossible is dropped automatically instead of returning an empty screen.

Everything downstream of the filters — KPI cards, bell curve, distribution bars, variance table, heat map, drill-down and the Excel/PDF exports — follows the multi-selection, and the export header lists the selected values instead of a single name.

## Going forward (new standard)

Recorded as a core project rule so every future filter follows it without being asked:

> Every filter control is multi-select, has a search box, and — when a screen has more than one filter — all filters are cascading (each one's options are narrowed by the others, with auto-reconciliation of impossible selections).

Existing filter rows on other screens are left untouched in this pass; they can be retrofitted later screen by screen.

## Technical notes

- Reuse the existing `src/components/ui/multi-select-id.tsx` (id-valued options, search, select-all, badges) — no new dropdown component. Add a `label`/`ariaLabel` prop if needed and keep the `h-10` trigger height.
- `src/lib/annualReview/bellCurveFilters.ts`: change `BellCurveFilters` from `Record<FilterAxis, string>` to `Record<FilterAxis, string[]>`; `matchesFilters` becomes "empty array = All, otherwise value ∈ array" (OR within an axis, AND across axes). `axisOptions` / `allAxisOptions` keep the same "exclude own axis" cascade. `staleAxes` becomes `reconcileFilters(filters, options)` returning filters with unavailable ids pruned.
- `BellCurveTab.tsx`: filter state becomes arrays, the reconcile `useEffect` prunes rather than resets to All, and the label helper feeding the export header joins selected labels (`"3 selected"` when more than two).
- `bellCurveExport.ts`: header "Filters" line renders each axis's selected labels or `All`.
- Presentation/filter layer only — no schema, RPC, RLS or scoring change. Placement, calibration and exemption logic (ADR-220/222/224/228) are untouched.
- Rollback: revert the four files; the array shape is internal to the tab.

## Tests and docs

- Extend `src/test/annualReview/bellCurveFilters.test.ts`: empty array = All, multi-value OR within an axis, AND across axes, cascade options under a multi-selection, reconcile prunes only the impossible ids and keeps the valid ones.
- New `ADR-229` (multi-select + search + cascading filter standard), `POLICY §UI-FILTER-STANDARD`, `DOCUMENTATION.md` version-history entry, and a memory rule so it applies to all future filter work.
