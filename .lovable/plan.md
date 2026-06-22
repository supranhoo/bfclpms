# Performance, UX, Backend & Cost Optimization Audit

Measured on `/dashboard` (preview). Below is a structured audit + prioritized action plan. No code changes yet — approve to implement in waves.

## Assumptions

- **Stack**: React 18 + Vite 5 + TypeScript + Tailwind + shadcn/Radix; backend = Lovable Cloud (Supabase: Postgres + RLS + Edge Functions + Storage).
- **App type**: Multi-tenant enterprise SPA (PMS / Safety / Incentive / Annual Review modules). Authenticated, role-based (7 roles), large tables, heavy exports.
- **Heavy deps in bundle**: `recharts`, `xlsx`, `jspdf` + autotable, `embla-carousel`, `browser-image-compression`, full Radix suite, `lucide-react`.
- **Hosting**: Lovable Cloud managed instance (no custom infra to tune at OS level — cost levers = instance size, query/storage efficiency, edge function runtime).

## Measured Baseline (preview, `/dashboard`)

| Metric | Value | Verdict |
|---|---|---|
| TTFB | 772 ms | OK |
| FCP / First Paint | ~5.9 s | Poor |
| DOMContentLoaded | 5.76 s | Poor |
| CLS | 0.05 | OK (one card causes 0.048) |
| JS transferred | 1.2 MB across 128 scripts | Heavy |
| Largest scripts | lucide-react 156KB, chunk-T2SWDQEL 139KB, supabase-js 82KB | Splittable |
| Slow fetches | `profiles?select=*` 1115ms, `user_roles` 1111ms | Over-fetch + cold RLS |
| DOM | 615 nodes, 215 listeners | Fine |

Primary bottlenecks: (a) eager bundle (no route splitting, full lucide/Radix on first load), (b) auth-gate fetches block first render (`profiles select=*`), (c) one card causes CLS.

## Risk & Impact Report

- **Data**: No schema changes in Wave 1–2. Wave 3 adds indexes (additive, reversible).
- **Workflow**: No business-logic changes; RLS untouched.
- **UI/UX**: Lazy routes add brief Suspense fallbacks — mitigated with skeletons that match final layout (also fixes CLS).
- **Regression**: Code-splitting can break dynamic imports of shared singletons (supabase client). Mitigated by keeping `@/integrations/supabase/client` eager.
- **Rollback**: Each wave is a separate PR; revertable independently.
- **Scalability**: All changes reduce per-session bytes, DB rows fetched, and edge-fn runtime — directly lowers Cloud cost as user count grows.

## Prioritized Plan (Impact vs Effort)

```text
Impact  Effort  Wave  Item
HIGH    LOW     1     Narrow profiles/user_roles selects (kill select=*)
HIGH    LOW     1     Reserve heights on dashboard cards (kill CLS)
HIGH    MED     2     Route-level React.lazy + Suspense skeletons
HIGH    MED     2     Dynamic-import xlsx / jspdf / jspdf-autotable in export handlers
HIGH    MED     2     Manual chunks: react-vendor, radix, charts, exports, supabase
MED     LOW     2     TanStack Query staleTime for reference/master data (5–10 min)
MED     LOW     3     Virtualize large tables (>100 rows) with @tanstack/react-virtual
MED     MED     3     Add covering indexes for slow queries (after EXPLAIN ANALYZE)
MED     MED     3     Replace N+1 selects with single RPC where shown by slow_queries
LOW     LOW     4     lucide-react: enforce named imports + audit barrel re-exports
LOW     MED     4     Image pipeline: WebP/AVIF for static, browser-image-compression for uploads
LOW     MED     4     Edge functions: batch round-trips, cache reference reads
```

## Performance Optimization (Waves 1–2)

