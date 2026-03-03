

# RCA: KPI Weightage Dashboard Showing Incorrect Data

## Root Cause: Non-Deterministic Pagination

The hook fetches KPIs using paginated queries with `PAGE_SIZE = 1000`:

```text
.order('employee_id')
.range(page * 1000, (page + 1) * 1000 - 1)
```

**The critical bug**: `.order('employee_id')` is NOT a unique ordering. A single employee can have 20-30 KPIs, all sharing the same `employee_id`. PostgreSQL does **not** guarantee stable ordering for rows with equal sort keys.

When pagination splits across page boundaries (e.g., records 999-1000), KPIs for the same employee can:
- **Appear on both pages** → weightage counted TWICE → inflated totals (e.g., Mar: 188%)
- **Be skipped entirely** → weightage missing → deflated totals (e.g., Feb: 14%)

### Proof from the data:

- `review_year = 2025` has **2,898 records** → 3 pages needed
- `review_year = 2026` has **4,396 records** → 5 pages needed
- Employee 100856 has 24 KPIs per month in Jan-Mar, all summing to exactly 100% in the database
- But the UI shows **Jan: 96%, Feb: 14%, Mar: 188%** — clear evidence of records being duplicated or skipped at page boundaries

### Secondary Issue: Mismatch false positives

KPI names contain full descriptions/formulas that **change between months** (e.g., "Errorfree payables" has different scoring text in Sep-Dec vs Jan-Mar). Since `kpiRow` matching uses exact `kpi_name` comparison, the "same" KPI creates separate rows per variant, inflating the mismatch count.

## Fix Plan

### File: `src/hooks/useKpiWeightageMatrix.ts`

**Fix 1 — Deterministic pagination**: Add `.order('id')` as a secondary sort to ensure unique ordering across pages:

```typescript
.order('employee_id')
.order('id')     // ← unique tiebreaker prevents duplicates/gaps
.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
```

**Fix 2 — Mismatch detection using KPI `id`**: Instead of matching kpiRows by the long `kpi_name` string (which changes between months), use the KPI's `id` as the primary key for the month-cell mapping. Each KPI record is already a unique (employee, kpi, month) entry, so the kpiRow should be identified by a stable key. Since kpi_name CAN differ across months for the "same" conceptual KPI, we should group by a truncated/normalized version or simply accept that each DB row is its own kpiRow. The simplest correct approach: keep grouping by full kpi_name (which is actually the correct DB identity), but compute monthTotals from the raw data FIRST, before kpiRow grouping — ensuring totals are never affected by grouping logic.

Actually, looking at the code again, the monthTotals are already computed independently from kpiRow grouping. **The pagination bug is the sole cause of incorrect totals.** The mismatch count is a secondary display issue (high but not "wrong" — those KPIs genuinely have different text across months).

### Summary of changes:
- **1 file**, **1 line added**: `.order('id')` after `.order('employee_id')`
- No database changes needed
- This ensures every KPI record is fetched exactly once across all pages

