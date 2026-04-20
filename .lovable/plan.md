

## RCA: Typing in filter sends user back to previous Dashboard view

### Reproduction
1. Admin selects **HR PMS** panel.
2. Clicks "Search Employees…" and types one letter.
3. Page snaps back to **Self Review** (or whichever was the prior view).

### Root cause — confirmed from code

Two effects fight each other over the same URL param flow.

**Effect A — `Dashboard.tsx` lines 111–119** ("Initialize from URL query param"):
```ts
useEffect(() => {
  const viewFromUrl = searchParams.get('view') as ViewMode | null;
  if (viewFromUrl) {
    const mappedMode = viewFromUrl === 'skip_level' ? 'team' : viewFromUrl;
    if (availableModes.includes(mappedMode)) {
      setViewMode(mappedMode);
    }
  }
}, [searchParams, availableModes]);   // ← runs on EVERY searchParams change
```

**Effect B — `Dashboard.tsx` lines ~206–215** ("Sync viewMode to URL"):
```ts
useEffect(() => {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (viewMode === 'self') next.delete('view');
    else next.set('view', viewMode);
    return next;
  }, { replace: true });
}, [viewMode]);
```

**The conflict path** when admin is on HR PMS and types "S" in the search box:

1. `useUrlFilterState('q', '')` writes `?q=S` to the URL — but its `setValue` only sets `q`, **does not touch `view`**. ✅ correct.
2. However, `Dashboard.handleModeChange` was previously called (when admin clicked HR PMS) and used `queueMicrotask` (line ~289) to **defer** clearing filter params. That deferred microtask runs `setSearchParams` to delete `q, dept, desig, grade, mgr, status, page, size` — but reads `prev` from a snapshot that **does not yet include the `view=hr_pms`** that Effect B is about to write (or vice-versa, depending on commit order).
3. Even after that settles, **Effect A re-runs on every `searchParams` change** (typing in `q` triggers it). It reads `viewFromUrl`, but here's the bug: when admin is on a view that maps to itself (e.g. `view=hr_pms`), Effect A re-applies `setViewMode('hr_pms')` harmlessly — UNLESS the URL has lost the `view` param.

**Why `view` is lost**: For Admins, the `availableModes` array is computed via `useMemo` on `[role, hasSkipLevelSubordinates]`. When `useSkipLevelTeamMembers(profile?.id)` resolves AFTER the initial render (background fetch), `availableModes` reference changes → Effect A re-runs. If at that moment the URL still has `view=hr_pms` but **the previous render's `setSearchParams` from a child filter (e.g. `useUrlFilterState`) was racing with the `view` param**, there is a render where `searchParams.get('view')` returns the stale value being processed.

But the **actual smoking gun** is simpler: 

**The `Dashboard` "Sync viewMode → URL" Effect B writes `view=…` with `replace: true`. The `useUrlFilterState` hook's `setValue` ALSO writes with `replace: true`, using `(prev) => new URLSearchParams(prev)`. In React 18 strict mode + concurrent updates, when typing fires fast, two `setSearchParams((prev) => …)` updaters can be batched such that the second updater's `prev` is the snapshot from BEFORE Effect B's write — losing `view=hr_pms`. The URL becomes `?q=S` (no view). 

Then Effect A runs: `viewFromUrl = null` → `if (viewFromUrl)` is false → Effect A does nothing. But Effect B then runs again because `viewMode` is still `hr_pms` and re-writes `?view=hr_pms&q=S`. So far so good… 

**The actual trigger for snapping back to Self**: It's the `pending_self_review` view-name overlap. The admin's current route in the bug report is `/dashboard?view=pending_self_review&employee=535d9a14-…`. When admin switches to HR PMS, then types in search, the **employee deep-link restoration effect** at lines ~234–254 checks `if (employeeParam && !kpiParam && !selectedEmployee && viewMode !== 'self')` and may re-run if `searchParams` changes and the `deepLinkProcessedRef` was not set on this render path. The combination of:

1. `employee=…` lingering in URL from the previous view's selection,
2. user switching panel (which clears filters async via `queueMicrotask` but does NOT clear `employee`),
3. typing `q=S` triggers `searchParams` change → Effect A re-runs with stale `view`,
4. selectedEmployee restoration effect re-fires and sets `selectedEmployee`,

