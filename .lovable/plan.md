

## RCA: Flicker when switching from Team Review → HR PMS

### Root cause — confirmed from code reading

When the user clicks a different mode in `ViewModeToggle`, `Dashboard.handleModeChange` (line 284) updates `viewMode` and clears the URL filter params. This causes `<EmployeeSelectorGrid>` to re-render with a **new `viewLevel` prop**. The flicker is caused by **a sequence of three intermediate render states** before HR PMS settles:

**Frame 1 — old grid still rendered** (Team view employee cards visible).

**Frame 2 — `isLoading=true` skeleton shown** (`EmployeeSelectorGrid.tsx` line 1292):
```
<div className="h-20 bg-muted animate-pulse rounded-lg" />
... grid of 4 + 6 skeleton placeholders ...
```
This happens because:
- `viewLevel='hr_pms'` → `requiredStage='hr_pms_review'` → triggers `useProfilesByWorkflowStage('hr_pms_review', period, year)` (line 178)
- `stageFilteredProfiles` is `undefined` while fetching → `stageFilteredLoading=true`
- `isLoading` branch (line 265) returns `true` → renders the skeleton
- The skeleton **replaces the entire scorecard layout**, including the `ViewModeToggle` strip itself becomes visually "below" a different block height — that's the *flicker* the user perceives

**Frame 3 — HR PMS grid renders** with the actual cards.

So the user sees: **Team grid → blank/grey skeleton → HR PMS grid**, in ~200–800ms (depending on cache).

### Why it's worse for HR PMS specifically

- **Team view** (when admin/HR PMS): uses `profilesLoading` (`useProfiles`) which is usually already cached → no skeleton shown → instant render.
- **HR PMS view**: triggers an **additional** query (`useProfilesByWorkflowStage('hr_pms_review', ...)`) keyed by `(stage, period, year)`. First time switching in the session, this is a cold cache → forces `isLoading=true` → skeleton flashes. Same applies to Audit, Management, and Pending* panels.
- The Team grid → cached profiles → no skeleton.
- HR PMS / Audit / Management → fresh `useProfilesByWorkflowStage` query → skeleton.
- That asymmetry is what produces the visible "flicker between both screens".

### Secondary contributors

1. **Filter param clearing** (`handleModeChange` line 289–293) triggers a synchronous URL update, which re-runs the `useUrlFilterState` hooks and resets all derived `useMemo`s on the next render — a tiny extra layout pass.
2. **`ViewModeToggle` itself does not unmount** (always rendered above the grid), but the grid block below collapses from N cards → 11 skeleton placeholders → M cards, creating a **height jump**. The eye reads this as a flicker.
3. **`useBulkEmployeeWorkflows`** and **`useEmployeeScoresForPeriod`** chain off `allEmployeeIds` which changes the moment `stageFilteredProfiles` resolves → another render pass with progressively-filling data.

### Working as designed, but UX needs polish

Per `mem://features/admin/menu-access-rights` and `mem://features/review/period-specific-reviewer-visibility`, stage-filtered fetching is intentional (don't show employees outside the panel's workflow). The flicker is purely a **transition UX** issue — not a data/correctness bug.

### Proposed fix (minimal, recommended — Option A)

Use **`keepPreviousData`** on the stage-filtered query and gate the skeleton on "no previous data" instead of "loading":

1. **`src/hooks/useOrganization.ts`** — add `placeholderData: keepPreviousData` (TanStack v5) to `useProfilesByWorkflowStage`. On panel switch, the previous panel's profiles stay rendered until the new ones arrive — no skeleton.
2. **`src/components/review/EmployeeSelectorGrid.tsx`** — change `isLoading` skeleton condition to `isLoading && !baseMembers?.length` so we only show the skeleton on **true cold start** (no data at all), not on background re-fetch.
3. Add a subtle top-right `<Loader2 className="animate-spin" />` indicator while a background fetch is in-flight — gives feedback without collapsing the layout.
4. Optional: wrap the grid block in a fixed `min-h-[600px]` to prevent height jump even if a skeleton briefly appears.

### Files Touched (Option A)
- `src/hooks/useOrganization.ts` — add `placeholderData` to `useProfilesByWorkflowStage` (and same for `useProfiles` if cold)
- `src/components/review/EmployeeSelectorGrid.tsx` — soften skeleton condition; add inline spinner; add `min-h` wrapper
- `DOCUMENTATION.md` — Version History entry
- Memory: append a one-line note to `mem://infrastructure/resource-and-performance-optimization` about `placeholderData` for panel-switching queries

### Alternative — Option B (heavier)
Prefetch all panels' `useProfilesByWorkflowStage` queries on Dashboard mount so all panel switches are instant. Higher data cost on first load (4 extra queries even if user never switches).

### Risk & Impact (Option A — recommended)

| Area | Impact |
|---|---|
| Data | None. Read-only query option change. |
| Workflow | None. |
| UI | Smooth panel switch — old cards stay visible until new ones arrive (~100–500ms). Spinner top-right gives feedback. |
| Regression | Very low. `placeholderData` is a TanStack-supported pattern; cold start (no prior data) still shows the skeleton, so first-mount UX is unchanged. |
| Mitigation | Test all 4 panel transitions: Team → HR PMS, HR PMS → Audit, Audit → Management, and back to Team. Verify cold-start (hard refresh on `/dashboard?view=hr_pms`) still shows skeleton (no blank). |

### Out of Scope
- Changing the stage-filter logic itself.
- Persisting all panels' data simultaneously (Option B).
- Restyling `ViewModeToggle` or skeleton.

