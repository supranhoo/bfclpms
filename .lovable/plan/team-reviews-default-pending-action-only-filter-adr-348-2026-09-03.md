# Team Reviews — Default "Pending Action Only" Filter (ADR-348)

## Goal
On the Team Reviews grid, the reviewer should by default see **only the team members who still have items waiting for them to clear** (pending KRA review at their stage). A switch reveals the full mapped downline (direct + skip-level + functional reports), as today.

## Assumptions
- "Team members which we clear" = employees with at least one KPI sitting at a stage the signed-in reviewer personally acts on (the existing `badge1` pending count in `getEmployeeKpiStats`, which is already relationship- and workflow-stage-aware for direct / indirect / functional reports).
- Applies to the **Team Reviews** view (`viewLevel = 'team'`). Other reviewer panels (HR PMS, Audit, Management) keep their current defaults; the same toggle can be extended later.
- The existing status dropdown ("All Employees", "Pending (Direct)", …) stays unchanged and works on top of this filter.

## Risk & Impact Report
- **Data impact:** None — pure client-side filter over data already fetched (`periodKpis`, roster). No schema/RLS change.
- **Workflow impact:** None — visibility only; no review action changes.
- **UI/UX impact:** Grid defaults to a shorter, actionable list; a visible toggle + empty state explains how to see everyone. Filter persists in the URL (deep-link safe) and resets via "Clear All".
- **Regression risk:** Low — filter composes *after* the existing `statusFilter` pipeline; tile counters (top cards) are left untouched so queue counts still reflect the full roster. Risk of "employees disappeared" confusion is mitigated by the toggle label and empty-state CTA.
- **Scalability:** Filter is O(n) over already-loaded members; pagination continues to apply after filtering.
- **Mitigation:** Pure predicate unit-tested; toggle state visible at all times; Clear All restores default (actionable-only) view.

## Implementation
1. **New predicate** `src/lib/review/actionableQueueFilter.ts`
   - `isActionableForReviewer(stats) => stats.badge1 > 0` (extracted as a named, testable pure function so the rule has a single source of truth).
2. **`EmployeeSelectorGrid.tsx`** (team viewLevel only)
   - New URL-persisted state: `useUrlFilterState('queue', 'actionable')` — values `actionable` (default) | `all`.
   - After the existing status-filter pipeline, when `viewLevel === 'team'` and `queue === 'actionable'`, keep only members where `isActionableForReviewer(getEmployeeKpiStats(m.id, m.relationship))`.
   - Selecting any non-`all` status filter (tile click / dropdown) still works; the queue filter applies within that subset.
3. **UI control** (in the filter row, next to the status dropdown)
   - A labelled switch/toggle: **"Pending action only"** — ON by default.
   - When ON: subtitle chip shows `X of Y members have items pending`.
   - When OFF: full mapped downline renders (current behaviour).
4. **Empty state**: when the actionable filter yields zero members — "All caught up — no pending items in your queue" with a button "Show all team members" (sets `queue=all`).
5. **Pagination / Clear All**: reset page on toggle; `useClearAllFilters` clears `queue` back to its `actionable` default.
6. **Tests** `src/tests/actionableQueueFilter.test.ts`
   - Predicate true/false cases (direct pending, skip pending, functional pending, fully reviewed, no KPIs).
   - Default value is `actionable`; `all` bypasses the filter.
7. **Docs**: DOCUMENTATION.md v2.66.348 entry + POLICY.md §129 (Team Reviews default queue visibility) + ADR-348 record.

## UI Changes (explicit)
- **What:** New "Pending action only" toggle in the Team Reviews filter bar; grid defaults to actionable members only; new empty state.
- **Where:** `/dashboard?view=team` (Team Reviews), filter row beside the status dropdown.
- **Interaction:** Toggle switch; state survives refresh via `?queue=`; respects search/dept/designation/status filters simultaneously.
- **Responsiveness:** Toggle collapses to icon+label chip under the existing filter-standard mobile breakpoint; no layout shift in the card grid.

## Rollback
Single URL param + one composable filter step — revert by removing the predicate application; default `actionable` constant flips back to `all` if needed.
