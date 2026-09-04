# Team Reviews — show everyone who has KRAs (ADR-359)

## What you asked
On Team Reviews, any team member who has KRAs/KPIs assigned for the selected period must be visible — even when their items are still at KRA Set and nothing is waiting on you. Only people with no KRAs at all should be hidden by default.

## Current behaviour (verified in code)
`EmployeeSelectorGrid.tsx` defaults the team list to `queue=actionable` (ADR-348) and keeps only members whose relationship-aware pending count (`badge1`) is above zero. Someone with 12 KPIs all sitting at KRA Set has `badge1 = 0`, so their card disappears entirely. The on/off switch is the only way back to the full list.

## Change

1. **Three view modes instead of a two-state switch** (`src/lib/review/actionableQueueFilter.ts`, URL param `queue`):
   - `assigned` — **new default**: members with at least one KPI assigned in the period (`total > 0`), regardless of stage. KRA Set members are visible.
   - `actionable` — only members with items pending your action (today's default, kept for reviewers who want a short worklist).
   - `all` — every mapped member, including those with no KRAs.
   New pure predicate `hasAssignedKras(stats) => stats.total > 0` next to the existing `isActionableForReviewer`; `normalizeTeamQueueFilter` accepts the three values and falls back to `assigned`.

2. **Filter application** (`EmployeeSelectorGrid.tsx`): the post-status filter step selects the predicate by mode — `assigned` → `hasAssignedKras`, `actionable` → `isActionableForReviewer`, `all` → no filter. Sorting, pagination, tiles and status filters are untouched.

3. **Control** (`TeamQueueToggle.tsx` → segmented control): "With KRAs" (default) / "Pending action" / "All", with a count line such as `Showing 120 of 508 · 39 pending your action`. Shown to every reviewer on Team Reviews (both the standard and full-access placements already present).

4. **Empty states**: "All caught up" stays for `actionable`; for `assigned` with zero results, a message that no team member has KRAs assigned this period plus a button to switch to All.

5. **Tests** (`src/tests/actionableQueueFilter.test.ts`): default is `assigned`; KRA-Set-only member visible under `assigned`, hidden under `actionable`; zero-KPI member hidden under `assigned`, visible under `all`; unknown/legacy `queue` values normalise safely.

6. **Docs**: ADR-359, POLICY §129 amended (default queue visibility = assigned KRAs), DOCUMENTATION.md version entry, roadmap.

## Risk & impact
- Data/RLS/workflow/scoring: no change — client-side presentation filter over already-fetched data.
- UI: team list becomes longer by design; counts and tiles unchanged.
- Regression: low; the filter composes after the existing status pipeline exactly as today. Old `?queue=all` links keep working; `?queue=actionable` keeps working.
- Rollback: flip the default constant back to `actionable`; predicates are additive.
