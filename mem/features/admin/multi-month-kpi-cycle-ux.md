---
name: multi-month-kpi-cycle-ux
description: Admin KPI create/edit dialogs MUST display full cycle months and the review anchor month for multi-month KPIs (POLICY §54 v3 UX clause)
type: design
---
Multi-month KPIs (Bi-Monthly, Quarterly, Half-Yearly, Yearly) anchor on the cycle's terminal month per POLICY §54 v3 (`mem://architecture/pms/multimonth-percolation`). The `percolate_multimonth_score` trigger then back-fills the approved score to all sibling months.

**UX contract**: Any admin-facing dialog that creates or edits a KPI MUST surface a banner that explicitly shows:
1. The **full cycle month range** (e.g. "covers April, May, June 2026")
2. The **review anchor month** (e.g. "reviewed once in June 2026")
3. A `<Tooltip>` on an `<Info>` icon explaining the percolation contract

Use the canonical helper `buildCycleScopeLabel(frequency, reviewMonth, reviewYear, frequencyCycleStart)` in `src/lib/frequencyUtils.ts` — never recompute cycle months ad-hoc. The helper handles year-wrapping cycles (e.g. Quarterly Nov 2026 → anchor Jan 2027).

Reference impl: `src/components/admin/AdminKpiCreateDialog.tsx` (banner near review-period selector). Apply the same banner if a future edit dialog exposes review period changes.

**Forbidden**: A bare "will be assigned to <month>" string without explaining cycle scope and percolation. Past confusion (2026-04-29) caused users to perceive the cycle-end behavior as a bug.

Tests: `src/test/multiMonthBannerCopy.test.ts`.

**Pending-banner derivations (added 2026-05-16):** Self-mode "pending KPI" alerts and any equivalent reviewer-side actionable counters MUST resolve cycle anchors via `buildCycleScopeLabel()` and skip rows whose `(review_period, review_year)` is not the anchor. Counting raw `kra_set`/`self_review` rows by month alone falsely prompts users to act on multi-month placeholders they cannot edit. Reference impl: `src/components/review/UnifiedScorecard.tsx` `pendingPeriods` memo. Tests: `src/test/pendingPeriodsMultimonth.test.ts`. Codified in POLICY §54 UX Corollary.
