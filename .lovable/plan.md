# Fix: Laggy / sticky search input on reviewer dashboards

## 1. Assumptions
- Issue reproduces on Team Reviews, Manager Review, Skip Mgr Review, Audit, Management, HR PMS — i.e. every panel rendered by `EmployeeSelectorGrid`.
- The single `EmployeeFilters` search box is the affected control.
- No backend/data change is required; this is a pure frontend responsiveness fix.

## 2. Root Cause Analysis

The search input in `src/components/review/EmployeeFilters.tsx` is a controlled `<Input>` bound to `searchQuery` from `EmployeeSelectorGrid.tsx`:

```
const [searchQuery, setSearchQuery] = useUrlFilterState('q', '');
```

`useUrlFilterState` (`src/hooks/useUrlFilterState.ts`) calls `setSearchParams(..., { replace: true })` on every keystroke. Each keystroke therefore:

1. Mutates the URL (`?q=...`) synchronously via React Router.
2. Re-runs `EmployeeSelectorGrid` top-to-bottom — a very expensive tree that:
   - Reads `useTeamMembers`, `useProfiles`, `useSkipLevelTeamMembers`, `useProfilesByWorkflowStage`, `useKpisByPeriodRanges`, `useReviewSubmissionScoresByKpiIds`, `useEmployeeScoresForPeriod`, `useBulkEmployeeWorkflows`, `useOrgKpiPeriodCounts`, audit hooks, etc.
   - Recomputes large `useMemo` chains (`allEmployeeIds`, filtered employee list, sort, pagination, badges).
3. Re-renders all child grid cards.

Result: typing and **backspacing** feel sticky — keys are queued behind the render of a multi-thousand-row dataset, and the URL replace amplifies the cost. The "deletion not registering" behaviour the user reports is the same render-blocking, not a real input bug.

This regression is invisible on small datasets but very visible once roster size grows (Team Reviews shows 1 result but the underlying dataset filtering still scans the whole roster on each keystroke).

## 3. Risk & Impact Report
- **Data impact**: none — UI-only change.
- **Workflow impact**: none — filter semantics unchanged.
- **UI/UX impact**: input becomes instantly responsive; filtered list updates with ~250 ms debounce (perceived as immediate but no longer blocks typing). URL `?q=` still updates so deep links/back-button continue working.
- **Regression risk**: low. Affects only the search box wiring; department/designation/manager/grade/status comboboxes untouched.
- **Scalability**: improves with roster size — typing cost becomes O(keystroke) instead of O(full filter pipeline × keystroke).
- **Mitigation**: keep URL sync, just debounce it; on submit/blur, flush immediately.

## 4. Step-by-step Plan

### Step A — Decouple input value from heavy state (`EmployeeSelectorGrid.tsx`)
- Keep `searchQuery` (URL-synced, drives filtering) as today.
- Add a local `inputValue` state initialised from `searchQuery`.
- Pass `inputValue` to `EmployeeFilters` for display, and a new `onSearchInputChange` that updates `inputValue` immediately.
- Debounce (≈250 ms) propagation of `inputValue` → `setSearchQuery` (URL + filter pipeline). Use `useEffect` with `setTimeout` / `clearTimeout`, or `useDeferredValue` + transition. Prefer explicit debounce for predictability.
- When `searchQuery` changes externally (Clear All, URL navigation), reconcile `inputValue` back to it.
- Wrap the URL/filter update in `startTransition` so React keeps the input responsive even if the debounced commit lands on a slow render.

**Verification**: typing/backspacing 10+ chars rapidly in the search box on Team Reviews / Manager Review / Skip Mgr / Audit / Management / HR PMS feels instant; list updates ≈250 ms after the last keystroke; URL `?q=` reflects the final value.

### Step B — Make Clear All / external resets flush immediately
- `clearAllFilters` in `EmployeeFilters` already calls `onSearchChange('')`. Update `EmployeeSelectorGrid` so the parent's "clear search" path also resets `inputValue` to `''` synchronously (no debounce wait).

**Verification**: clicking Clear All instantly empties the input and refreshes the list.

### Step C — Guardrail: ensure `EmployeeFilters` stays a "dumb" presentational input
- No internal debouncing inside `EmployeeFilters` — it just forwards `value`/`onChange`. Keeps the component reusable and avoids double-debounce.

**Verification**: file diff for `EmployeeFilters.tsx` is minimal (signature unchanged) or zero.

### Step D — Smoke test other search boxes that reuse the same pattern
- Audit dashboard (`audit` viewLevel) uses the same `EmployeeSelectorGrid`, so it is covered by Step A.
- Confirm no other reviewer surface (e.g. `BulkReviewDashboard`, `AllKpis`, `RollbackRequests`) regressed — those use independent inputs and are out of scope for this fix, but we note them for follow-up if the same pattern is seen.

**Verification**: visually walk Team / Manager / Skip / Audit / Management / HR PMS panels; confirm typing latency gone.

## 5. UI Changes
- **What changes visually**: only the responsiveness of the existing search input. No layout, label, placeholder, or position changes.
- **Location**: search box at the top of every reviewer dashboard (`EmployeeFilters` row).
- **Interaction impact**: characters appear instantly; filtered results catch up after ~250 ms. Backspace works without "stuck key" feel.
- **Responsiveness**: unchanged across breakpoints.

## 6. Tests
- Unit test for the new debounce hook / inline logic: typing N chars within debounce window results in 1 URL/filter commit with the final value; clearing flushes immediately.
- Manual regression matrix: each of Team, Manager (via team), Skip Mgr, Audit, Management, HR PMS panels — type "100360", backspace to empty, confirm list and URL converge correctly.

## 7. DOCUMENTATION.md / POLICY.md
- DOCUMENTATION.md: add a short note under the Reviewer Dashboard section that the search input is debounced (~250 ms) and URL-synced.
- POLICY.md: Not Applicable (no business rule change).

## 8. Rollback
- Single-component change confined to `EmployeeSelectorGrid.tsx` (and possibly a tiny helper). Revert by restoring direct `setSearchQuery` wiring.

## 9. Out of Scope
- Server-side search / pagination of rosters.
- Refactoring `useUrlFilterState` globally (other filters don't suffer because they change at human click rates, not keystroke rates).
- Search inputs on non-reviewer pages.

```text
Keystroke ──► inputValue (local, instant)
                  │  debounce 250 ms
                  ▼
           setSearchQuery ──► URL (?q=) + heavy filter pipeline
```
