## Comprehensive Fiscal-Window Bleed Remediation

Systemic audit of the "review_year × review_period" boundary defect (BUG‑044 pattern). Every callsite that fetches time‑series KPI data spanning **two calendar years** for a single fiscal cycle (Jul Y → Jun Y+1) must pair `review_year` with `review_period` when bucketing, otherwise rows from an adjacent fiscal cycle leak into the wrong months.

## Findings (ranked)

| # | Severity | Location | Defect |
|---|---|---|---|
| A | 🔴 **CRITICAL — scoring integrity** | `public.percolate_multimonth_score` trigger (latest def `supabase/migrations/20260504155713_*.sql:54–65`) | Sibling loop filters `k.review_year = NEW.review_year`. For cross‑January cycles (Half‑Yearly `Oct‑Mar`, Yearly `Jul‑Jun`, Quarterly `Nov‑Jan`) the sibling months live in the *other* calendar year and are **silently skipped**. Memory `mem/architecture/pms/multimonth-percolation` §54 v5 claims this was fixed — it was **not**. |
| B | 🔴 **CRITICAL — annual‑review archetype** | `src/services/annualReview/archetypeResolver.ts:26–44` `countKraMonthsInAY` | `.in('review_year',[cycleStartYear, cycleStartYear+1])` then counts every `(year::period)` bucket. Nothing enforces that Jul–Dec buckets belong to `cycleStartYear` and Jan–Jun to `cycleStartYear+1`. Adjacent‑cycle rows inflate `kraMonths`, potentially flipping employees into archetype **A** (KRA‑based) when they should be B/C/D. |
| C | 🟠 **HIGH — visible defect fixed already** | `src/hooks/useAdminReports.ts::useKpiMappingMatrix` | Already fixed in the previous turn via `isKpiMonthInFiscalCycle`. Retain — this becomes the canonical guard other sites should reuse. |
| D | 🟠 **HIGH — operational report** | `src/hooks/useBottleneckReport.ts:96–182` (consumes `useAllKpis`) | When `selectedYear='all'` and `selectedPeriod='July'`, Julys from **every** fiscal cycle merge into one report. Managers act on a mixed set. |
| E | 🟠 **HIGH — admin editorial** | `src/components/admin/AdminKpiEditorForm.tsx:180–188` | Sibling fetch for the "Copy to Months" modal keys by `${period}-${year}`, but the UI needs an explicit fiscal‑window filter before rendering month tiles so the next fiscal cycle's July doesn't disable the current cycle's July slot. |
| F | 🟡 MEDIUM — audited, guarded | `src/hooks/useAdminDataEntry.ts:895–914`, `src/components/review/KpiJourneySection.tsx:313–329`, `src/hooks/useKpis.ts:633–651`, `src/services/annualReview/carryKraScore.ts:130–140` | Broad `.in('review_year',…)` fetches but each has a correct paired `(period, year)` post‑filter today. Fragile — will regress if a caller ever passes a wrong list. Needs the shared helper + regression tests. |
| G | ✅ Safe | All SQL RPCs accepting `p_year`+`p_period` (`get_kpi_journey_report`, `reconcile_workflow_statuses`, `check_review_period_permission`, `detect_training_needs_for_period`, `aggregate_sub_period_scores`, `rpc_weightage_eligible_employees`, `rpc_weightage_variance_summary`) pair both params in WHERE. |

## Fix plan

Six ordered work items. Each ends with a regression test so the class of bug cannot recur.

### 1. Extract a single canonical helper (both TS and SQL)

- **TS**: keep `isKpiMonthInFiscalCycle(calMonthIdx, reviewYear, fiscalStartYear)` in `src/hooks/useAdminReports.ts`, plus add sibling helpers in a new `src/lib/fiscalWindow.ts`:
  - `fiscalYearForMonth(reviewPeriod: MonthName, fiscalStartYear): number` → returns `fiscalStartYear` for Jul–Dec, `fiscalStartYear+1` for Jan–Jun.
  - `isFiscalTuple(reviewPeriod, reviewYear, fiscalStartYear): boolean`.
  - `filterToFiscalWindow<T>(rows, fiscalStartYear, accessors): T[]`.
  Re‑export from `useAdminReports.ts` so nothing breaks.
- **SQL**: add `public.fiscal_year_for_month(p_period text, p_fiscal_start int) RETURNS int` (IMMUTABLE), used by the percolation fix below and any future RPC. Rooted in `SET search_path = public`.

### 2. Fix `percolate_multimonth_score` (Finding A)

Migration replaces the WHERE clause to derive each sibling's year from cycle position instead of assuming `NEW.review_year`:

```sql
-- For each candidate month in v_cycle_months, compute the fiscal‑correct year:
--   month idx > terminal_idx (i.e. earlier in the cycle when the cycle wraps)
--     → year = NEW.review_year - 1
--   else → year = NEW.review_year
FOR v_sibling IN
  WITH tgt AS (
    SELECT m AS period,
           CASE
             WHEN idx_of(m) > idx_of(v_terminal_month)
               THEN NEW.review_year - 1
             ELSE NEW.review_year
           END AS ry
    FROM unnest(v_cycle_months) WITH ORDINALITY AS u(m, ord)
    WHERE m <> NEW.review_period
  )
  SELECT k.id AS kpi_id, k.review_period, k.review_year
  FROM tgt
  JOIN kpis k ON k.employee_id = NEW.employee_id
             AND k.kra_name    = NEW.kra_name
             AND k.kpi_name    = NEW.kpi_name
             AND k.frequency   = NEW.frequency
             AND k.review_period = tgt.period
             AND k.review_year   = tgt.ry
             AND k.id <> NEW.id
LOOP …
```

