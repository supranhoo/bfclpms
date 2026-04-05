

## RCA: Multi-Month KPIs Reviewed Before Cycle Completion + Bulk Step-Back

### Root Cause

**Two gaps in the frequency lock enforcement:**

1. **No date-based cycle completion check.** The `enforce_frequency_lock_on_submission` trigger blocks non-terminal months (e.g., Jan/Feb for Q1) from transitioning `kra_set → self_review`, but does NOT check whether the terminal month's cycle has actually ended. A Quarterly March KPI can be reviewed on March 1 — before Q1 data is complete.

2. **Trigger only guards one transition.** The trigger fires only on `INSERT` or `kra_set → self_review`. Once a sibling month KPI is past `kra_set` (e.g., due to being reviewed before the trigger existed on Feb 19), subsequent transitions (self_review → manager_check → approved) are not blocked. This allowed 10 Quarterly January KPIs and 6 Bi-Monthly February KPIs to be fully approved on sibling months.

**UI has no cycle-completion gate either** — `isKpiLockedForPeriod` only checks if the month is a sibling (locked) month, not whether the terminal month's cycle period has elapsed.

### Data Impact — 18 Prematurely Reviewed KPIs

| Category | Count | Status | Details |
|----------|-------|--------|---------|
| Quarterly January (sibling) | 10 | 9 approved, 1 self_review | Reviewed Feb 14-18 (before trigger existed) |
| Quarterly February (sibling) | 1 | manager_check | Swaraj Mukhopadhyay — the screenshot KPI |
| Quarterly March (terminal, early) | 1 | self_review | Piyush Bansal — reviewed Mar 31, before Q1 ended |
| Bi-Monthly February (sibling) | 6 | all approved | Reviewed Feb 18-Mar 2 (before trigger existed) |
| **Total** | **18** | | |

### Percolation Verification

Percolation is working correctly by design: it only fires when a terminal month KPI transitions to `approved`. For the screenshot KPI (Swaraj, Q1 Cost Saving), March is at `self_review` — once it completes the full workflow and reaches `approved`, the trigger will propagate scores to Jan and Feb siblings (only if they've independently reached their terminal workflow stage, per ADR-047 amendment).

### Fix — 4 parts

#### Part 1: Database Migration — Bulk Step-Back 18 Prematurely Reviewed KPIs

Reset all 18 KPIs to `kra_set` status, clear all review submission data (scores, ratings, remarks), and log `ADMIN_BULK_STEP_BACK` with `performed_by = NULL` (System) and reason "Reverting premature review — multi-month KPI reviewed before cycle completion."

```sql
-- Identify: Quarterly Jan/Feb 2026 beyond kra_set + Bi-Monthly Feb 2026 beyond kra_set
-- + Quarterly March reviewed before April 1
-- Reset status to kra_set, clear review_submissions
```

#### Part 2: Database Trigger — Add Cycle Completion Date Check

Enhance `enforce_frequency_lock_on_submission` to:
1. Block ALL status transitions (not just `kra_set → self_review`) for non-terminal months — remove the narrow condition
2. For terminal months, add a date check: block `kra_set → self_review` if `CURRENT_DATE <= last day of terminal month`

```text
Logic:
  month_num = extract month from review_period
  IF month is in locked_months → BLOCK (sibling month, never reviewable directly)
  IF month is terminal → check CURRENT_DATE > end_of_month(review_period, review_year)
     If not past cycle end → BLOCK with message "Cycle not yet complete"
```

Admin bypass remains intact. Service role bypass remains intact.

#### Part 3: UI — Add Cycle Completion Gate

Add a new utility function `isCycleComplete(frequency, reviewMonth, reviewYear)` in `frequencyUtils.ts`:
- For terminal months: returns `true` only if `today > last day of terminal month`
- For sibling months: always returns `false` (already handled by `isKpiLockedForPeriod`)

Use this in:
- `SelfReviewSheet.tsx`: Alongside `isFrequencyLocked`, add `isCycleIncomplete` check that shows a message like "This quarterly KPI can be reviewed from April 1 after Q1 ends"
- `UnifiedScorecard.tsx`: Grey out review actions for terminal-month KPIs where cycle is incomplete
- Review journey components: Show "Cycle in progress" indicator

#### Part 4: Documentation

| File | Change |
|------|--------|
| `POLICY.md` | Add §58: Multi-month KPIs can only enter workflow after terminal month ends |
| `docs/adr/ADR-045.md` | Amend with cycle-completion gate requirement |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **Step-back**: 18 KPIs return to kra_set. For the 15 that were approved, their scores were on sibling months — not the terminal month. No terminal month data is lost.
- **Trigger enhancement**: Broadens blocking from one transition to all transitions on sibling months. Adds date gate for terminal months. Admin bypass preserved.
- **UI gate**: Additive check. Employees see clear messaging about when review opens.

