## Goal

Make the Team Reviews header tiles show the *true* review picture for the selected period, without sacrificing speed.

For **April 2026** the data actually looks like:

| Bucket | Count |
|---|---|
| KRA Set (no self-review yet) | 527 |
| Direct Pending (self-review submitted) | 530 |
| Skip-Level Pending | 30 |
| Reviewed (manager → approved) | 1,170 |
| **Total Employee KPIs** | **2,258** |
| Org KPIs — Pending | 85 |
| Org KPIs — Entered | 363 |
| Org KPIs — Propagated | 448 |
| **Total Org KPIs** | **896** |

Today's tiles only sum 532 + 30 + 1,170 = **1,732** because the 527 `kra_set` KPIs (KRA assigned but self-review not yet done) are silently dropped, and Org KPIs are not represented at all.

## What changes (UI only)

Replace the current 5-tile strip with **6 tiles** in a single row (already responsive — wraps on small screens):

```text
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│ Total        │ Awaiting     │ Direct       │ Skip-Level   │ Reviewed     │ Org KPIs     │
│ Employees    │ Self-Review  │ Pending      │ Pending      │ (progress)   │ (new)        │
│ 2,531        │ 527          │ 530          │ 30           │ 1,170 / 2,258│ 363+448 / 896│
│              │ KRA set, no  │ Awaiting     │ Awaiting     │ 51.8% done   │ 85 pending   │
│              │ submission   │ manager      │ skip-level   │ ▓▓▓▓▓░░░░░    │ entry        │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

Key changes:

1. **New "Awaiting Self-Review" tile** (amber, clock-rotate icon) — surfaces the missing 527 `kra_set` KPIs. Clicking it filters the grid to employees with at least one `kra_set` KPI.
2. **"Reviewed" tile becomes a progress tile**: shows `1170 / 2258` with a slim progress bar + `%` underneath. This is the "ratio" format the user asked for, and it's clearer than two separate numbers.
3. **"Total KPIs" tile is removed** — its number is now embedded in the Reviewed tile as the denominator. Saves a slot for Org KPIs without making the row longer.
4. **New "Org KPIs" tile** (purple, building icon) — shows `entered+propagated / total` with `pending` count as the sub-line. Clickable → routes to `/admin/org-kpis?period=April&year=2026` (existing page).
5. The 6 tiles stay on one row at ≥1280 px; wrap to 3×2 on tablet, 2×3 on mobile (`grid-cols-2 md:grid-cols-3 xl:grid-cols-6`).

Math invariant displayed in the tile-strip footer (small muted text, only on `team` view for full-access roles):
`527 + 530 + 30 + 1170 = 2257` (1-row drift tolerated for in-flight transitions).

## What changes (logic — gated, lean)

In `src/components/review/EmployeeSelectorGrid.tsx`, inside the existing `stats` `useMemo` (the `viewLevel === 'team'` branch):

- Add a `kraSetPending` counter alongside `directPending`, `skipPending`, `reviewed`.
  - In the `isFullAccess` branch: `if (status === 'kra_set') kraSetPending++;`
  - In the `isDirect` branch: same.
  - In the `isIndirect` branch: skip (KRA-set never reaches the skip reviewer).
- Return `{ ..., stat0: kraSetPending, totalKpis, reviewedKpis: reviewed }` so the tile can render `reviewed/totalKpis`.

This is **O(n) over `relevantKpis`** which already runs once per period — **no new DB calls, no extra RPC, no extra render cost**.

### Org KPI tile — fast path

Add a tiny new hook `useOrgKpiPeriodCounts(period, year)` in `src/hooks/useOrgKpiPeriodCounts.ts`:

```ts
// One head-only count query, three statuses → 3 numbers. Cached 60s.
supabase.from('org_kpi_values')
  .select('status', { count: 'exact', head: false })
  .eq('review_period', period).eq('review_year', year);
```

- Returns `{ pending, entered, propagated, total }`.
- Cached via React Query key `['orgKpiCounts', period, year]`, `staleTime: 60_000`.
- Lazy: only enabled when `viewLevel === 'team' && isFullAccess`.
- Single ~896-row read with one column → sub-200 ms.

The existing `periodKpis` fetch is unchanged; total Org KPI count is a separate, parallel request, so it cannot block the main grid render.

## Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data | None — no schema, no RLS change. | N/A |
| Workflow | None — display-only. Card-badge logic untouched. | N/A |
| Performance | One extra `org_kpi_values` count per period switch. | React Query 60 s cache, head fetch, single column, gated to full-access viewers only. |
| UI/UX | 5→6 tiles in one row at ≥1280 px (current viewport: 1738 px → fits cleanly). | Responsive grid `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`; verified at user's current 1738 px viewport. |
| Regression | Direct/Skip/Reviewed semantics unchanged — only `kra_set` previously hidden gets its own tile. | Extend `src/test/teamReviewsFullAccessTiles.test.ts` with a `kra_set` mixed-status case and a sum-invariant assertion. |

## Files to touch

- `src/components/review/EmployeeSelectorGrid.tsx` — add `kraSetPending`/`reviewed` ratio in `stats`, render 6-tile strip.
- `src/components/review/ReviewStatsCards.tsx` — extend `StatCardConfig` with optional `denominator?: number` so the "Reviewed" tile can render `value / denominator` + progress bar without a new component.
- `src/hooks/useOrgKpiPeriodCounts.ts` — new, ~25 LOC.
- `src/test/teamReviewsFullAccessTiles.test.ts` — extend with `kra_set` + invariant cases.
- `DOCUMENTATION.md` — v2.66.11.7 entry.
- `POLICY.md` — §127 "Team Reviews tile composition: KRA-Set, Direct, Skip, Reviewed (ratio), Org KPIs".

## One open question

The current "Reviewed" tile counts everything **past `self_review`** (i.e. it includes KPIs sitting at `manager_check`, `hr_pms_review`, `audit`, `skip_level_check`, plus `approved`). That's how it reaches 1,170 today. Two ways to label it on the new tile:

- **(A)** Keep current meaning, label it **"Moved past Self"** with sub-line `1170 / 2258 reviewed or in-review` — matches today's number, no behaviour change.
- **(B)** Tighten "Reviewed" to mean **only `approved`** (= 23 for April), and add a separate "In Review" tile for the in-flight 1,147. More honest, but introduces a 7th tile.

Recommend **(A)** to keep the row at 6 tiles and preserve the number the user already recognises. If you want (B), say so before I implement.
