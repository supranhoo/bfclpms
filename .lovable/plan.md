# TNI Report — KPI Weightage column + one column per filtered month

## What changes

1. **New "Weightage" column** immediately after the KPI/Category column in the Individual tab table, and after the KPI column in the Excel export. Value = the KPI's configured weightage (%) taken from the KPI record behind the training-need row.
2. **Replace the single "Months <= Threshold" text column with one column per filtered month.** If Apr–Jun 2026 is the selected range, the table ends with three columns: `Apr 2026`, `May 2026`, `Jun 2026`, each showing that month's achieved score (2 decimals) for that KPI. A month with no score shows `—`. The same per-month columns replace the `Scored Months <= Threshold` text column in the export (the `Range` / `Months in Range` / `TNI Threshold` columns stay).

## UI (Individual tab)

Single-month filter (Jun 2026):

```text
| Employee            | KPI / Category        | Wt % | Gap Type | Score | Priority | Status | Recommendation | Jun 2026 |
|---------------------|-----------------------|------|----------|-------|----------|--------|----------------|----------|
| Anil Kumar (200301) | Dust Emission         |  15  | Training | 2.10  | High     | ...    | ...            |   2.10   |
```

Three-month filter (Apr–Jun 2026):

```text
| Employee            | KPI / Category        | Wt % | Gap Type | Score | Priority | Status | Recommendation | Apr 2026 | May 2026 | Jun 2026 |
|---------------------|-----------------------|------|----------|-------|----------|--------|----------------|----------|----------|----------|
| Anil Kumar (200301) | Dust Emission         |  15  | Training | 2.10  | High     | ...    | ...            |   2.80   |   2.40   |   2.10   |
| Sunita Devi (101381)| Safety Observations   |  10  | Training | 1.50  | High     | ...    | ...            |    —     |   1.90   |   1.50   |
```

Details:
- Month columns are right-aligned, monospaced numerals, header shows `MMM YYYY`; they sit at the end of the row and the table scrolls horizontally when the range is long (up to 12 months).
- Scores at or below the configured threshold are shown in the destructive colour; `—` in muted grey for a month with no score.
- Weightage renders as a plain number with `%` suffix, `—` when the KPI has no weightage set.
- Nothing else on the page (filters, cards, charts, threshold strip) changes.

## Technical notes

- `src/hooks/useTNI.ts`: add `weightage` to the embedded `kpi:kpis(...)` select; extend the `TrainingNeed` KPI type.
- `src/pages/reports/TNIReport.tsx`:
  - derive `monthColumns` from `periodRanges` (already the SSOT for the filter);
  - new `scoreForMonth(tn, range)` helper reading the per-month evidence already returned by `tni_qualified_kpis` (`months[]` with `{month, year, score}`), returning `null` when the month is absent;
  - replace the `Months <= Threshold` `<TableHead>/<TableCell>` with a `map` over `monthColumns`; add the Weightage head/cell;
  - export: insert `Weightage (%)` after the KPI label column and swap `Scored Months <= Threshold` for one `MMM YYYY` key per range entry, keeping the header array in the same order (ADR-236 explicit-header rule).
- No DB change — the RPC already returns per-month scores and `kpis.weightage` exists.
- Tests: extend `src/test/tni/` with a case asserting one column key per filtered month and `—` for an unscored month.
- Docs: `DOCUMENTATION.md` + `POLICY.md` §PMS-CONTINUITY-AT-OR-BELOW note the per-month evidence layout (ADR-253).

## Risk

Presentation-only; no schema, RLS or qualification-logic change. Rollback = revert the component/hook edits.
