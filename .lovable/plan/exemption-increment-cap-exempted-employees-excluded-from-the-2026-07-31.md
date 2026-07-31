# Exemption Increment Cap — exempted employees excluded from the top slab tiers

## Assumptions
- "Exemption" = an employee who failed an exemptable eligibility criterion (Absent Days / LWP) and has an **approved** exemption, i.e. effective status `Exempted (Eligible)` (ADR-221).
- Such an employee keeps their computed rating and their bell-curve band, but their **increment %** is capped so they cannot receive the top tiers.
- Default = top **2** tiers excluded (with the seeded slabs 16% and 20% dropped, so the cap lands at 12%). Both the on/off switch and the number of excluded tiers are admin-configurable from the Bell Curve section.
- Fully ineligible employees stay at 0% (unchanged, POLICY §AR-ELIGIBILITY-EXEMPTION decision A).
- The cap applies to the increment percentage only — rating, bands, heat map and distribution stay as computed.

## Clarifications (assumed unless you say otherwise)
- Cap = "clamp down", not "force to the cap": an exempted employee rated 3.2 (8%) stays at 8%; one rated 4.7 (20%) drops to 12%.
- Configuration is global on the bell-curve config record, not per employee.

## Risk & Impact Report
- **Data impact:** additive only — two new columns with defaults on `annual_review_bell_curve_config`. No historical rows change; rollback = turn the flag off or drop the columns.
- **Workflow impact:** none to review stages. Only the displayed/exported increment % changes for exempted employees.
- **UI/UX impact:** one new settings block in the Bell Curve config dialog; a "Capped" badge next to affected Slab % values in the drill-down and report grid.
- **Regression risk:** medium — `effectiveSlabPercent` is used by the drill-down list, the review-form viewer and exports. Mitigated by keeping the current 2-argument signature working (cap options are an optional third argument) and by unit tests.
- **Scalability:** pure client-side arithmetic over already-fetched rows; no extra queries beyond the existing config fetch.

## Plan

### 1. Configuration (database)
Add to `annual_review_bell_curve_config`:
- `exempted_slab_cap_enabled boolean not null default true`
- `exempted_top_tiers_excluded integer not null default 2` (check 0–6)

### 2. Logic SSOT — `src/lib/annualReview/ratingSlab.ts`
- `slabCapPercent(slabs, topTiersExcluded)` — sort active slabs ascending, drop the top N, return the highest remaining `increment_percent` (returns `0` when N is at or beyond the band count).

### 3. Logic SSOT — `src/lib/annualReview/effectiveEligibility.ts`
- Extend `effectiveSlabPercent(computedPercent, status, options?)` where `options = { slabs, capEnabled, topTiersExcluded }`:
  - `ineligible` -> `0` (unchanged)
  - `exempted` + `capEnabled` -> `Math.min(computedPercent, slabCapPercent(...))`
  - otherwise -> `computedPercent`
- Add `isSlabCapped(...)` so the UI can badge capped rows.
- No options passed = today's behaviour, so existing call sites stay valid.

### 4. Bell Curve UI
- `BellCurveConfigDialog.tsx`: new "Exemption increment cap" section — a switch plus a numeric "Top tiers excluded" input with a live hint ("Exempted employees can receive at most 12%").
- `BellCurveTab.tsx`: resolve the cap options from config and pass them to the drill-down and exports; show the active rule as a small note beside the band-mode note.
- `BandEmployeeList.tsx`: apply the cap in the Slab % cell and in the CSV export, with a "Capped" badge and tooltip explaining the rule when the value was reduced.
- `bellCurveExport.ts`: export the capped Slab % plus an "Exemption cap applied" column in Excel/PDF.

### 5. Report grid parity
- `AnnualReviewReport.tsx` and its Excel/PDF export use the same capped percentage, so the report, the drill-down and the review detail never disagree.

### 6. Tests
- New cases in `src/test/annualReview/effectiveEligibility.test.ts`: cap disabled, cap with N=2, exempted already below the cap (unchanged), ineligible still 0%, N beyond band count -> 0%, non-exempt employees unaffected.
- `slabCapPercent` unit tests against custom (non-default) slab tables.

### 7. Documentation
- New **ADR-222 — Exempted increment cap**, an update to **POLICY §AR-ELIGIBILITY-EXEMPTION** (decision B), and a DOCUMENTATION.md version-history entry.

## Technical notes
The cap is resolved from the active slab table at render time, so if admins later add or remove slab bands, "top 2 tiers" always means the current top 2 — no hardcoded percentages anywhere.