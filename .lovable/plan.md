# Fix: Category weightage badge should total 100% irrespective of KPI frequency

## Problem

On Jaspal's scorecard (Apr 2026, Month view), the "Performance by Category" badge shows **(95%)** instead of (100%). The missing 5% belongs to a **Quarterly** KPI that is auto-marked `is_na` for Apr because Apr is not the cycle-end month of its quarter.

The badge intent (per `mem/features/reports/...` and `src/test/scorecard/categoryWeightageBadge.test.tsx`) is to confirm that the **KRA mapping totals 100%** — i.e. it is a structural integrity check, not a "scorable this month" check. Today's logic incorrectly excludes weightage that is N/A purely due to frequency timing, breaking that invariant for any employee with non-monthly KPIs.

## Root cause

`src/components/review/UnifiedScorecard.tsx` lines 591–598:

```ts
const fullAssignedWeight = useMemo(() => {
  if (!kpis?.length || !submissions) return 0;
  return kpis.reduce((sum, kpi) => {
    const submission = submissionMap.get(kpi.id);
    if (submission?.is_na) return sum;        // <-- excludes frequency-N/A too
    return sum + (kpi.weightage || 0);
  }, 0);
}, [kpis, submissions, submissionMap]);
```

There is no separate flag distinguishing **frequency-driven N/A** (quarterly KPI in a non-cycle-end month) from **user/reviewer-marked N/A**. Both share `submission.is_na = true`, so the badge can't tell them apart.

## Fix (UI / presentation only)

Change `fullAssignedWeight` so it sums **every assigned KPI's weightage**, regardless of `is_na`. The badge becomes a pure KRA-mapping integrity indicator (matches the tooltip wording: *"Total weightage of all KPIs assigned this period. Should equal 100%."*).

```ts
const fullAssignedWeight = useMemo(() => {
  if (!kpis?.length) return 0;
  return kpis.reduce((sum, kpi) => sum + (kpi.weightage || 0), 0);
}, [kpis]);
```

Also update the tooltip to make the new contract explicit:
> "Total weightage of all KPIs mapped this period (all frequencies). Should equal 100%."

## Scope of impact

- **Visual only** — affects the small badge next to the "Performance by Category" title in `UnifiedScorecard`.
- **No change** to `scoreData` math: weighted score, category bars, donut, totals all still correctly exclude N/A and unscored KPIs (per `mem/architecture/pms/universal-scoring-logic` and POLICY §88).
- **No DB / RLS / workflow changes.**
- **Category bars** in the screenshot already sum to 100% (13+4+7+38+5+8+25), so this fix just makes the badge agree with the bars.

## Test updates

`src/test/scorecard/categoryWeightageBadge.test.tsx` currently asserts that N/A KPIs are excluded. Update it to the new contract:

- New case: `"includes quarterly KPI auto-N/A'd by frequency: 40+30+(N/A 30 quarterly) -> (100%) green"`.
- Remove (or invert) the existing `"excludes N/A KPI weight: ...-> (70%) amber"` case — under the new rule it becomes `(100%) green`.
- Keep the cases that test incomplete mapping (e.g. 40+30+20 = 90% amber) and rounding (99.7 → 100).

## Memory update

Add a short note under `mem/features/admin/kpi-weightage-dashboard.md` (or create a small `mem/features/review/category-weightage-badge.md`) recording the new contract: *Badge = sum of all mapped KPI weightages for the period, independent of `is_na`, frequency, or scoring status.*

## Risk & regression check

- Risk: very low — single derived value, no data writes.
- Regression: badge will now read 100% for periods that previously read <100% only due to off-cycle frequency. Users with genuine mapping gaps (e.g. KRAs summing to 90%) will still see the amber warning, preserving the integrity-check value.
- Mitigation: updated unit tests above + manual check on Jaspal Apr 2026 (expect 100% green).

## Files to touch

1. `src/components/review/UnifiedScorecard.tsx` — simplify `fullAssignedWeight` + update tooltip text.
2. `src/test/scorecard/categoryWeightageBadge.test.tsx` — align test cases with new contract.
3. `mem/features/review/category-weightage-badge.md` (new) + `mem/index.md` reference.
