# TNI & PIP Reporting — Audit, Gaps, Recommended Correction

Audit only. No code has been changed.

## A. Existing TNI implementation

| Aspect | Current state |
|---|---|
| Detection | DB function `detect_training_needs_for_period(p_review_period, p_review_year, p_threshold numeric DEFAULT 3.0)` — SECURITY DEFINER, inserts into `training_needs`. Two passes: compliance gaps (auto-advance / non-submission) and genuine skill gaps. |
| Qualification | `review_submissions.final_score < p_threshold` (strict `<`), only where `kpis.status = 'approved'`. One row per KPI per month. |
| Idempotency | `NOT EXISTS (select 1 from training_needs where tn.kpi_id = k.id)` — de-dupes on **kpi_id only**, so a re-run after a threshold change never updates an existing row. |
| Threshold source | **None configurable.** `useDetectTrainingNeeds` / `useBackfillTrainingNeeds` (`src/hooks/useTNI.ts`) default to `3.0` and `TNIReport.tsx` never passes a value, so 3.0 is always used. Priority bands are separately hardcoded in SQL (`< 2.0` high, `< 2.5` medium). |
| Report query | `useTrainingNeeds`, `useTNISummary`, `useTNIByCategory`, `useTNIByDepartment` read persisted `training_needs` rows filtered by `(review_period, review_year)` through `applyPeriodRanges`. |
| **Multi-month behaviour** | **UNION / ANY-month.** A KPI detected in Apr and Jun appears in an Apr–Jun report even when May was above threshold. There is no continuity evaluation anywhere in TNI. |
| Month / QTD / YTD / AY / Custom | `buildRanges()` in `TNIReport.tsx` resolves each mode into a list of (month, year); every mode then feeds the same ANY-month union. The filters themselves are correct — only the qualification rule is wrong. |
| Detect TNI | Runs detection for one chosen month. |
| Backfill Range | Client-side loop calling the same per-month RPC for each month in the range. No cross-month logic. |
| Dashboard cards | `useTNISummary` counts persisted rows in range — same ANY-month semantics as the table, so cards and table reconcile today, but both are wrong for multi-month. |
| Export | `handleExport` exports the same `trainingNeeds` array plus a per-month detection-status sheet — consistent with the screen, inherits the same defect. |
| Missing scores | Only approved KPIs with a non-null `final_score` are considered; a missing month simply produces no row and is never read as 0. Not-yet-approved months are silently absent. |
| Background jobs | None. Detection is manual only. |
| Tests | No TNI unit tests exist. |

**Explicit answer:** multi-month TNI today = **persisted per-month detection records, unioned (ANY month)**. Not ALL-months, not average, not latest month.

## B. Existing PIP implementation

| Aspect | Current state |
|---|---|
| Candidate rule | `isPipCandidate` (`src/lib/pip/pipCandidateRule.ts`) — every month in the range must have a score AND be **strictly `<`** the threshold; a missing month disqualifies. This is already ALL-months continuity. |
| Trigger orchestration | `evaluateMonthlyTrigger` / `evaluateAnnualTrigger` (`src/lib/pip/pipTriggerRules.ts`); annual uses `<=`, monthly uses `<`. |
| Overall score source | `useMonthlyTrend` — `monthlyScores` (8-stage cascade) and `monthlyFinalScores` (final only). `usePIPCandidates` consumes `monthlyScores`. |
| Threshold source | `system_settings.pms_pip_threshold` (currently **2**), read via `getPipThreshold` (`src/lib/pmsSettings.ts`), edited in **System Settings → PIP Threshold** (`PipThresholdCard.tsx`). Configurable, decimal, 0–5, 2 dp. |
| Consecutive months | **Not configurable.** `POLICY_CONSECUTIVE_MONTHS = 3` is hardcoded in `pipTriggerRules.ts`, and `PIPSuggestionsPanel.tsx` holds `windowMonths` as local UI state defaulting to 3. `pip_monitor_months` is post-PIP monitoring — a different concept. |
| Longer range | `usePIPCandidates` evaluates a trailing window of exactly `windowMonths` (anchored), so the range question never arises there; `MonthlyTrendView`'s PIP filter applies ALL-months over whatever range the user picked (Option B). Two different behaviours coexist. |
| Other config | `pip_min_duration_days`, `pip_max_duration_days`, `pip_monitor_months`, `pip_require_rm2_approval`, SLA/milestone days — all in `system_settings` via `pipPolicySettings.ts` / `pipSlaSettings.ts`. |
| Workflow | `PIPManagement.tsx`, `PIPCreate.tsx`, `PIPCreateForm`, `PIPDetailSheet`, `pipTransitions.ts`, `generate-pip-letter` edge function, milestone/SLA reminder jobs. Human-initiated; no auto-generation job. |
| Tests | `pipCandidateRule`, `pipTriggerRules`, `pipLifecycle`, `lowScoringKpis`, `monthlyTrendPipFilter` are covered. |

