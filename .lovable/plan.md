# Bulk Scoring Dashboard — Redesigned PRD v1.1

Replaces the modal/grid concept from PRD v1.0 with a **full-page dashboard** at `/review/bulk-scoring`, designed for reviewing entire Org / BU / Department slices, with **deferred (click-to-load) data fetching** to control Cloud compute cost and keep first paint instant.

---

## 1. North-Star UX

A single dashboard that opens **empty** (filter shell + KPI summary cards only). The reviewer sets scope → clicks **Load Scope** → grid + analytics hydrate. No filter change ever auto-fires a query.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Bulk Scoring Dashboard                            [Period: Apr-2026 ▾]  │
├──────────────────────────────────────────────────────────────────────────┤
│ Scope:  [Company▾][Division▾][BU▾][Dept▾][Manager▾][KPI Group▾]         │
│ Stage:  ( ) Self  (•) Manager  ( ) Skip  ( ) HR  ( ) Auditor            │
│ Filters:[Pending only ▢] [Hide N/A ▢] [Hide approved ▢]  [Load Scope ▶] │
├──────────────────────────────────────────────────────────────────────────┤
│ ── KPI cards (live only after load) ───────────────────────────────────  │
│ [Employees: 142] [KPIs in scope: 38] [Pending cells: 1,204] [SLA: 3d]   │
├──────────────────────────────────────────────────────────────────────────┤
│ ── Bulk Scoring Grid (virtualized) ─────────────────────────────────────│
│             E1   E2   E3 … E142          [Apply to All] [Send Back ▾]   │
│  KPI-1 ☐    -    -    -                                                 │
│  KPI-2 ☐    3    -    4                                                 │
│  …                                                                       │
├──────────────────────────────────────────────────────────────────────────┤
│ ── Side panel (on cell/row select) ─ KPI history · Evidence · Audit ─── │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Click-to-Load Architecture (Cost Control)

| Stage | Trigger | What loads |
|---|---|---|
| **T0 — Shell** | Page mount | Filter options only (cached `useProfilesWithHierarchy`, KPI categories). **Zero** submission/KPI row reads. |
| **T1 — Scope counts** | Filter change | Single lightweight RPC `bulk_scope_preview(filters)` returning `{emp_count, kpi_count, pending_cells, est_payload_kb}`. ≤50 ms. |
| **T2 — Load Scope** | Explicit button click | Paged RPC `bulk_scoring_snapshot(filters, page, page_size=200)` returns canonical KPI rows × employee cells. Server-side filtered, projected (slim columns). |
| **T3 — Drill-in** | Row/cell click | `kpi_cell_detail(kpi_id, emp_id)` — history, evidence, audit. On demand only. |
| **T4 — Write** | Save | `propagate_org_kpi_value(stage)` or `bulk_advance_workflow_stage`. Optimistic UI; rollback on RPC error. |

**Guardrails**
- **Hard cap:** `est_payload_kb > 5 MB` or `emp_count × kpi_count > 25 000` → button disabled with banner "Narrow scope (max 25k cells per load)". Forces dept-level slicing.
- **Stale-while-revalidate:** loaded scope cached in React Query keyed by `(filters, period)` for 5 min; reviewer can switch filters and return without refetch.
- **No realtime subscriptions** on this page — polling is opt-in via "Refresh" pill (POLICY §120 §5).

---

## 3. Performance Budget

| Metric | Target | Mechanism |
|---|---|---|
| First paint | < 400 ms | Shell-only; no data queries |
| Scope preview | < 80 ms p95 | Single index-only count RPC |
| Snapshot load (200×30) | < 900 ms p95 | Server RPC, slim projection, gzip |
| Grid scroll | 60 fps | `@tanstack/react-virtual` on rows + cols |
| Save batch (100 cells) | < 1.2 s | Single RPC, one DB transaction |
| Memory | < 120 MB heap | Virtualization + page eviction |