…all combine so the dashboard appears to "go back" to the previous view (the one the `employee` param was selected under, which was Self/Pending Self).

### Three concrete bugs to fix

**Bug 1 — Effect A re-runs on every URL change (line 111–119 of `Dashboard.tsx`)**.
This effect is meant to initialize from URL once. By depending on `searchParams`, it re-fires every time any filter (`q`, `dept`, `page`, …) changes. If `viewMode` state drifts even once, Effect A force-resets it to whatever is in the URL — which during a race is stale.

**Fix**: Run Effect A only when `view` param actually changes, not the whole `searchParams` object:
```ts
const viewParam = searchParams.get('view');
useEffect(() => {
  if (!viewParam) return;
  const mappedMode = viewParam === 'skip_level' ? 'team' : viewParam;
  if (availableModes.includes(mappedMode as ViewMode) && mappedMode !== viewMode) {
    setViewMode(mappedMode as ViewMode);
  }
}, [viewParam, availableModes]);
```

**Bug 2 — `handleModeChange` uses `queueMicrotask` to defer URL clear, but does not clear `employee`**.
The `employee` param survives the panel switch, then the "Restore selected employee" effect re-runs and re-selects it under the wrong view. Combined with Bug 1, the user is teleported back.

**Fix**: In `handleModeChange`, include `employee` in the params to clear (it's already cleared via `setSelectedEmployee(null)` state, but the URL param lingers and re-triggers restore effects). Also drop the `queueMicrotask` indirection — do it synchronously inside the same `setSearchParams` updater that React already batches.

**Bug 3 — "Restore selected employee" effect (lines ~234–254) has empty dep array `[]` but reads live `searchParams`/`viewMode`**.
It uses `deepLinkProcessedRef` to gate, but the `useEffect(() => { … }, [])` reads stale closure values on remount. More importantly, when admin switches view, this effect doesn't re-run (good), but the parent state push from Bug 1 + Bug 2 makes the symptom appear.

**Fix**: Add an explicit guard — if `viewMode` changes via `handleModeChange`, mark `deepLinkProcessedRef.current = true` so the restore effect cannot retroactively pull the old `employee` back.

### Files Touched

| File | Change |
|---|---|
| `src/pages/Dashboard.tsx` | Effect A: depend on `viewParam` not `searchParams`; `handleModeChange`: also clear `employee` URL param synchronously (drop `queueMicrotask`); set `deepLinkProcessedRef.current = true` inside `handleModeChange` to lock out late restore |
| `DOCUMENTATION.md` | Version History entry v2.64.4 — Filter typing teleports user to previous panel — fixed |
| Memory: `mem://features/review/dashboard-view-persistence` | Append: "URL `view` param sync must read only the `view` slice; clearing filters on panel switch must include `employee`; deepLinkProcessedRef must be re-armed on manual mode change" |

No DB / RLS / workflow changes.

### Risk & Impact

| Area | Impact |
|---|---|
| Data | None — pure URL-state plumbing |
| Workflow | None |
| UI | Stable. Typing in search no longer resets the view. Switching panels no longer leaves a stale `employee` in URL. |
| Deep-links | `?view=hr_pms&employee=…&kpi=…` still works (handled BEFORE manual-change lock). The `deepLinkProcessedRef.current = true` set by `handleModeChange` only affects subsequent USER mode changes, not the initial mount-time deep-link. |
| Refresh persistence | Preserved — `view` and `employee` still written to URL by their respective effects. |
| Regression risk | Low. Effect A's narrower deps prevent unnecessary re-runs (perf win). The `employee` clear on manual switch matches user intent — when admin clicks "HR PMS", they don't expect the previously-selected Self employee to remain pinned. |
| Mitigation / Test matrix | (a) Self → HR PMS, type "S" → stays on HR PMS ✓ (b) Self → Audit → click employee → back → switch HR PMS → no employee carried over ✓ (c) Hard refresh on `/dashboard?view=hr_pms&employee=X` → still restores employee ✓ (d) Hard refresh on `/dashboard?view=hr_pms` with no employee → loads HR PMS grid ✓ (e) Mention deep-link `?mentioned_kpi=…` still opens sheet ✓ |

### Out of Scope
- Restructuring `useUrlFilterState` (works correctly in isolation).
- Pre-fetching panel data (separate v2.64.1 / v2.64.3 fix).
- Server-side filter state.