## C. Configuration audit

| Configuration area | Frontend setting | Backend source | Store | Current consumers | Gap |
|---|---|---|---|---|---|
| TNI threshold | none | none | none | hardcoded 3.0 in `useTNI.ts`; 2.0/2.5 in SQL | **Missing — must add** |
| TNI priority bands | none | none | none | SQL literals | Missing (low priority) |
| PIP threshold | `PipThresholdCard` | `getPipThreshold` | `system_settings.pms_pip_threshold` | `usePIPCandidates`, `MonthlyTrendView`, `useLowScoringKpis` | OK — reuse |
| PIP consecutive months | dropdown only (not persisted) | none | none | hardcoded 3 / local state | **Missing — must add** |
| TNI continuity rule | n/a | n/a | n/a | ANY-month union | **Wrong — must fix** |
| PIP continuity rule | n/a | code | n/a | ALL-months in range | Rule correct; `<` should be `<=` |
| Organisation scope | department post-filter in `useTrainingNeeds` | — | — | — | No org-scoped TNI/PIP policy; access governed by RLS + report access catalog |
| Effective dating | none | — | — | — | Missing — thresholds are current-value-only |

## D. Gap analysis

| Area | Existing behaviour | Required | Recommended change |
|---|---|---|---|
| Comparison operator | `<` | `<=` | Change in TNI qualification and PIP candidate rule |
| TNI threshold config | hardcoded 3.0 | admin-configurable decimal | Add `pms_tni_threshold` to `system_settings`; reuse the `PipThresholdCard` pattern; one loader in `pmsSettings.ts` |
| Single-month TNI | `< 3.0` | `<=` configured threshold | Same resolver everywhere |
| Multi-month TNI (Month/QTD/YTD/AY/Custom) | union of monthly records | same employee+KPI `<=` threshold in **every applicable month** | Continuity layer over the report data |
| Detect / Backfill | writes with default 3.0; de-dupes by kpi_id only | uses configured threshold; safely re-runnable | Pass the resolved threshold; change the conflict key to (kpi_id, period, year) with update on re-detect |
| Dashboard cards | count monthly records | count qualifying employee+KPI pairs | Derive cards from the same qualified set |
| Export | mirrors screen | mirrors corrected screen | Same qualified set plus per-month evidence columns |
| Missing scores | absent month = no row | month is skipped, never read as 0 | Evaluate only months that have an approved score; a range with no scored month never qualifies |
| KPI identity | `kpi_id` (per-month row) | stable identity across months | Match on employee + normalised `kra_name` + `kpi_name`, reusing the KPI standardization registry aliases |
| PIP consecutive months | hardcoded 3 | configurable minimum window | Add `pip_consecutive_months` to `pipPolicySettings.ts`; it sets the default window length and the minimum number of scored months required, not a sliding streak |
| PIP longer range | two divergent behaviours | entire selected range at/below threshold | Align `PIPSuggestionsPanel` with `MonthlyTrendView`: all scored months in the selected range must be `<=` threshold |
| Performance | loads all rows in range client-side, unbounded | bounded | Evaluate continuity server-side in a set-returning RPC; keep the existing page and filters |
| Security / tenant isolation | `training_needs` RLS + report access catalog | unchanged | New RPC is SECURITY DEFINER but re-applies the same visibility predicate; export stays gated by `canDownload('tni')` |

