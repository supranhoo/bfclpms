

## Pagination for Reviewer Dashboards (>2500 employees)

### Current behavior (confirmed by code reading)

`EmployeeSelectorGrid.tsx` fetches and renders **all** matching employees in a single pass for every panel (Team, HR PMS, Audit, Management, Pending*). Specifically:

- `useProfiles()` / `useProfilesByWorkflowStage()` return the full set (1000+ rows, batched via `fetchAllPaged`).
- `useBulkEmployeeWorkflows(allEmployeeIds)` resolves workflow stages for **every** employee in one shot.
- `useEmployeeScoresForPeriod(allEmployeeIds, ...)` fetches scores for all of them.
- `useKpisByPeriodRanges(...)` pulls KPI rows used to compute per-card "pending/audit/forwarded" counts.
- The grid then renders N `EmployeeCard` components — each subscribing to derived data via `useMemo`/selectors.

For a company with >2500 employees, on Audit/HR PMS panels the grid can render 1500+ cards, each running its own per-card calculation. This causes:
- Long initial JS task (hydration of N cards, layout)
- Heavy memory (Bulk workflows + scores + KPI maps for everyone)
- Slow filter/search responsiveness (every keystroke re-filters thousands)
- Network: KPI ranges fetched cover all employee IDs

### Why pagination is the right fix

- The user only ever **looks at** ~10–30 cards at a time (after sort/filter).
- The expensive per-card computations (workflow resolution, score lookup, KPI counts) only matter for **visible** cards.
- Search/sort already happens in-memory — we can keep that, but only mount cards for the current page.

### Proposed approach — Client-side pagination with windowed enrichment

Three layers, smallest blast radius first:

**Layer 1 — Render-only pagination (primary fix)**
Keep the existing data fetching (so search/filter/sort still operate on the full set), but only render `pageSize` cards at a time. Use the existing `Pagination` component (`src/components/ui/pagination.tsx`).

- Default `pageSize = 24` (4 cols × 6 rows on desktop; user-configurable: 12 / 24 / 48 / 96).
- Reset page to 1 on filter/search/sort change.
- Preserve current page in URL (`?page=2`) so refresh and deep-link work — aligns with `mem://features/review/dashboard-view-persistence`.
- "Showing 25–48 of 1,547" footer.

**Layer 2 — Defer heavy per-card enrichment to visible page**
Currently `useBulkEmployeeWorkflows(allEmployeeIds)` and `useEmployeeScoresForPeriod(allEmployeeIds, ...)` run for ALL ids. After Layer 1, change them to receive only the **current page's ids** (`pagedEmployeeIds`).

- Keeps card rendering fast and queries small.
- The grid-card "pending KPI count" badges (which need org-wide KPI data) stay computed from the already-fetched `periodKpis` (no extra fetch) — only the per-card workflow/score lookups shrink.
- Risk: "global" stats shown above the grid (e.g., total pending across all employees) must stay computed from the full set, not the page. We'll keep counts/aggregates on the full filtered set and only window the rendering + heavy per-card hooks.

**Layer 3 — Keep urgency sort intact**
Per `mem://features/review/reviewer-grid-progress-and-prioritization`, urgency sort runs across the full filtered set. After sorting, we slice the page — so the most urgent employees still appear on page 1. No change to sort logic.

### Files Touched

| File | Change |
|---|---|
| `src/components/review/EmployeeSelectorGrid.tsx` | Add `page` + `pageSize` state; slice `sortedMembers` → `pagedMembers`; render Pagination footer; pass paged ids to bulk hooks |
| `src/hooks/useBulkEmployeeWorkflows.ts` (or call site) | Confirm safe to pass smaller id set; no signature change needed |
| `src/hooks/useEmployeeScoresForPeriod.ts` (or call site) | Same — accept paged ids |
| `src/components/ui/pagination.tsx` | Reused as-is |
| `DOCUMENTATION.md` | Version History entry (v2.64.2 — Reviewer grid pagination) |
| `mem://infrastructure/resource-and-performance-optimization` | Append note: reviewer grids use 24-card pagination + windowed enrichment |

No DB / RLS / workflow changes. No edge function changes.

### Risk & Impact

| Area | Impact |
|---|---|
| Data | None — same queries, smaller id arrays for two of them |
| Workflow | None |
| UI | Reviewer grids show 24 cards/page with pager + page-size selector + "Showing X–Y of Z" |
| Search/Sort/Filter | Unchanged — still operate on full filtered set; resets to page 1 |
| Aggregates (top counts) | Unchanged — computed from full filtered set, not page |
| Regression | Low. Main risks: (a) page not resetting on filter change → mitigated by `useEffect`; (b) per-card hooks racing on rapid pagination → mitigated by `keepPreviousData` already added in v2.64.1 |
| Mitigation | Test: Team / HR PMS / Audit / Management / Pending* panels; search; sort by urgency; filter by department; deep-link `?page=3`; viewport <768px (cards stack, pager wraps) |

### Out of Scope
- Server-side pagination (would require restructuring queries; current client-side approach handles 2500–10000 rows fine once render is windowed).
- Virtualization (`react-window`) — unnecessary at 24 cards/page; can revisit if user wants 96+ per page.
- Pagination on non-reviewer pages (Reports, Admin lists) — separate request.
- Saving page-size preference to user profile (URL only, per existing dashboard-view-persistence pattern).

