---
name: Filter UI Standard
description: All filters must be multi-select with search; multiple filters on one screen must cascade (ADR-229)
type: preference
---
ADR-229 / POLICY §UI-FILTER-STANDARD.
- Every filter control is MULTI-SELECT and has a SEARCH box (plus select-all-filtered and clear). Single-select only for genuinely exclusive toggles (e.g. band mode).
- Multiple filters on one screen MUST be cascading/interdependent: each axis's options are computed with all OTHER active filters applied.
- Empty selection = All. OR within an axis, AND across axes.
- Invalid selections are PRUNED individually when another axis changes — never a blanket reset to All.
- Use `src/components/ui/multi-select-id.tsx` (id + label) or `multi-select-filter.tsx` (plain strings). Never fork a per-screen dropdown.
- Exports from a filtered view state the active selection per axis in the header.
- Reference implementation: `src/lib/annualReview/bellCurveFilters.ts` + `BellCurveTab.tsx`.