1. **Auth gate fetch** (`useAuth`/profile loader): replace `select=*` with `select=id,email,full_name,role,is_active,corporate_id` (only fields read in UI). Same for `user_roles`. Expected: ~1.1s → ~200ms each, unblocks first paint.
2. **Route splitting** in `src/App.tsx`: keep `/login` + shell eager; `React.lazy()` every page (Safety, Annual Review, Incentive, Reports, Admin). Add `<Suspense fallback={<PageSkeleton/>}>`.
3. **Heavy lib isolation**: move `xlsx`, `jspdf`, `jspdf-autotable` to dynamic imports inside export click handlers only.
4. **Manual chunks** in `vite.config.ts` `build.rollupOptions.output.manualChunks` → split `react`, `radix`, `recharts`, `xlsx+jspdf`, `supabase`.
5. **Query cache**: set `staleTime: 5 * 60_000` for master data (departments, designations, KRA categories, workflow templates, menu registry).

Target after Wave 1+2: FCP < 2.0 s, JS on dashboard < 500 KB, dashboard fetch waterfall < 600 ms.

## UI/UX Improvements

- **Fix CLS**: the dashboard card with 0.048 shift needs reserved `min-h` on its skeleton state.
- **Skeleton parity**: route-lazy fallbacks must match final layout dimensions (use existing `SafetySkeletonBlock` pattern project-wide).
- **Loading semantics**: replace generic spinners with content-shaped skeletons on tables/charts.
- **Suspense boundaries** at section level (header / sidebar / main) so the shell never blanks.
- **Tooltip latency**: use `delayDuration={300}` consistently to avoid flicker storms seen in the session replay.
- **Empty states**: every table should ship an empty state + retry action (consistency audit).

## Backend Efficiency

- Run `supabase--slow_queries` and `EXPLAIN ANALYZE` on top 10; add targeted indexes (covering `(user_id, period_id)` patterns common in `review_submissions`, `kpis`, `org_kpi_values`).
- Audit RPCs vs client-side joins — collapse N+1s into a single `rpc()` returning JSON.
- Enforce `.select("only,needed,cols")` everywhere; ban `select('*')` for hot tables via a lint check.
- Use `fetchAllPaged()` (already standard per memory) for any list > 1k rows; never load full sets.
- Edge functions: warm-path caching of reference tables; ensure auth verification once, not per call.
- Add `staleTime` + `select` projections in TanStack Query to cut re-renders.

## Cost Optimization (Lovable Cloud)

- **DB cost** drops directly with: narrower selects, fewer rows scanned (indexes), fewer realtime channels. Audit `useRealtimeKpiSync` — only enable on pages that need it.
- **Storage**: enforce `browser-image-compression` (already a dep) before upload; convert to WebP; set lifecycle on transient buckets (logs/temp evidence).
- **Edge fn runtime $$$**: batch DB calls, avoid per-row awaits, exit early on auth failure, cache idempotent reads in module scope.
- **Backups**: confirm backup engine (per memory) excludes only denylisted tables; oversized backups = wasted storage.
- **Instance sizing**: only after the above; if concurrency still bottlenecks, recommend Backend → Advanced settings → Upgrade instance.

## Code Quality & Refactoring

- Enforce **separation of concerns**: any business math still inside `.tsx` (e.g., score calculations) moves to `src/services/` or `src/lib/` with unit tests (project rule).
- **Lint rule**: forbid `import * as Icons from "lucide-react"` and `select('*')` on hot tables.
- **Type narrowing**: replace `any` in service layer with generated Supabase types.
- **Dead code sweep**: remove archived migration helpers and one-off scripts not referenced.
- **Test coverage**: each Wave ships with vitest unit tests for changed services + a perf assertion (bundle size budget via `rollup-plugin-visualizer` in CI).

## Deliverables per Wave (per workspace policy)

Each wave PR will include: before/after metrics, Risk & Impact note, unit tests + mock data, DOCUMENTATION.md + POLICY.md updates, rollback note.

## Ask Before Building

Please confirm:
1. Start with **Wave 1 only** (auth-fetch narrowing + CLS fix — lowest risk, fastest win)? Or approve **Wave 1+2** together?
2. Any modules to exclude from route-splitting (e.g., a page you want kept eager)?
3. OK to add `rollup-plugin-visualizer` as a devDependency for bundle budgets?