## E. Reuse assessment

Reuse unchanged: `TNIReport.tsx` filters (`buildRanges`, Month/QTD/YTD/AY/Custom, Detect TNI, Backfill Range, Export), the `training_needs` table, `detect_training_needs_for_period` (parameterised), the `system_settings` config pattern (`pmsSettings.ts`, `pipPolicySettings.ts`), the `PipThresholdCard` UI pattern, `useMonthlyTrend` as the overall-score SSOT, `isPipCandidate` as the existing continuity evaluator, and `accessCatalog` / `canDownload` for export gating.

Generalise rather than duplicate: promote `isPipCandidate` into a shared `allMonthsAtOrBelow(scores, monthKeys, threshold)` evaluator used by both TNI (per employee+KPI) and PIP (per employee). No new reporting engine, period engine, detection service or tables.

## F. Recommended implementation (only after approval)

1. **Configuration** — add `pms_tni_threshold` and `pip_consecutive_months` to `system_settings` (seed 2 and 3); extend `pmsSettings.ts` / `pipPolicySettings.ts`; add a TNI Threshold card beside the PIP one in System Settings. No new tables.
2. **Shared evaluator** — `src/lib/continuity/allMonthsAtOrBelow.ts` with `<=` semantics; `pipCandidateRule` delegates to it.
3. **TNI qualification RPC** — `tni_qualified_for_period(p_months jsonb, p_threshold numeric)` returning employee, KPI identity, per-month scores and a qualified flag, evaluated at query time from `kpis` + `review_submissions`. `training_needs` remains the store for status, recommendation and workflow, joined in. This removes the backfill-union defect at its root.
4. **Report wiring** — `useTNI.ts` gains `useQualifiedTrainingNeeds(periodRanges)`; table, summary cards and export all read that single set. The table gains per-month score columns and a "continuous low period" indicator in multi-month mode. Filters unchanged.
5. **Detect / Backfill** — pass the configured threshold; fix the de-dupe key so re-detection updates score and priority.
6. **PIP** — `<=` comparison; `pip_consecutive_months` drives the evaluation window and `shortWindow`; align `MonthlyTrendView` with the Q1 decision.
7. **Tests** — full TNI matrix (2.0/2.0/2.0 include; 1.8/1.9/2.0 include; 2.0/2.1/2.0 exclude; 1.5/2.5/1.5 exclude; 2.0 include, 2.01 exclude), threshold-change tests (2.0 vs 2.5), Apr–Jun include vs Apr–Jul exclude, the backfill-union regression test, cards-vs-table reconciliation, PIP matrix with configurable consecutive months, boundary/decimal and missing-data tests.
8. **Docs** — ADR-252, POLICY §TNI-PERIOD-CONTINUITY and §PIP-CONSECUTIVE-MONTHS, DOCUMENTATION.md version history.

## G. Business decisions genuinely required

- **Q1 — PIP over a longer range.** For Apr–Aug with 3 consecutive months configured: Option A (any 3-month streak inside the range qualifies) or Option B (entire range at/below threshold)? Today the suggestions panel behaves like a fixed 3-month window and the trend view behaves like Option B. Recommendation: **Option A**, matching "configured number of consecutive months" and making the selected range a search window.
- **Q2 — missing month.** When a month in range has no approved score (KPI not assigned, employee joined late, review pending): (a) disqualify, (b) skip it and evaluate only applicable months, or (c) disqualify only when the KPI existed but was unscored? Recommendation: **(b) for TNI** and **(a) for PIP** (which is current PIP behaviour).
- **Q3 — historical thresholds.** Thresholds are current-value-only today. Keep that, or introduce effective-dated thresholds? Recommendation: keep current-value-only and stamp each report with the threshold used.