`idx_of()` uses calendar month index; equivalent to the existing `get_cycle_months` ordering (Jul→Jun for fiscal cycles is preserved via `frequency_cycle_start`).

- Ship as a normal migration (function replacement, no data mutation).
- Add a one‑shot backfill script gated behind admin: rescan all Half‑Yearly / Yearly / cross‑Jan Quarterly KPIs with `status='approved'` whose declared cycle months are missing sibling rows in the neighbouring calendar year, and repercolate via a new admin RPC `backfill_cross_year_percolation()`. Audit action `BACKFILL_CROSS_YEAR_PERCOLATION` (`performed_by = NULL`).
- **Update memory** `mem/architecture/pms/multimonth-percolation` §54 v5 to match reality (currently promises a fix that doesn't exist).

### 3. Fix `countKraMonthsInAY` (Finding B)

Replace the counter with a strict fiscal‑window filter using the new helper:

```ts
const rows = data ?? [];
const buckets = new Set<string>();
for (const r of rows) {
  if (!r.review_year || !r.review_period) continue;
  if (fiscalYearForMonth(r.review_period, cycleStartYear) !== r.review_year) continue;
  buckets.add(`${r.review_year}::${r.review_period}`);
}
return buckets.size;
```

Add a Vitest that seeds a mocked Supabase client with cross‑year rows and asserts they are excluded.

### 4. Fix Bottleneck Report cross‑cycle bleed (Finding D)

Two options — pick option **A** for correctness:

- **A (recommended)**: forbid `selectedYear='all'` + specific `selectedPeriod`. When `selectedPeriod` is set, force `selectedYear` to a concrete fiscal year (default = current). Add a small info banner: *"Period filter requires a specific fiscal year."*
- **B**: keep 'all' but change the row grouping to display `"Jul 2025"` etc. so mixed cycles are visually distinguishable — heavier UI change, defer.

### 5. Harden `AdminKpiEditorForm` (Finding E)

After the sibling fetch, filter the result through `filterToFiscalWindow(rows, fiscalStartYearOf(kpi), …)` before building `existingSiblingKeys`. Guarantees the "Copy to Months" grid never disables a slot because an adjacent cycle happens to have the same month.

### 6. Guardrails for the medium‑risk sites (Finding F)

- Add ESLint rule (`no-restricted-syntax`) or a targeted unit test scanning `src/**/*.ts(x)` for the string `.in('review_year'` and asserting each match is accompanied by either (a) `fiscalYearForMonth`/`isKpiMonthInFiscalCycle`, or (b) an inline `(period && year)` post‑filter within ±30 lines. Cheap regex, prevents silent regressions.
- Add regression tests for the four sites in Finding F using the shared helper.

## Governance

- **POLICY.md** add §90b: *"Any client hook, edge function, or RPC that reads time‑series tables across two calendar years for a single fiscal cycle MUST pair `review_period` (or its calendar‑month equivalent) with `review_year` via `isKpiMonthInFiscalCycle` / `fiscal_year_for_month`. Broad `.in('review_year',[Y,Y+1])` fetches are only permitted when the immediate downstream code re‑filters using the paired tuple."*
- **DOCUMENTATION.md** add v2.66.7.47 entry summarising Findings A–F, the shared helper, the migration, and the backfill.
- **mem/architecture/pms/multimonth-percolation** — rewrite §54 v5 to reflect the actual (post‑fix) behaviour; remove the false claim that the year filter is already gone.
- New memory `mem/architecture/pms/fiscal-window-guard` documenting the helper and the enumerated safe callsites (mirror of POLICY §94 addendum for `fetchAllPaged`).

## Test coverage

- Extend `src/test/kpiMappingMatrixFiscalWindow.test.ts` into `src/test/fiscalWindow.test.ts` covering the shared helper.
- New `src/services/annualReview/archetypeResolver.test.ts` — cross‑year bleed rejected.
- New `src/hooks/useBottleneckReport.fiscalGuard.test.ts` — asserts period filter without year is disallowed.
- New SQL test: pgTAP‑style migration that (a) inserts a wrapping Half‑Yearly cycle Oct‑2025 → Mar‑2026 with terminal March, (b) approves March, (c) asserts Oct/Nov/Dec 2025 siblings receive the propagated scores.

## Risk & rollout

- All migrations are function replacements + one idempotent backfill — no destructive schema changes; safe to re‑run.
- Percolation change is behavioural: siblings that were previously left `kra_set` will flip to `approved` on the next terminal approval or once the backfill runs. Audit action tags them for traceability; no historical `final_score` is overwritten (percolation only writes when target is null/placeholder).
- Bottleneck UI change is scoped to filter validation, no data change.
- All other TS changes are additive filters — reduce false positives only, never inflate coverage.

## Out of scope

- Rewriting `useAllKpis` to be scoped by fiscal year (large refactor across Team Review / Audit / Management screens). Track separately.
- Redesigning `First Mapped` semantics (still = earliest covered fiscal month in the selected cycle).
