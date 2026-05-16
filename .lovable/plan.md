## Problem

The Self-mode "You have N pending KPI(s) for {Month} {Year}" banner on `My Dashboard` counts non-anchor placeholder rows of multi-month KPIs (Quarterly / Bi-Monthly / Half-Yearly / Yearly). These rows are intentionally not user-editable per POLICY §54 v3 (multi-month percolation: review happens only at the terminal/anchor month and is back-filled to siblings). Telling the user to "act" on them is a contradiction.

**Confirmed example**: Ankit Choudhary (101785). The April 2026 alert is the Quarterly "Timely Completion of KRA Setting…" KPI whose anchor is June 2026. April + May are sibling placeholders that must not surface as actionable.

## Risk & Impact Report

- **Data Impact**: None. Read-only filter change in the banner derivation. No schema, RLS, or row writes.
- **Workflow Impact**: None — anchor-month review behaviour is unchanged. Only the misleading prompt disappears.
- **UI/UX**: Banner stops crying wolf. Anchor-month pending alerts (e.g. June for a Quarterly cycle) keep working unchanged.
- **Regression Risk**: Low. Risk is "over-filtering" and hiding a genuinely-pending Monthly KPI. Mitigated by filtering only when `frequency` is multi-month AND the row is not the cycle anchor.
- **Mitigation**: New unit tests covering Monthly (must alert), Quarterly non-anchor (must NOT alert), Quarterly anchor (must alert), and mixed periods.

## Fix

### 1. `src/components/review/UnifiedScorecard.tsx` — `pendingPeriods` memo (lines 477–499)

Add a guard: for KPIs whose `frequency` is anything other than `Monthly` / `Daily` / `Weekly`, only count the row if its `(review_period, review_year)` equals the cycle anchor resolved by the existing helper `resolveCycleAnchor(frequency, review_period, review_year, frequency_cycle_start)` (already exists in `src/lib/frequencyUtils.ts` / `multimonthCycle.ts` — reuse, do not recompute).

Pseudocode:
```ts
allKpis.forEach(k => {
  if (!actionableStatuses.includes(k.status || '')) return;
  if (!k.review_period || k.review_year == null) return;

  // NEW: skip non-anchor placeholders of multi-month cycles
  if (isMultiMonthFrequency(k.frequency)) {
    const anchor = resolveCycleAnchor(k.frequency, k.review_period, k.review_year, k.frequency_cycle_start);
    if (anchor.month !== k.review_period || anchor.year !== k.review_year) return;
  }

  // …existing earlier-than-current check + counter
});
```

### 2. Tests

New file `src/test/pendingPeriodsMultimonth.test.ts` covering:
- Monthly `kra_set` in prior month → counted.
- Quarterly Apr/May placeholders (anchor Jun) viewed from July → only Jun counted.
- Quarterly Jun anchor in prior month → counted.
- Mixed batch (1 Monthly + 2 Quarterly placeholders + 1 Quarterly anchor) → expected count = 2.
- Year-wrapping cycle (Quarterly Nov 2026 → anchor Jan 2027) viewed from Feb 2027.

### 3. Documentation & Policy sync

- `POLICY.md` §54 v3 — append a "UX Corollary": *"Pending-period alerts MUST exclude non-anchor placeholders of multi-month cycles. Only the anchor month is actionable."*
- `DOCUMENTATION.md` — new entry **v2.66.11.14** with RCA, fix, test list.
- `mem://features/admin/multi-month-kpi-cycle-ux` — add a sentence noting that pending-banner derivations must use `resolveCycleAnchor` and never count siblings.

## Out of scope (do not touch in this change)

- The underlying `kpis` rows for Apr/May placeholders. They are intentional per percolation policy and are needed for downstream score back-fill.
- Reviewer-mode pending counts (Team Reviews) — separate audit if required.
- Locking/unlocking data entry for the anchor month (already correct).

## Files touched

- `src/components/review/UnifiedScorecard.tsx` (banner memo only)
- `src/test/pendingPeriodsMultimonth.test.ts` (new)
- `POLICY.md`, `DOCUMENTATION.md`, `mem://features/admin/multi-month-kpi-cycle-ux`

Approve to implement.
