

## RCA — Three bugs in HR PMS / Audit / Management dashboards

### Bug 1 — Sanjeeb Kumar Jena (101178) "missing" from HR PMS for March 2026

**Status check (DB):**
- Workflow: `[kra_set, self_review, manager_check, skip_level_check, hr_pms_review, approved]` — includes `hr_pms_review` ✅
- March 2026 KPIs: 23 at `hr_pms_review`, 3 at `self_review`, 1 at `kra_set`
- Therefore he IS in the HR PMS pool (`useProfilesByWorkflowStage` filter passes)

**Why he doesn't appear on page 1**: For HR PMS, `badge1` (pending) is computed via `resolveReviewableStatuses('hr_pms', stages) - 'hr_pms_review'`. For his 6-stage workflow that resolves to **only `skip_level_check`**. He has 0 KPIs at `skip_level_check`, so:
- `badge1 = 0` (urgency-sort key)
- `badge2 = 23` (in HR PMS review)
- `badge3 = 0`

The grid sort is `badge1 DESC` → he sinks behind every employee with even one item at skip_level_check, ending up far past page 1. The v2.64.5 discoverability pill only fires when `badge1 === 0 AND total > 0` — Sanjeeb qualifies but the pill points to "Reviewed" status, not "In Review". His 23 are `in_review`, not `reviewed`.

**Root cause**: HR PMS sort uses only `badge1` for urgency. KPIs already at `hr_pms_review` (badge2) are equally actionable for the HR PMS reviewer — they ARE the review workload — yet are excluded from the urgency key. Same defect applies to Audit (`badge1` excludes `audit` stage items).

### Bug 2 — "Total Employees" inaccurate in Audit & Management dashboards

**What it currently shows**: `demographicFilteredMembers.length` — every active employee whose resolved workflow includes the panel's stage (e.g., for Audit, every employee whose template contains `audit`). For most large orgs this is ~all 2,500+ employees, regardless of whether they have any KPI in the selected period.

**Why it feels wrong**: Reviewers expect "Total Employees" to mean "people I have to review this period", not "people I might ever review". The metric is technically the size of the queryable pool, not the actionable cohort.

**Root cause**: The stat card label is misleading. `totalEmployees` should reflect employees with at least one KPI in the selected period at a stage relevant to this reviewer (pending, in-review, or reviewed by them). The current value is closer to "Eligible Employees" than "Total Employees".

### Bug 3 — Arun Goswami (100513) shows "no pending" on card, but KPIs ARE pending when opened

**DB state for March 2026**: 1 at `self_review`, 3 at `management_review`, 9 `approved`. Workflow: `[kra_set, self_review, audit, management_review, approved]` (no manager_check).
- Audit `badge1` for March = 1 (the self_review item) → pending IS visible

**But user is on `?view=audit` with NO period in URL → defaults to current month = April 2026**: 13 at `kra_set` only. Audit `badge1` for April = 0 → card correctly shows "no pending".

When the user **clicks Arun's card**, `UnifiedScorecard` runs the smart-period-detection workflow (per `mem://features/review/smart-period-detection-workflow`) and auto-switches to **March** because that's where his pending audit work lives. The PeriodAutoSwitchBanner is supposed to disclose this, but the user perceives the change as "card lied".

**Root cause**: The grid card and the scorecard view two different periods after auto-switch. The card never updates to reflect the auto-switched period, so the "no pending" badge is stale relative to what the user sees inside the scorecard. Also, when the panel period is empty for an employee, the card gives no hint that "pending work exists in another period — click to see".

### Bonus finding — React warning (`StatCard` ref)
Console shows: `Function components cannot be given refs … Check the render method of EmployeeSelectorGrid` for `StatCard`. Tooltip wrappers in the stat cards forward refs into a plain function component. Per project memory: Radix children require `forwardRef`. Cosmetic but worth fixing since we're touching the grid.

---

## Proposed Fixes