**Why this lowers Cloud compute cost**
- Filter cascades don't hit Postgres until user commits via Load Scope.
- One snapshot RPC replaces N+1 client queries (today's pattern in `useKpiEmployeeMatrix` issues many `.in()` batches).
- Server projects only `id, score columns, is_na, status` (~80 B/row) instead of full join payloads.
- Virtualization keeps DOM nodes ≤ 1.5k regardless of scope size.

---

## 4. Page Anatomy (Reused Components First)

| Section | Reuse | New |
|---|---|---|
| Period selector | `usePeriodSelector` | — |
| Org filter strip | `OrgFilterCombobox`, `useKpiFilters` cascade | `BulkScopeBar` wrapper |
| KPI summary cards | `Card`, `Skeleton` | `ScopeMetricsRow` |
| Grid | virt patterns from `KpiWeightageDashboard` | `BulkScoringGrid` (rows × cols virtualized) |
| Cell editor | `ScoreInputCell` from `UnifiedScorecard` | `BulkCellEditor` (adds "Apply to all in row") |
| Send-back | `SendBackDialog` | — |
| Confirm destructive | `ConfirmDestructiveDialog` | — |
| Side drawer | `Sheet` | `KpiCellDrawer` |
| Audit trail | existing audit timeline | — |

---

## 5. Future Enhancement Slots (Built-in seams)

1. **AI Score Suggestions** — placeholder side-panel "Suggest" button calling Lovable AI Gateway (`google/gemini-2.5-flash`) with last 3 cycles of context. Disabled flag `feature_ai_bulk_suggest`.
2. **Saved Scopes** — `bulk_saved_scopes` table (filter JSON + name); chip row above filter bar.
3. **Analytics tab** — second tab on the page: variance heatmap, manager calibration, KPI distribution. Lazy-mounted.
4. **Calibration mode** — colored cell variance vs dept median, toggle.
5. **Export** — async CSV via existing `large-export-pagination-policy`.
6. **Mobile drill-down** — single KPI × employees list view, reuse `SafetySkeletonBlock`.

---

## 6. Data & RPC Contract (no new code yet)

```sql
-- Lightweight preview (counts only, no rows)
bulk_scope_preview(
  p_period TEXT, p_year INT, p_filters JSONB
) RETURNS TABLE(emp_count INT, kpi_count INT, pending_cells INT, est_payload_kb INT)

-- Paged snapshot (rows = canonical KPIs, cols = employees)
bulk_scoring_snapshot(
  p_period TEXT, p_year INT, p_stage workflow_stage,
  p_filters JSONB, p_page INT, p_page_size INT DEFAULT 200
) RETURNS JSONB  -- {rows:[{kpi, weightage, cells:[{emp_id, score, status, is_na, final_locked}]}], total_rows, total_emps}

-- Write paths (already specified in PRD v1.0)
propagate_org_kpi_value(... , p_stage)
bulk_advance_workflow_stage(emp_ids[], stage, period, year)
```

All RPCs `SECURITY DEFINER`, RLS-equivalent role check inside, must respect POLICY §88 (skip `final_score IS NOT NULL`).

---

## 7. Risk & Impact Report

| Risk | Mitigation |
|---|---|
| Scope explodes Cloud CPU | Hard cell-count cap + server-side projection + click-gated load |
| POLICY §88 regression | RPC-layer skip + unit test on `bulk_scoring_snapshot` returning `final_locked:true` |
| Reviewer over-applies "Apply to all" | `ConfirmDestructiveDialog` with affected-count, batch-id audit, "Reset to group" undo per cell |
| Filter UI confuses with existing scorecard | New route `/review/bulk-scoring`, distinct breadcrumb; not a modal over existing pages |
| Stale cache after another reviewer writes | "Refresh scope" pill + 5-min SWR; full realtime deferred to Phase 2 |
| Daily-frequency KPIs misused | Hidden from grid (E12 invariant) — surfaced in side drawer with link to per-employee daily entry |

---

## 8. Deliverables (Plan-mode only)

1. Rewrite `docs/prd/PRD-group-scoring.md` → v1.1 with sections above + ASCII wireframes (full-page, no modal).
2. Update `docs/adr/ADR-064.md` — add §"Click-to-Load Architecture" and RPC budget table.
3. Update `mem/features/review/group-based-scoring.md` — note v1.1 invariants: click-gated load, 25k-cell cap, two new RPCs (`bulk_scope_preview`, `bulk_scoring_snapshot`), virtualization mandate.
4. Update `mem/index.md` reference description.

**Out of scope this round:** any migration, RPC body, React component, or route change. Implementation is a separate approval-gated plan after stakeholder sign-off on v1.1.

---

Used the redesign skill (pinned: full-page dashboard register, deferred-load taste, perf-first composition).
