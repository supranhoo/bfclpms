

## Plan — KPI Scorecard Detail: Fix Data Fetch + Add "Click to Load" Pattern (v2.65.2)

### Root Cause Analysis

**Issue A — "0 KPIs" sometimes shown despite data existing**
The query for March 2026 (1,758 KPIs) does fetch correctly from the `kpis` table. However, two silent 1,000-row caps elsewhere can cause rows to be dropped during the join/enrichment phase:

1. **`useCompanyFilter` hook** fetches all `profiles` without paging (line 33-36) — capped at 1,000 of 2,536 rows. This breaks `filterByCompany`, `getCompanyName`, and `getCompanyCode` for ~60% of employees. When "All Companies" is selected, filtering passes (returns `true`), but company labels in the export are blank for many rows.
2. **`KpiScorecardDetail`'s own profiles fetch** (line 136-138) also has no paging — same 1,000-row cap. Result: any KPI whose `employee_id` belongs to a profile beyond row 1,000 renders with blank Code/Name/Designation/Department, and gets filtered out by the Department filter and search.

**Issue B — Auto-load consumes CPU**
Every filter change (Month, Year, Company, Department, Search) triggers a full re-fetch + re-render, even before the user finishes choosing filters. With 1,758 rows × 6 stages of joins, this is expensive. Same pattern exists across most report dashboards.

### Fix Plan

#### Fix 1 — Repair the silent profile cap (high-impact, fixes data)
Replace direct `.select('...')` profile fetches with the existing `fetchAllPaged` helper (already used in `useKpiFilters.ts`).

| File | Change |
|---|---|
| `src/hooks/useCompanyFilter.ts` | Wrap `profiles`, `departments`, `business_units`, `divisions` fetches in `fetchAllPaged`. Profiles is the critical one (2,536 rows). |
| `src/pages/reports/KpiScorecardDetail.tsx` | Wrap the `profiles` fetch (line 136) in `fetchAllPaged`. Also wrap `org_kpi_data_owners` fetch (line 144) defensively. |

Result: every employee resolves correctly; "0 KPIs" disappears; export columns populate correctly.

#### Fix 2 — Add "Click to Load" / "Apply Filters" pattern
Restructure the page so heavy data fetching happens only when the user explicitly clicks a button:

- New state: `appliedFilters` (Month, Year, Company, Department) separate from the controlled inputs.
- `useQuery` keys off `appliedFilters` only; `enabled: !!appliedFilters`.
- Initial state: `appliedFilters = null` → empty table with a clear call-to-action banner: *"Select your filters and click 'Load Data' to view the scorecard."*
- "Apply Filters / Load Data" button next to the filter row. Disabled when filters haven't changed since last load. Shows a "filters changed — click to refresh" hint.
- Search box stays client-side (cheap, operates on already-loaded data) — no re-fetch.
- Sort + pagination stay client-side (cheap).
- An "Auto-load on first visit (current month)" optional toggle, OFF by default to honor the CPU concern.

```text
┌─ Filters ────────────────────────────────────────────────────────┐
│  Month [▼]  Year [▼]  Company [▼]  Department [▼]               │
│  [🔄 Load Data]  ← primary CTA, disabled until filters change   │
│  Search [_____] (filters loaded data only — no re-fetch)         │
└──────────────────────────────────────────────────────────────────┘
```

#### Fix 3 — Performance polish
- Add `staleTime: 5min` (already present) + `gcTime: 10min` so re-clicks within window are instant.
- Add `placeholderData: keepPrevious` (already present) so old data stays visible while new data loads.
- Show row count + last-loaded timestamp ("Loaded 1,758 KPIs at 14:35").
- Wrap the `filtered` and `paged` `useMemo` dependencies as-is (already correct).

### Files Touched

| File | Change |
|---|---|
| `src/hooks/useCompanyFilter.ts` | Use `fetchAllPaged` for profiles + supporting org tables. |
| `src/pages/reports/KpiScorecardDetail.tsx` | Use `fetchAllPaged` for profiles & org owners; restructure to "click-to-load"; add Apply button + dirty-state indicator + last-loaded timestamp. |
| `DOCUMENTATION.md` | v2.65.2 — Scorecard Detail data-fetch fix + click-to-load pattern. |
| `mem://infrastructure/resource-and-performance-optimization` | Append: "Reports must use `fetchAllPaged` for profiles to bypass the 1,000-row cap; heavy report dashboards adopt explicit 'Load Data' CTA over auto-fetch on filter change." |

### Risk & Impact

| Area | Impact |
|---|---|
| Data | Positive — fixes silent row-cap data loss across all reports using `useCompanyFilter`. |
| Workflow | None. |
| RLS | Unchanged (admin already has full read access on `kpis`). |
| UX | Slightly more interactive (extra click) but predictable load times and clear data-state feedback. Banner explains the new pattern. |
| Performance | Significant CPU savings: a user adjusting Month → Year → Department now triggers 1 fetch instead of 3. With `placeholderData`, the table doesn't re-mount during refetch. |
| Regression | Low. Filter logic is the same; only the trigger moves from auto to manual. |
| Test matrix | (a) Fresh page → empty table + "Click Load Data" prompt. (b) Click Load with default filters → 1,758 rows for March 2026 (matches DB). (c) Change Department → button highlights "filters changed". (d) Click Load again → re-fetch + new count. (e) Search box filters loaded rows instantly without re-fetch. (f) Export → all employee codes/names populated (no blanks from profile cap). (g) Other reports using `useCompanyFilter` (Performance Report, KPI Matrix, etc.) get correct company labels on rows beyond profile #1000. |

### Future Rollout (separate, out-of-scope here)
The same "click-to-load" + `fetchAllPaged` pattern should be applied to: Performance Report, KPI Employee Matrix, TNI Report, Incentive Report. Listed as follow-up; not changed in this iteration to keep the diff small and reviewable.

### Out of Scope
- Server-side aggregation/cursor pagination of the `kpis` query (current batched fetch with `fetchAllPaged` is acceptable for ~2K rows).
- Persisting last-applied filters across sessions.
- Touching auditor / management dashboards.