### Fix 1 — Smarter urgency sort for HR PMS / Audit (Sanjeeb visibility)
Change the sort key in `EmployeeSelectorGrid.tsx` line 671 so that for `hr_pms` and `audit` views, urgency = `badge1 + badge2` (pending PLUS items currently at the reviewer's own stage). Both represent live workload for that reviewer.

```ts
// Before
if (statsB.badge1 !== statsA.badge1) return statsB.badge1 - statsA.badge1;
// After (for hr_pms / audit / management):
const urgencyA = (viewLevel === 'hr_pms' || viewLevel === 'audit' || viewLevel === 'management')
  ? statsA.badge1 + statsA.badge2
  : statsA.badge1;
const urgencyB = ...statsB...;
if (urgencyB !== urgencyA) return urgencyB - urgencyA;
```

Result: Sanjeeb's 23 items at `hr_pms_review` push him onto page 1 alongside other actionable employees.

Also widen the `reviewedOnBackPagesCount` predicate: an employee is "fully reviewed" only if `badge1 + badge2 === 0 AND total > 0`.

### Fix 2 — Period-aware "Total Employees" stat card
Recompute `stats.totalEmployees` in `EmployeeSelectorGrid.tsx` line 764 block to reflect **employees with at least one KPI in the period** that is relevant to this view (pending, in-review, or reviewed). Add a tooltip on the stat card: *"Employees with at least one KPI in this period at a stage relevant to your role"*.

For Admin / cross-check users, expose a secondary subtle line under the value: `(of N total in pool)` so the broader denominator stays visible without misleading the headline number.

### Fix 3 — Reconcile card period with auto-switched scorecard period (Arun)
Two-part fix:

a. **In `EmployeeSelectorGrid` — "Activity in another period" hint**: when a card has `total === 0` for the selected period AND the employee has KPIs in nearby periods (already detectable via `useKpisByPeriodRanges` — extend with a one-time peek), render a subtle badge: `Last activity: March 2026` so the card and scorecard agree.

b. **In `UnifiedScorecard` — already has `PeriodAutoSwitchBanner`**: confirm it renders for Arun's case, and make its CTA "Update grid period to match" — clicking it propagates the switched period back to the grid via the existing `onPeriodSelectionChange` prop, so the next time the user returns to the grid, the card numbers will match what they just saw.

### Fix 4 — `StatCard` `forwardRef` cleanup
Wrap `StatCard` (line 1766) in `React.forwardRef` to silence the warning and prevent broken Tooltip refs.

---

## Files Touched

| File | Change |
|---|---|
| `src/components/review/EmployeeSelectorGrid.tsx` | Sort key includes `badge2` for hr_pms / audit / management; `reviewedOnBackPagesCount` widened; stats `totalEmployees` recomputed against period KPIs; "Last activity in <period>" hint on zero-KPI cards; `StatCard` wrapped in `React.forwardRef` |
| `src/components/scorecard/PeriodAutoSwitchBanner.tsx` (existing) | Add "Update grid period" CTA that calls `onPeriodSelectionChange` |
| `src/components/scorecard/UnifiedScorecard.tsx` | Pass `onPeriodSelectionChange` to the banner so the grid period can be updated when user accepts the auto-switch |
| `DOCUMENTATION.md` | Version History v2.64.8 — Reviewer grid urgency sort, total-employees accuracy, auto-switch reconciliation, StatCard ref fix |
| `mem://features/review/reviewer-grid-progress-and-prioritization` | Append: "HR PMS / Audit / Management urgency = badge1 + badge2 (own-stage KPIs are part of live workload)" |
| `mem://features/review/smart-period-detection-workflow` | Append: "Auto-switch banner exposes a CTA to push the switched period back to the parent grid for consistency" |

No DB / RLS / workflow / migration changes. Pure UI logic.

---

## Risk & Impact

| Area | Impact |
|---|---|
| Data | None — read-only logic |
| Workflow / RLS | None |
| UI ordering | HR PMS / Audit / Management grids re-order: employees actively in-review surface alongside employees with new pending items. Manager / Skip-level grids unchanged |
| "Total Employees" number | Drops from "all eligible" to "active in this period" — matches user expectation. Add tooltip + secondary count to retain transparency |
| Regression | Low. Sort change is local; recomputed stat is opt-in per view; `forwardRef` is additive. Existing v2.64.4 / v2.64.5 fixes (URL stability + discoverability pill) preserved |
| Mitigation / test matrix | (a) HR PMS panel, March 2026 → Sanjeeb 101178 visible on page 1 with "23 in review" badge. (b) Audit panel, March 2026 → Arun shows "1 pending". (c) Audit panel, April 2026 → Arun shows "no pending" + "Last activity: March 2026" hint. (d) Click Arun → scorecard auto-switches to March → banner offers "Update grid". (e) HR PMS Total Employees count matches sum of pending+in-review+reviewed for the period. (f) Console clean (no `forwardRef` warning). (g) Mobile (<640px): stat tooltip accessible via long-press |

## Out of Scope
- Server-side pagination
- Refactoring `getEmployeeKpiStats` into a shared hook
- Changing manager / skip-level urgency rules (their `badge1` already captures full workload)
- Removing pagination

