## Goal
Mirror the HR PMS dashboard's "HR PMS Reviewed X / Total" tile on the Audit Panel so auditors see completion progress at a glance.

## Where
`src/components/review/EmployeeSelectorGrid.tsx` — `renderStatsCards()` → `viewLevel === 'audit'` branch (currently 5 tiles: Total Employees, Pending Audit, In Audit, Forwarded, My KPIs).

## Why this is a pure UI change
The underlying counter already exists. In the audit `stats` aggregator (~line 1180) `stat4` is populated with the "audit-signature" count — KPIs where `auditor_score` is recorded OR the KPI has advanced past audit while `is_na=true`. That is exactly the semantic parallel to HR PMS `stat3`. Denominator `stats.totalKpis` is also already computed. No hook, service, or query changes are needed.

## Change
Add one `StatCard` in the audit branch of `renderStatsCards()`:

- Label: **Auditor Reviewed**
- Icon: `CheckCircle2` (same as HR PMS tile)
- Value: `stats.stat4`
- Denominator: `stats.totalKpis`
- Color: `green`
- Subtitle: `of total KPIs`
- Tooltip: "KPIs that have completed the Audit stage for this period — either an auditor score is recorded or the KPI has advanced past the Audit stage."
- Not clickable (no dedicated `statusFilter` case for it today; "Forwarded" already filters forwarded-past-audit and would double up). Leaving it as a read-only progress indicator matches how the HR PMS "Reviewed" tile behaves visually while its click handler filters `reviewed`. Since audit has no `reviewed` filter branch wired, we keep it non-interactive to avoid dead clicks.

Update the grid class from `lg:grid-cols-5` to `lg:grid-cols-3 xl:grid-cols-6` for parity with the HR PMS grid so 6 tiles wrap cleanly on all breakpoints.

## Risk & Impact
- Data: none — reads existing `stats.stat4` / `stats.totalKpis`.
- Workflow: none.
- UI: audit panel becomes 6 tiles; matches HR PMS layout. Verified against uploaded reference screenshots.
- Regression: nil — `stat4` is already computed and used nowhere in the audit UI today, so surfacing it cannot change other numbers.

## Tests
Add a small render test `src/test/auditReviewedTile.test.tsx` (or extend existing `hrPmsReviewedTile*` pattern) asserting the tile shows `stat4 / totalKpis` when `viewLevel === 'audit'`.

## Docs
- POLICY.md: note under Audit dashboard tiles that "Auditor Reviewed" uses the same signature rule as HR PMS Reviewed (score recorded or advanced past stage).
- DOCUMENTATION.md: add tile to the Audit Panel tile inventory + changelog entry.

## Rollback
Revert the single edited component file, the new test, and the doc entries.
