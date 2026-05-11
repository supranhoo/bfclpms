## Goal

Apply the same 6-tile clarity pattern we shipped for **Team Reviews** (v2.66.11.7) to the three reviewer-stage dashboards — **HR PMS Review**, **Manager Review** (`pending_manager_review`), and **Skip Mgr Review** (`pending_skip_review`) — so the headline numbers reconcile to a single sum invariant and Org KPIs surface as a first-class tile.

## What's wrong today

```text
HR PMS view  : 5 tiles → Total Emp │ Pending │ In HR PMS │ Reviewed │ Total KPIs
Manager view : 3 tiles → Total Emp │ Pending Manager Review │ Total KPIs
Skip Mgr view: 3 tiles → Total Emp │ Pending Skip Mgr Review │ Total KPIs
```

Issues:
1. **No Org KPI tile** on any of these — Org KPIs flowing through the same stage are invisible at a glance, even though `pending_manager_review` already counts `orgKpiCount` internally (`stat2`) but shows it only as a subtitle fragment.
2. **No ratio / progress bar** on the "Reviewed" tile (HR PMS) and **no "Reviewed" tile at all** on the two pending-stage views — so you cannot see "X of Y done" without doing the math.
3. **No explicit sum invariant** displayed; numbers don't visibly add up to Total KPIs.

## What changes (UI only — same pattern as Team)

### A. HR PMS view — extend from 5 → 6 tiles

```text
┌────────────┬────────────┬────────────┬────────────┬────────────┬────────────┐
│ Total Emp  │ Pending    │ In HR PMS  │ Reviewed   │ Total KPIs │ Org KPIs   │
│            │ Review     │ Review     │ X / Total  │            │ E+P / Tot  │
│            │ (amber)    │ (purple)   │ ▓▓▓▓░░ %   │ (blue)     │ (purple)   │
└────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘
```
- Add `denominator={stats.totalKpis}` + progress bar to **Reviewed** tile (already supported by `StatCard.denominator`).
- Add new **Org KPIs** tile (`orgEntered / orgTotal`, sub-line = `N pending entry`), shown only for full-access roles, reusing the existing `useOrgKpiPeriodCounts(period, year)` hook.
- Footer micro-text (muted): `Pending + In HR PMS + Reviewed = Total KPIs` invariant check.

### B. Manager Review view (`pending_manager_review`) — 3 → 6 tiles

```text
┌────────────┬────────────┬────────────┬────────────┬────────────┬────────────┐
│ Total Emp  │ Pending    │ In Manager │ Reviewed   │ Total KPIs │ Org KPIs   │
│            │ Mgr Review │ Review     │ X / Total  │ (this stg) │ at mgr     │
│            │ (amber)    │ (yellow)   │ ▓▓▓▓░░ %   │ (blue)     │ (purple)   │
└────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘
```
Where for this view:
- **Pending** = KPIs with `status = 'self_review'` (current `stat1` regular) — the queue.
- **In Manager Review** = KPIs with `status = 'manager_check'` — actively being reviewed.
- **Reviewed** = KPIs past `manager_check` for this view's roster (`approved` chain).
- **Org KPIs** = `org_kpi_values` rows for this period that are at the manager stage (`pending` + `entered`/`propagated` ratio). Reuses `useOrgKpiPeriodCounts`.

### C. Skip Mgr Review view (`pending_skip_review`) — 3 → 6 tiles

Same structure as B, but for the skip-level stage:
- **Pending** = `status = 'manager_check'` (queue waiting for skip).
- **In Skip Review** = `status = 'skip_level_check'`.
- **Reviewed** = past `skip_level_check`.
- **Org KPIs** tile reused.

## What changes (logic — minimal)

In `src/components/review/EmployeeSelectorGrid.tsx → stats useMemo`:

1. **`hr_pms` branch** — already returns `pending / inReview / reviewed / totalKpis`; no change needed beyond what's already there. Just consume new tile config.
2. **`pending_manager_review` branch** — extend to also compute:
   - `inReview` = `relevantKpis.filter(k => k.status === 'manager_check').length`
   - `reviewed` = `relevantKpis.filter(k => !['kra_set','self_review','manager_check'].includes(k.status||'')).length`
   - Map to `stat1=pending`, `stat2=inReview`, `stat3=reviewed`, `stat4=totalKpis`.
3. **`pending_skip_review` branch** — symmetric:
   - `pending` = `status='manager_check'`
   - `inReview` = `status='skip_level_check'`
   - `reviewed` = past `skip_level_check`
4. Keep existing `orgKpiCount` / `nonMonthlyCount` as additional sub-line metadata (already used in subtitle), but the Org KPI tile reads from the period-wide hook for parity with Team view.

All three branches already iterate `relevantKpis` once — added counters are O(n), no new DB reads.

### Org KPI hook — gate change

`useOrgKpiPeriodCounts` is currently `enabled: viewLevel === 'team' && isFullAccess`. Extend gating to also include `hr_pms`, `pending_manager_review`, `pending_skip_review`. Same 60s React Query cache → no perf hit on view switching within the same period.

## Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data | None — display-only. No schema, no RLS, no workflow change. | N/A |
| Workflow | None — card-badge & action-gate logic untouched. | N/A |
| Performance | One extra `org_kpi_values` count call when first opening any of the three views per period. | Already cached 60 s; head-only single-column count; ~896 rows. |
| UI/UX | Pending-stage views grow from 3→6 tiles; HR PMS 5→6. At 1280 px+ they fit on one row; wraps to 3×2 / 2×3 below. | `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`, identical to Team. |
| Regression | `pending_manager_review` / `pending_skip_review` previously surfaced only `stat1` — adding `stat2/stat3` is additive, doesn't shift existing filters. | Extend `src/test/teamReviewsFullAccessTiles.test.ts` (or new sibling test) with sum-invariant cases for all four views. |

## Files to touch

- `src/components/review/EmployeeSelectorGrid.tsx`
  - Extend `stats` for `pending_manager_review` and `pending_skip_review` branches (+ counters).
  - Replace the 3-tile blocks for those two views and the 5-tile block for `hr_pms` inside `renderStatsCards()` with the new 6-tile layout (mirrors Team's grid classes).
- `src/hooks/useOrgKpiPeriodCounts.ts` — broaden the `enabled` predicate to cover the three additional views.
- `src/test/teamReviewsFullAccessTiles.test.ts` — add three describe-blocks: HR PMS, Manager Review, Skip Mgr Review — each asserting `pending + inReview + reviewed === totalKpis` plus Org KPI presence.
- `DOCUMENTATION.md` — v2.66.11.8 entry: "Tile parity for HR PMS / Manager / Skip Mgr Review".
- `POLICY.md` §127 — append: same 6-tile composition rule applies to all reviewer-stage dashboards (HR PMS, Manager, Skip, Audit-future).

## Out of scope (call out)

- **Audit view** already has a meaningful 5-tile layout (`Pending Audit | In Audit | Forwarded | My KPIs`). Adding Org KPIs there is a natural follow-up but you didn't ask for it — flag for a v2.66.11.9 follow-up if desired.
- **Management view** (default branch) — same situation; can be added in the same follow-up.

## One small open question

For **Manager Review** and **Skip Mgr Review**, the "Org KPIs" tile can mean either:
- **(A)** Org KPIs **at this stage** (`status` matches the view's queue) — a focused, view-specific number.
- **(B)** Org KPIs for the **whole period** (entered+propagated/total) — same number as Team view's tile, gives period-wide context.

Recommend **(B)** for consistency with Team view (one universally meaningful Org KPI denominator across all reviewer dashboards). Say so if you'd prefer (A).
