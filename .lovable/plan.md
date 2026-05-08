# Optimize `/admin/kpi-standardization`

## Problem (RCA)

The page glitches because every tab renders **the entire result set at once** with no pagination and no input debouncing — directly violating POLICY §120 Lean-Load.

| Tab | Symptom | Root cause |
|---|---|---|
| Build Registry | Freezes after Scan; typing in search lags | `visibleGroups.map(...)` renders **every** duplicate group (often 200–500+), each group expands into N variant buttons + Select + Collapsible. `search` is undebounced. |
| Review Registry | Slow to open; sluggish search | `filtered.map(...)` renders **all** `kpi_definitions` rows (1k+ today). No debounce. Each row mounts hover/Collapsible state. |
| Correct May KPIs | Glitchy & long initial paint | Maps **every** unlinked signature; each row mounts a `Select` whose `SelectContent` renders **every** definition for that category. |
| Suggestions | Slow load | Renders all merge + alias candidate rows; no paging. |
| Health & Coverage | Heavy first paint | Wide tables fully rendered. |
| Tabs container | Mounts unused tabs in dev tools profiler under some Radix versions | Use `forceMount={false}` (default) is fine, but heavy data hooks fire only when each tab mounts — ensure tabs are lazy. |

## Goal

Make the page snappy regardless of registry size, with consistent pagination & debounced search across tabs. **No business-logic, schema, RLS, or RPC changes.**

## Plan (UI-only)

### 1. Reusable client-side pagination helper

Add `src/components/admin/kpi-standardization/RegistryPager.tsx`:
- Props: `page`, `pageSize`, `total`, `onPageChange`, `onPageSizeChange`, options `[25, 50, 100]` (default 25).
- Renders Prev / Next + `page X of Y` + page-size selector. Mirrors the look of `AffectedKpisTable`'s pager and `useManualQuery` conventions.

### 2. Debounce all search inputs

Use existing `useDebouncedValue(value, 300)` (already sanctioned by POLICY §120) in:
- `BuildRegistryTab.tsx` — `search` → `debouncedSearch` feeds `filteredGroups` `useMemo`.
- `ReviewRegistryTab.tsx` — `search` → `debouncedSearch` feeds `filtered` `useMemo`.
- `CorrectMayKpisTab.tsx` — add a search box (KRA / KPI text) with debounce.
- `SuggestionsTab.tsx` — debounce its current filter input if present.

### 3. Paginate heavy lists

For each tab, wrap the existing filtered array with a `useMemo` slice `[from, from+pageSize]` and render only that slice. State lives in each tab.

- **BuildRegistryTab**: paginate `visibleGroups` (default 10 / page — groups are large). Reset to page 1 when `debouncedSearch`, `sensitivity`, or `includeSkipped` changes. Keep `processedGroups` behavior.
- **ReviewRegistryTab**: paginate `filtered` (default 25). Reset to page 1 on search change. Collapse `expandedId` only when its row leaves the page.
- **CorrectMayKpisTab**: paginate `pendingUnlinked` (default 25). Replace fixed-height `max-h-[500px] overflow-y-auto` with paged slice. Memoize the `definitions.filter(d => d.category_id === sig.category_id)` per category once at tab-level into a `Map<categoryId, KpiDefinition[]>` so each row's `Select` does not re-filter the full list.
- **SuggestionsTab**: paginate `defMerges` and `aliasCandidates` independently (default 25 each).

### 4. Lighter rendering

- Wrap each row component (`RegistryRow`, the per-group card in BuildRegistry, the per-signature row in CorrectMayKpis) in `React.memo` so unchanged rows do not re-render when sibling rows or unrelated state change.
- In `BuildRegistryTab`, hoist the per-group `sharedBucketOptions` calc (already memoizable) and stop recomputing on every render of every other group via `React.memo`.
- In `CorrectMayKpisTab`, build the category→definitions map once per `definitions` change.

### 5. Sane defaults & UX

- Page size selector with `25 / 50 / 100`, persisted to that tab's local state only (not URL — keeps scope tight).
- When the user filters/searches, the pager resets to page 1.
- Show the existing total badge ("X pending / Y skipped / Z total") above the pager so context is preserved.

## Out of scope

- No changes to `useScanDuplicates`, `useKpiDefinitions`, `useKpiAliases`, RPCs, or DB. Today these return acceptable payloads; the bottleneck is render volume, not network.
- No virtualization library (deferred — pagination delivers the win without adding a dep).
- No changes to Governance / Health & Coverage / History tabs unless their lists exceed 100 rows; if they do, apply the same RegistryPager.

## Risk & Impact

- **Data**: none. UI-only.
- **Workflow**: none. Approve / Skip / Apply / Merge / Dismiss flows unchanged.
- **UI/UX**: search now feels snappier (300 ms debounce); long lists become paged. Familiar Prev/Next pattern (matches `AffectedKpisTable`).
- **Regression**: low. `processedGroups`, `expandedId`, `mappings`, `corrected` state semantics preserved — pagination only narrows the *displayed* slice.
- **Mitigation**:
  - Vitest for the pager helper (page math, clamping, page-1 reset on filter change).
  - Vitest for the category→definitions index map in CorrectMayKpisTab.
  - Manual smoke: scan with 200+ groups, switch sensitivity, toggle Include skipped, search.

## Files

New:
- `src/components/admin/kpi-standardization/RegistryPager.tsx`
- `src/test/registryPager.test.tsx`

Edited:
- `src/components/admin/kpi-standardization/BuildRegistryTab.tsx`
- `src/components/admin/kpi-standardization/ReviewRegistryTab.tsx`
- `src/components/admin/kpi-standardization/CorrectMayKpisTab.tsx`
- `src/components/admin/kpi-standardization/SuggestionsTab.tsx`

Docs:
- `mem/architecture/performance/lean-load-policy` — append KPI Standardization tabs to the compliant debounced/paged sites list.
- `DOCUMENTATION.md` Version History + brief note under Admin → KPI Standardization.
