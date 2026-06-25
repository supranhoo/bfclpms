## Investigation: "Incentive data entry disappears after refresh"

### Verification — is the issue real?

**Yes — partially.** Database evidence:
- `production_daily_entries`: 3,151 rows, **most recent write `2026-06-19`** (6 days ago).
- `vessel_monthly_entries`: 6 rows, most recent `2026-05-19`.
- `production_targets`: **0 rows**.
- `employee_incentive_eligibility`: 2 rows, most recent `2026-05-19`.

Sandeep Kumar (`200291`) and Upendra Singh (`201091`) **do** have the `admin-incentive-data` menu override, so RLS allows their writes. There is no DB-level block — yet nothing they have entered this week has landed. That confirms the user complaint: the UI is silently losing typed values before Save reaches the server.

### Root cause (RCA)

`src/components/incentive/ProductionDailyGrid.tsx` (and `VesselDataEntryGrid.tsx`, same pattern) seeds editable state from DB inside a `useEffect` that re-runs far too often:

```ts
// ProductionDailyGrid.tsx lines 212–220
useEffect(() => {
  const entryMap = new Map(entries.map(e => [e.employee_id, e.daily_values || {}]));
  const init = {};
  gridEmployees.forEach(emp => { init[emp.id] = entryMap.get(emp.id) || {}; });
  setLocalData(init);                       // ← overwrites in-progress typing
}, [gridEmployees, entries]);
```

Two reference-instability sources cause this effect to fire on **every render**, wiping unsaved cells:

1. **`filterByCompany` from `useCompanyFilter` is recreated each render** (plain arrow function, not memoised) and `companies: companies ?? []` returns a new array literal each render too (`src/hooks/useCompanyFilter.ts` lines 92, 118). The parent `UnifiedProductionDataTab` passes this fresh `filterByCompany` down on every render → `gridEmployees` `useMemo` invalidates → new array reference → seed effect fires → `localData` reset.
2. **React Query default `refetchOnWindowFocus: true`** on `production-daily-entries`, `mapped-employees-for-grid`, and `incentive-production-rates`. Any tab/window switch triggers a refetch; when `entries` returns a new reference the same seed effect fires and overwrites unsaved typing with the stale DB snapshot.

Net effect: user types into a cell → clicks anywhere that triggers a parent re-render (search box, company dropdown, page-size, tab focus) → seed effect fires → typed value vanishes. The user perceives this as "data disappears after refresh" because to a non-technical user, the screen "refreshing" itself looks identical to a manual reload.

The Save handler itself is correct — but it only saves what is currently in `localData`. If the seed effect wiped cells before Save was clicked, Save will faithfully persist zeros / empty maps. This also explains the database evidence (no writes despite reported activity).

### Risk & Impact Report

| Dimension | Assessment |
|---|---|
| Data | No data corruption; no historic rows altered. Risk: existing rows could be over-written with empty `daily_values` if a user clicks Save while `localData` is mid-reset. |
| Workflow | Affects every Incentive Data Entry user on the Production Daily, Vessel, and (by inspection) Eligibility/Target tabs. |
| UI/UX | Pure state-management fix; no visual change. |
| Regression | Low — change is scoped to the seed effect + memoising the company hook. Existing Save flow and RLS untouched. |
| Scalability | Improves render performance (fewer wasted effect runs across 1,000+ employee rows). |
| Rollback | Trivial — revert the two files. |

### Corrective Actions

1. **`src/hooks/useCompanyFilter.ts`** — stabilise the public surface:
   - Wrap `filterByCompany`, `getCompanyName`, `getCompanyCode`, `getCompanyCodeByEmpCode` in `useCallback`.
   - Memoise the `companies ?? []` fallback so the array reference is stable when data is unchanged.

2. **`src/components/incentive/ProductionDailyGrid.tsx`** — make the seed effect idempotent and dirty-aware:
   - Replace the `[gridEmployees, entries]` dep list with a **content key** (`programId|month|year|entries.length|entries-updated-at-max`) so the effect only re-seeds when the *server snapshot* actually changes, not when `gridEmployees` gets a new reference.
   - Track a `dirtyCells: Set<string>` (key = `empId:day`). When seeding from DB, preserve any cell present in `dirtyCells`. Clear `dirtyCells` on successful Save.
   - Disable `refetchOnWindowFocus` on the `production-daily-entries`, `mapped-employees-for-grid`, and local `incentive-production-rates` queries used by the grid (or guard the refetch with `if (dirtyCells.size === 0)`).
   - Add a `beforeunload` warning when `dirtyCells.size > 0` so a real page refresh prompts "You have unsaved entries" instead of silently losing them.

3. **`src/components/incentive/VesselDataEntryGrid.tsx`** — same three changes (content-keyed seed, dirty-cell preservation, unsaved-changes guard).

4. **`useBulkUpsertDailyEntries` / vessel equivalent** — on success, do **not** blanket-invalidate; instead `setQueryData` with the just-saved rows so the seed effect sees identical content and skips the reset. Keeps Save fast and removes the "everything blinks after Save" feeling.

5. **Tests** (Vitest + RTL):
   - `ProductionDailyGrid.test.tsx`: typing into a cell then triggering a parent re-render (company filter change, window focus) **must preserve** the typed value.
   - `useCompanyFilter.test.ts`: assert returned `filterByCompany` keeps stable reference across renders when inputs don't change.
   - `useBulkUpsertDailyEntries.test.ts`: assert success path writes through `setQueryData` and that subsequent refetch returns identical content (no reset).
   - Regression mock: Sandeep-like profile with `admin-incentive-data` override saves a 30-day row end-to-end.

6. **SSOT updates** (mandatory, same commit):
   - `DOCUMENTATION.md` → "Incentive → Data Entry Grids" section: document the dirty-cell preservation contract and the `refetchOnWindowFocus: false` rule for editable grids.
   - `POLICY.md` → "Operational Resilience" section: new rule — *editable grids must never overwrite user input with a server refetch; reseed only when the server snapshot's content key changes*.

7. **Operational note for Sandeep / Upendra** (post-deploy): ask them to re-enter the days that were "lost" between `2026-06-19` and today; nothing was silently committed in the interim — DB is empty for that window — so there is no clean-up migration needed.

### Out of scope

- No schema, RLS, or backup changes.
- No edit to the Eligibility tab unless QA repros the same symptom there; current evidence (only 2 rows ever) suggests low activity rather than active loss, so it stays untouched in this fix.

### Verification checklist after build

- [ ] Vitest suite green (new + existing).
- [ ] Manual: type values, switch company filter, switch tab, blur/focus window → cells retain values.
- [ ] Manual: Save → DB row appears with correct `daily_values`; subsequent reload shows the same numbers.
- [ ] Manual: reload page with unsaved cells → browser shows "unsaved changes" prompt.
