
## Current state (verified)

`src/pages/reports/KpiScorecardDetail.tsx` already ships a **Pending With** column:
- Resolved via `resolvePendingWith()` in `src/lib/kpiPendingWith.ts` (POLICY §105, per-employee workflow chains).
- Listed in `KSD_DEFAULT_FIELDS` (sort key 295), rendered in the table (line 847/893), included in single-month + range XLSX exports (`ksdValueFor` line 524), and sortable.

Missing vs the requirements you listed:
1. Free-text **search** does not include Pending With.
2. No **column filter** (Excel-style multi-select) on Pending With.
3. No **grouping** by Pending With.
4. Approved / N/A rows show `—`; spec asks for `"Completed"` / `"N/A"`.
5. No **summary analytics panel** for Pending With (counts, aging, overdue).

This plan only *adds* to the report — no existing field, column, filter, sort, or export behavior is removed or changed.

## Requirements coverage matrix

| Requirement | How it will be met |
|---|---|
| Retain all existing fields/data | No deletions; only additions |
| Add "Pending With (Name)" column | Already present; rename label to "Pending With (Name)" via `KSD_DEFAULT_FIELDS` and admin field-registry seed |
| Show current reviewer/owner per stage | Already done by `resolvePendingWith`; unchanged |
| Filter | Add `ColumnFilterPopover` on the Pending With header (parity with Frequency/Status) |
| Sort | Already works via `toggleSort('pendingWith')` |
| Search | Extend `searchTerm` predicate (on-screen + range export) to include `pendingWith` |
| Group | Add a "Group by Pending With" toggle above the table that renders collapsible group headers with per-group counts; sort/pagination stay intact |
| Analytics/Exports | Add Pending With to a new "Summary" sheet in XLSX; the row-level export already carries it |
| Summary — count per Pending With | New card at top with a sortable mini-table (Pending With → count) |
| Summary — aging by Pending With | Compute days-pending from `kpis.updated_at` (add to the base query); bucket 0–7 / 8–14 / 15–30 / 30+ days; show avg + max per Pending With |
| Summary — overdue grouped | Overdue = pending > N days (default 14, admin-tunable in code constant `PENDING_OVERDUE_DAYS`); count per Pending With + total |
| "Completed" / "N/A" fallback | Update `pendingWith` display: `isNa` → `"N/A"`, `status === 'approved'` → `"Completed"`, else current value or `"—"` |

## Implementation steps

### 1. Data model — add `pendingSinceDays` to `FlatRow`
- Extend the `kpis` select in `fetchScorecardForPeriod` to include `updated_at`.
- Compute `pendingSinceDays = floor((now - updated_at) / 1 day)` when `status` is a non-terminal, non-N/A stage; `null` otherwise.
- Add `pendingSinceDays: number | null` to `FlatRow`.

*Non-goal:* no change to how `pendingWith` itself is resolved.

### 2. Display fallback for Pending With
- In the table cell and export mapper, wrap `r.pendingWith` with:
  - `r.isNa` → `"N/A"`
  - `r.status === 'approved'` → `"Completed"`
  - empty → `"—"`
- Applies to on-screen table, column-filter distinct values, single-month + range XLSX, and search index (so users searching "Completed" hit approved rows).

### 3. Search + column filter + grouping
- **Search**: add `r.pendingWith` to the `searchTerm` predicate in both `filtered` (`useMemo`) and `handleRangeExport`.
- **Column filter**: add `pendingWithFilter` state + a `ColumnFilterPopover` on the header, mirroring the existing `statusFilter` pattern; distinct values come from `baseForDistinct`.
- **Grouping**: new `groupByPendingWith` toggle (checkbox in the toolbar). When on, `paged` rows are rendered under sticky group headers with `Pending With — N KPIs`. Pagination is applied to rows, not groups, so page size stays predictable.

