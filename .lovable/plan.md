

## RCA: Flicker returns when switching Team → HR PMS (v2.64.1 fix incomplete)

### Why the previous fix didn't catch this case

In v2.64.1 we added `placeholderData: keepPreviousData` to `useProfilesByWorkflowStage` and gated the skeleton on `isLoading && !hasAnyData`. That logic works **only when `baseMembers` already had data from the same query**. The Team → HR PMS switch breaks that assumption:

| Step | Source feeding `baseMembers` | Has previous data? |
|---|---|---|
| Team view active | `teamMembers` (manager) or `allProfiles` (admin/HR) | Yes |
| Click HR PMS | switches to `stageFilteredProfiles` (`useProfilesByWorkflowStage('hr_pms_review', …)`) | **No — first call this session, query was disabled before** |
| Result | `baseMembers = undefined` → `hasAnyData = false` → `isLoading = true` → **full skeleton renders** | Flicker |

`keepPreviousData` only preserves data **within the same query key**. It does not carry data **across two different queries**. So the very first time a user enters HR PMS / Audit / Management / Pending* in a session, `stageFilteredProfiles` is cold and the skeleton flashes. Subsequent panel switches between those panels are smooth (because each query now has cached data).

This matches what the user is reporting: flicker on Team → HR PMS, but smoother after.

### Secondary trigger — `requiredStage` toggling on/off

Even when admin/HR PMS users have `allProfiles` cached, the `baseMembers` `useMemo` selector switches sources based on `requiredStage`:
- Team view: `requiredStage = null` → returns `allProfiles` (cached, instant)
- HR PMS view: `requiredStage = 'hr_pms_review'` → returns `stageFilteredProfiles` (cold)

So `baseMembers` literally becomes `undefined` for one render cycle, even though `allProfiles` is sitting right there in the cache. The grid collapses to skeleton, then re-expands.

### Tertiary contributor — `setSelectedEmployee(null)` + filter URL clearing

`Dashboard.handleModeChange` (line 286–293) sets `selectedEmployee = null` AND clears 6 filter params from the URL synchronously. Each URL param change re-runs `useUrlFilterState`, triggering a render pass before the new query fires. Tiny, but adds to the perceived stutter.

### Why our v2.64.1 mitigations missed it

| Mitigation | Why it didn't help on cold-cache panel switch |
|---|---|
| `keepPreviousData` on `useProfilesByWorkflowStage` | Only retains data within same query key; cold first-call has nothing to retain |
| `isLoading && !hasAnyData` gate | `hasAnyData` reads from `baseMembers`, which is `undefined` at the moment of source-switch |
| `min-h-[600px]` wrapper | Prevents *vertical* collapse but doesn't prevent the skeleton's grey blocks from rendering |
| "Updating…" overlay | Only shows when there IS previous data (background fetch); doesn't trigger on cold start |

### Proposed fix — Option A (recommended, minimal)

**Keep displaying the previous panel's `baseMembers` until the new panel's data arrives.** Three small changes:

1. **`src/components/review/EmployeeSelectorGrid.tsx`** — capture last non-empty `baseMembers` in a ref/state and use it as the render fallback while a switch is in flight:
   ```text
   const lastGoodMembers = useRef<EmployeeProfile[]>([]);
   useEffect(() => { if (baseMembers?.length) lastGoodMembers.current = baseMembers; }, [baseMembers]);
   const renderMembers = baseMembers?.length ? baseMembers : lastGoodMembers.current;
   ```
   Then `hasAnyData = renderMembers.length > 0` and `isLoading && !hasAnyData` only fires on **true first-mount** (no panel ever loaded).

2. **`src/hooks/useOrganization.ts`** — also add `placeholderData: keepPreviousData` to `useProfiles()` so admin/HR users with cached profiles never re-skeleton on refetch.

3. **`src/pages/Dashboard.tsx` (`handleModeChange`)** — batch the URL clear with `unstable_batchedUpdates` or move the filter clear into a `useEffect` that runs after the new data arrives, so we don't fire 6 sequential URL writes during the switch.

### Files Touched
- `src/components/review/EmployeeSelectorGrid.tsx` — add `lastGoodMembers` ref, swap render source, use `renderMembers` for `hasAnyData` check
- `src/hooks/useOrganization.ts` — add `placeholderData: keepPreviousData` to `useProfiles()` (also on `useTeamMembers`, `useSkipLevelTeamMembers` for completeness)
- `src/pages/Dashboard.tsx` — defer filter param clearing one tick after mode change
- `DOCUMENTATION.md` — Version History entry (v2.64.3 — Cross-source flicker fix)
- Memory: append note to `mem://infrastructure/resource-and-performance-optimization` clarifying that `keepPreviousData` does not span query keys; cross-source switches need an explicit "last good" fallback

### Risk & Impact

| Area | Impact |
|---|---|
| Data correctness | None — `renderMembers` falls back to last good only while loading; once new data arrives, real `baseMembers` takes over |
| Counts/aggregates | `kpiStats` uses `periodKpis` and `workflowMap` (keyed off `allEmployeeIds`) — needs the SAME `lastGoodMembers` fallback OR we accept that aggregates briefly reflect the old panel for ~200ms. Recommendation: use the new `renderMembers` consistently for the visible page only; aggregates already update reactively when new data arrives |
| Workflow / RLS | None |
| Regression | Low. Edge case: if user switches panel while a deep-link is being processed, the ref must be reset on `viewLevel` change so we don't render Team employees inside the HR PMS layout indefinitely. Mitigated by clearing `lastGoodMembers.current = []` inside an effect keyed on `viewLevel` IF the new query produces an empty result (legitimate "no employees" state) |
| Mitigation | Manual test matrix: Team → HR PMS (cold), Team → Audit (cold), HR PMS → Management (warm), back to Team. Plus mobile (<768px) viewport |

### Out of Scope
- Server-side pagination
- Prefetching all panels on Dashboard mount (Option B from prior plan — heavier)
- Restructuring `baseMembers` to be a single unified query

