# Fix: "Days in Stage" is inaccurate in the KPI Status Tracker

## What I confirmed (live data, July 2026)

The Days column is computed as `today − kpis.updated_at`. That column is not a stage-entry timestamp — it moves on *any* row write, including bulk/system maintenance.

Sample of July 2026 KPIs:

```text
status           kpis.updated_at   last real audit event
manager_check    2026-08-15        2026-08-04
hr_pms_review    2026-08-15        2026-08-05
self_review      2026-08-15        2026-08-10
kra_set          2026-08-15        2026-07-01
```

Every row in the period carries `updated_at = 2026-08-15/16` (a system-wide write on 15 Aug), so the report currently shows "1d–2d" for KPIs that have genuinely been sitting with a reviewer for 10–45 days. The ageing colour thresholds (amber ≥4d, red ≥7d) therefore almost never trigger, and the Excel column is equally wrong.

Two smaller defects in the same column:
- Completed/approved KPIs keep accruing days, as if still pending.
- KPIs with no audit history at all fall back to `0`, which reads as "just touched".

## The fix

Compute Days from the immutable audit trail instead of `updated_at`.

1. **Stage-entry date resolver** — for each KPI, take the most recent qualifying stage-advancing event from `kpi_audit_logs` (the same action vocabulary already codified in `src/lib/review/stageFirstActionDate.ts`, extended with send-back events, since a send-back restarts the clock for the receiving stage). That timestamp is when the KPI entered its current stage.
2. **Fallbacks, in order**: last stage event → first audit event for the KPI → KPI creation date. Never silently `0`.
3. **Terminal states**: for `approved` (and any completed/NA terminal status) show `—` instead of a growing number, and exclude those rows from the ageing colour thresholds.
4. **Excel parity**: the export reads the same resolved value, so on-screen and sheet always match. `—` exports as blank.
5. **Header/tooltip**: label clarified to "Days in Current Stage" with a tooltip explaining it counts from stage entry, not last edit.

## Technical notes

- New pure helper `src/lib/review/daysInStage.ts` — `resolveStageEntryDate(logs, kpi)` and `resolveDaysInStage(...)`, no I/O, fully unit-testable.
- `src/pages/reports/KpiStatusTracker.tsx` batch-fetches `kpi_audit_logs` (`kpi_id, action, created_at`) for the visible KPI id set using the existing paginated batch pattern in that file (PostgREST 1000-row cap), then maps `daysPending` through the helper. `days_in_stage` stays the same `field_key`, so Report Field Sequence overrides are untouched.
- Bottleneck Report uses its own `daysPending` from `bottleneckResolver`; out of scope here unless you want it aligned in the same pass.
- Tests: `src/test/daysInStage.test.ts` — stage entry from latest qualifying event, send-back restart, fallback chain, terminal status returns null, and screen/export symmetry.
- Docs: ADR-292 + POLICY §RPT-DAYS-IN-STAGE-AUDIT-SSOT, DOCUMENTATION.md version history.

## Risk

Additive: one extra batched read on this report, no schema or write changes. Displayed day counts will jump upward — that is the correction, not a regression. Rollback = revert the helper call to the previous `updated_at` expression.