### 4. Summary analytics panel (new, above the table)
A collapsible `<Card>` titled **"Pending With — Summary"** with three tiles:
1. **By owner** — table: Pending With | Pending KPIs | Overdue | Avg days | Max days. Clickable rows apply the corresponding `pendingWithFilter`.
2. **Aging buckets** — stacked bar: 0–7 / 8–14 / 15–30 / 30+ days, tooltip per bucket lists top 5 owners.
3. **Overdue totals** — big number + delta vs previous month (best-effort, skips if previous month not loaded).

All three tiles derive from `filtered` (so they honor Company / Department / Status / etc.), keeping the analytics consistent with what the user sees.

### 5. Export — add a "Summary" sheet
`handleExport` and `handleRangeExport` will append a second worksheet named `Pending With Summary` with the by-owner table (Pending With, Count, Overdue, Avg days, Max days). Existing "KPI Scorecard" sheet is unchanged.

### 6. Admin field registry
Update the default label to **"Pending With (Name)"** in `KSD_DEFAULT_FIELDS` and (if a `report_field_registry` seed exists for `kpi-scorecard-detail`) add a one-off migration to update the label on already-seeded rows. Admins can still rename/hide it — this only touches the *default*.

### 7. Tests (Vitest)
- Extend `src/test/kpiScorecardDetailHelpers.test.ts`:
  - `"N/A"` when `isNa`, `"Completed"` when `approved`, real name otherwise.
  - `pendingSinceDays` computed for non-terminal rows only; null for approved / N/A.
- New `src/test/kpiScorecardPendingWithSummary.test.ts`:
  - `summarizePendingWith(rows, { overdueDays: 14 })` → `{ owner, count, overdue, avgDays, maxDays }[]`, sorted by count desc.
  - Aging bucketization boundaries (0/7/8/14/15/30/31).
  - Overdue count matches sum across owners.
- Guard test: existing exported field order + labels remain untouched except `pending_with` label change.

## Files to touch (add / edit only — no deletions)

- `src/pages/reports/KpiScorecardDetail.tsx` — search predicate, column filter state, grouping toggle, summary card, display fallback, export summary sheet, `pendingSinceDays` wiring, updated select clause.
- `src/lib/kpiPendingWithSummary.ts` — **new** pure aggregator (`summarizePendingWith`, `bucketAging`).
- `src/lib/kpiPendingWith.ts` — **no change** (resolution logic is correct).
- `src/test/kpiScorecardDetailHelpers.test.ts` — extend.
- `src/test/kpiPendingWithSummary.test.ts` — **new**.
- `supabase/migrations/<ts>_ksd_pending_with_label.sql` — optional label bump for `report_field_registry` if a row exists; no-op otherwise.
- `docs/adr/ADR-135-ksd-pending-with-analytics.md` — **new** ADR.
- `POLICY.md` — new §KSD-PENDING-WITH-ANALYTICS entry.

## Risk & impact

- **Data**: read-only additions; no schema change beyond one label-update migration (idempotent, guarded by `IF EXISTS`).
- **RLS / security**: no new tables, no new RPCs, no privilege changes. `pendingWith` uses names already visible in the report today.
- **Performance**: aging math is client-side over the already-loaded month; summary is O(rows). Adding `updated_at` to the KPI select is negligible.
- **Regression risk**: label change on `pending_with` could confuse an existing admin override — mitigated by only touching `default_label`; user overrides in `report_field_overrides` stay authoritative.
- **UI**: additive card + one toolbar toggle + one extra header filter; existing layout unchanged.

## Rollback

- Feature is purely additive. Revert = drop the summary card, revert the two hook edits, and restore old `pending_with` default label. The label migration ships as an `UPDATE ... WHERE default_label = 'Pending With'` and can be reversed with the inverse statement.

## Open question (non-blocking)

Default **overdue threshold** — the spec doesn't name one. Proposal: **14 days** since `kpis.updated_at`, exposed as a small `<Select>` inside the summary card (7 / 14 / 21 / 30) so users can toggle without a code change. Confirm or override before I ship.
