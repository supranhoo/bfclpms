# Audit — `isKpiLockedForPeriod` callers and per-KPI `frequency_cycle_start`

Scope: every call to `isKpiLockedForPeriod(...)` and every related sibling helper (`isFrequencyNotDue`, `getActiveMonthForCycle`) across the app, plus the SELECT that feeds each call.

## Findings — all call sites already compliant

| # | File | Line | Passes `frequency_cycle_start`? | SELECT includes it? | Notes |
|---|------|------|---|---|---|
| 1 | `src/pages/reports/EmployeePerformanceSummary.tsx` | 193 | yes | yes (lines 120 + 304) | Fixed in v2.66.11.9 |
| 2 | `src/pages/reports/KpiDetailReport.tsx` | 199 | yes | yes (line 147) | Fixed in v2.66.11.9 |
| 3 | `src/pages/reports/KpiStatusTracker.tsx` | 166 | yes | yes (line 131) | Fixed in v2.66.11.9 |
| 4 | `src/pages/admin/OrgKpiDataEntry.tsx` | 214 | yes | yes (uses RPC snapshot) | Long-standing |
| 5 | `src/hooks/useSystemIssues.ts` | 111 | yes | yes (line 99 type + `select('*')`) | Long-standing |
| 6 | `src/components/admin/AdminDataEntryDialog.tsx` | 137-143 | yes | yes (`select('*')` line 258) | Long-standing |
| 7 | `src/components/review/SelfReviewSheet.tsx` | 155 | yes | yes (KPI hydrated via `useKpis` SLIM_KPI_SELECT) | Long-standing |
| 8 | `src/components/review/KpiJourneySection.tsx` | 184/188 | yes | yes (KPI prop) | Long-standing |
| 9 | `src/components/review/FrequencyLockedOverlay.tsx` | 29/83 | yes (prop) | n/a — caller's responsibility | Long-standing |
| 10 | `src/lib/frequencyUtils.ts` | 654 (`getActiveMonthForCycle`) | yes (re-passes arg) | n/a — internal | Helper-internal |

Sibling helper:
- `src/hooks/useCompliancePenalty.ts` line 190 → `isFrequencyNotDue(kpi.frequency, ..., kpi.frequency_cycle_start, exclusions)` ✅ (SELECT line 137 includes column).
- `src/hooks/useAdminReports.ts` lines 154/160/208 → uses `getCalendarMonthsForPeriod(..., frequency_cycle_start)` ✅.

Test files exempt by design (they intentionally exercise the default-fallback path):
- `src/lib/frequencyUtils.test.ts` (3-arg form is the test's purpose)
- `src/test/reportFrequencyCycleOverride.test.ts` (mixed 3-arg / 4-arg cases)

Both are flagged in POLICY §128 as exempt; no change.

## Result

No production call site is missing the per-KPI `frequency_cycle_start` argument. No SELECT feeding such a call site is missing the column. The Sajid-Raza class of bug (default-cycle fallback wrongly locking offset-cycle KPIs) is now closed app-wide.

## What I propose to ship (lightweight hardening only)

Strictly to prevent future regressions — nothing functional changes:

1. **CI guard test** — `src/test/frequencyLockCallSitesAudit.test.ts`. A repo-grep test that:
   - greps `src/**/*.{ts,tsx}` for `isKpiLockedForPeriod(`,
   - excludes the two whitelisted test files,
   - asserts every remaining call has 4+ comma-separated arguments.
   This makes any future 3-arg slip fail CI immediately, without depending on memory of POLICY §128.

2. **Helper hardening** — add a dev-only `console.warn` inside `isKpiLockedForPeriod` when `frequencyCycleStart` is `undefined` AND the frequency belongs to `MULTI_MONTH_FREQUENCIES` (Bi-Monthly / Quarterly / Half-Yearly / Yearly). Suppressed in production. Catches new entry points the static grep can't see (e.g. dynamic dispatch).

3. **Policy refresh** — update POLICY §128 to reference the new CI guard and the dev-only warning, and append an audit attestation row ("Audited 2026-05-12: 10 call sites, 0 violations").

4. **DOCUMENTATION.md** — append v2.66.11.10 entry summarizing the audit + the two hardening additions.

## Risk & impact

- Data: none.
- Workflow: none.
- UI/UX: none (dev-only warning is suppressed in prod build).
- Regression risk: very low — only test + warn additions, no behavior change to scoring or locking.
- Mitigation: the new test itself is the primary guard.

## Out of scope

Reports that intentionally do NOT apply frequency locking to score aggregation (e.g. `useMonthlyTrend`, `MonthlyScorecardReport`, `KpiEmployeeMatrix`, `PerformanceReport` trend mode) are unchanged. Their behavior is by design (trend dashboards include all periods regardless of lock state).

If you'd like the trend dashboards re-examined for lock awareness, that's a separate decision and I'll flag it separately.
