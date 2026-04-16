

## Fix: Blank Page on Published Site After Perf Optimization

### Root Cause

The `manualChunks` config in `vite.config.ts` (added in v2.64.0) splits node_modules into 8 separate vendor chunks. In production builds, this causes one of two failure modes:

1. **Circular import / TDZ error** — When `ui-vendor` (Radix), `data-vendor` (Supabase, React Query), and `react-vendor` are loaded in the wrong order, modules that reference React at module-init time hit `Cannot access 'X' before initialization` and the entire app crashes silently. The HTML loads but React never mounts → **blank page**.
2. **`react/jsx-runtime` split from react** — The `manualChunks` rule `id.includes("/react/")` accidentally pulls `react/jsx-runtime` and `react-is` into different chunks, breaking JSX rendering.

The dev preview uses Vite's dev server (no chunking) so it works; only the **production build** on `pms.bfclalloys.com` is broken.

### The Fix

**Simplify `vite.config.ts` `manualChunks` to a safe, minimal split:**

Keep ONLY the truly heavy on-demand libs as separate chunks (xlsx, jspdf, html2canvas, recharts). Let Vite/Rollup handle React + Radix + everything else automatically — its default heuristics are battle-tested and avoid TDZ issues.

```text
xlsx-vendor       → xlsx only
jspdf-vendor      → jspdf, jspdf-autotable
html2canvas-vendor→ html2canvas
charts-vendor     → recharts, d3-*
(everything else) → Rollup default (one or two chunks, safe order)
```

This still removes ~1.4 MB of export libs from the initial bundle (the original goal) but eliminates the React/Radix/Router split that's crashing the app.

**Files Touched**

| File | Change |
|------|--------|
| `vite.config.ts` | Replace 8-chunk split with 4-chunk safe split (heavy export libs only) |
| `DOCUMENTATION.md`, `POLICY.md` | Version bump v2.64.1 — hotfix note |

### Risk Assessment
- **Data impact**: None
- **Regression risk**: None — reverts to safer chunking; export-lib chunks remain split (still big perf win)
- **Mitigation**: After deploy, verify `/auth` loads on published site

### Expected Outcome
- `/auth` renders normally on `pms.bfclalloys.com`
- Initial JS still ~250 KB gzip (vs original 530 KB) — kept the export-lib split which delivered most of the savings
- Sidebar route prefetching, React Query staleTime, realtime debounce all retained

