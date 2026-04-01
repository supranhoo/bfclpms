

## Plan: Real-Time Dashboard Updates When Admin Changes KPI Data

### Problem
Currently, when an admin edits a KPI (score, target, weightage, status, etc.), other users viewing dashboards or scorecards must manually refresh to see changes. The system already uses `invalidateQueries` for the admin's own session, but other browser sessions (employees, managers) don't receive updates.

### Current State
- Realtime subscriptions exist only for: `notifications`, `import_progress`, `kpi_rollback_requests`
- The `kpis` and `review_submissions` tables (the two core tables) have no realtime enabled
- All data refresh relies on React Query's `invalidateQueries` — which only works in the same browser session that triggered the mutation

### Approach
Enable Postgres realtime on the core tables and create a single shared hook that listens for changes and invalidates the relevant React Query caches across all active sessions.

### Changes

**1. SQL Migration — Enable realtime for core tables**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.kpis;
ALTER PUBLICATION supabase_realtime ADD TABLE public.review_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.org_kpi_values;
```
These three tables cover: KPI structure/status changes, score/rating updates, and org-level KPI values.

**2. Create `src/hooks/useRealtimeKpiSync.ts`**
A single hook that:
- Subscribes to `postgres_changes` on `kpis`, `review_submissions`, and `org_kpi_values` tables
- On any `INSERT`, `UPDATE`, or `DELETE` event, invalidates the relevant React Query keys:
  - `kpis`, `my-kpis`, `all-kpis`, `kpis-by-period`, `admin-kpis`
  - `review-submissions`, `review-submission-admin`
  - `org-kpi-values`, `org-kpi-value`
  - `kpi-timeline`, `kpi-journey-audit-logs`
- Uses a small debounce (500ms) to batch rapid admin bulk updates into a single refetch cycle
- Cleans up channel subscription on unmount

**3. Mount the hook in `src/App.tsx` (or top-level layout)**
- Call `useRealtimeKpiSync()` once at the app root so every page benefits automatically
- No changes needed to individual pages or components

**4. `DOCUMENTATION.md`** — v2.15.53

### Files Modified

| File | Change |
|------|--------|
| SQL migration | Enable realtime on `kpis`, `review_submissions`, `org_kpi_values` |
| `src/hooks/useRealtimeKpiSync.ts` | New hook: subscribe to changes, debounced query invalidation |
| `src/App.tsx` | Mount `useRealtimeKpiSync()` |
| `DOCUMENTATION.md` | v2.15.53 |

### Risk Assessment
- **Performance**: Debounce prevents refetch storms during bulk operations. Only query keys are invalidated (no forced refetch if component is unmounted)
- **Data**: Read-only listener — no write operations; existing RLS policies fully apply
- **Regression**: Zero impact on existing mutation flows — this is purely additive
- **Bandwidth**: Realtime on these tables adds minimal overhead since changes are infrequent (admin actions, not high-frequency writes)

