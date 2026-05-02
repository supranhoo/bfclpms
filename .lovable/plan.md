# Fix: KPI History & Tracker Sheet missing alias months

## Problem

For "Days compliance for report" (Date-type KPI), the **Review Journey** correctly shows April 2026 with an "Also known as" badge — meaning that month's KPI is stored under an *alias* name and is resolved via the canonical registry.

However:
- **KPI History** card shows only the current row (May-26).
- **KPI Tracker Sheet** modal shows only April + May.

Both ignore older months stored under different (but alias-equivalent) `kpi_name` / `kra_name` strings.

## Root Cause

`KpiHistoryCard` (`src/components/review/KpiHistoryCard.tsx`) and `KpiTrackerModal` (`src/components/dashboard/KpiTrackerModal.tsx`) both filter related months with strict equality:

```ts
allKpis.filter(k =>
  k.employee_id === kpi.employee_id &&
  k.kpi_name === kpi.kpi_name &&
  k.kra_name === kpi.kra_name
)
```

After the KPI Standardization rollout, prior months' KPI rows often carry the *original* (alias) text while the current month carries the *canonical* text. Strict equality drops those. `KpiJourneySection` already solved this by resolving the current KPI's `kpi_definition_id` and matching against canonical + every alias variant — we need the same logic in History & Tracker.

## Risk & Impact Report

- **Data Impact**: Read-only; no schema changes. New SELECTs against `kpi_definitions` and `kpi_name_aliases` (already used elsewhere, RLS already in place).
- **Workflow Impact**: None. UI-only.
- **UI/UX**: History/Tracker will now show the same set of months Review Journey already groups together — consistent behaviour across the page.
- **Regression Risk**: Low. The new matcher is a *superset* of the old strict match (always includes the current row). For KPIs without a canonical definition, behaviour is unchanged.
- **Mitigation**: Add a small pure helper + unit tests covering (a) no canonical → strict match, (b) canonical with N aliases → matches all variants, (c) different employee never matches.

## Plan

### 1. Shared resolver helper

Create `src/lib/canonicalRelatedKpis.ts` exporting:

- `useCanonicalVariantPairs(kpi)` — React Query hook that, given a KPI, fetches its `kpi_definition_id` (via `kpis` row) plus all `(kra_name, kpi_name)` pairs from `kpi_definitions` + `kpi_name_aliases` for the same definition. Mirrors the logic already in `KpiJourneySection` (lines ~219-265) so both call-sites stay in sync.
- `matchesCanonicalKpi(row, currentKpi, variantPairs)` — pure predicate: same employee, same UoM/frequency-tolerant, AND `(kra_name, kpi_name)` is in the variant set (case/whitespace-insensitive). Falls back to strict equality if `variantPairs` is empty/loading.

### 2. Wire into KpiHistoryCard

`src/components/review/KpiHistoryCard.tsx`:
- Call `useCanonicalVariantPairs(kpi)`.
- Replace the `relatedKpis` filter with `matchesCanonicalKpi`.
- Keep "exclude current row id" behaviour for the history list.

### 3. Wire into KpiTrackerModal

`src/components/dashboard/KpiTrackerModal.tsx`:
- Same hook + matcher in the `monthlyData` `useMemo`.
- Period dedup key stays `${review_period}-${review_year}`; if two alias rows exist for the same period, prefer the one whose `(kra, kpi)` matches the canonical pair, else the current `kpi.id`, else first.

### 4. Tests

`src/lib/canonicalRelatedKpis.test.ts`:
- Strict fallback when no canonical id.
- Includes alias variants when canonical id resolves.
- Ignores rows from other employees.
- Period dedup prefers canonical row over alias row.

### 5. Docs & memory

- `DOCUMENTATION.md` — note that History/Tracker are canonical-aware.
- `POLICY.md` §88I — add clause: "Any UI that aggregates a KPI across periods MUST resolve via canonical definition + aliases, never strict name equality."
- `mem/features/admin/kpi-standardization-registry` — append a "Consumers" subsection listing History card, Tracker modal, and Review Journey as canonical-aware surfaces (so future similar widgets follow suit).

## Files touched

- new: `src/lib/canonicalRelatedKpis.ts`
- new: `src/lib/canonicalRelatedKpis.test.ts`
- edit: `src/components/review/KpiHistoryCard.tsx`
- edit: `src/components/dashboard/KpiTrackerModal.tsx`
- edit: `DOCUMENTATION.md`, `POLICY.md`, `mem/features/admin/kpi-standardization-registry`
