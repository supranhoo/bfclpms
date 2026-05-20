# PRD: Bulk Scoring Dashboard (Group-Based KPI Scoring)
**Version:** 1.1 — Full-page dashboard, click-to-load
**Supersedes:** v1.0 (modal/grid concept)
**Status:** Awaiting stakeholder sign-off
**Owner:** PMS Product

---

## 1. Problem
Reviewers of large departments (100+ employees, 30–40 shared KPIs) perform 3,000–4,000 individual cell scorings per cycle. ~60% of KPIs are structurally identical across the dept (org/department KPIs), yet each is scored individually, causing:
- Manager-stage review time: ~90 min/dept/cycle
- Same-KPI score variance σ ≈ 0.6 (drift)
- Frequent "missed employee" rework
- Cloud compute strain from N+1 client fetches

## 2. Objectives & Success Metrics
| Metric | Today | Target |
|---|---|---|
| Manager-stage time per dept | ~90 min | ≤ 15 min (−83%) |
| Same-KPI cross-emp variance | σ ≈ 0.6 | ≤ 0.1 |
| Cells written per click | 1 | 1–N (audited batch) |
| First paint (bulk page) | n/a | < 400 ms |
| POLICY §88 regressions | 0 | 0 (hard guard) |
| Audit-trail completeness | 100% | 100% (batch-linked) |

## 3. Scope
**In:** Reviewer-stage bulk scoring (Self, Manager, Skip, HR PMS, Auditor, Management), full-page dashboard, KPI-group taxonomy, click-gated load, per-cell override, batch audit.
**Out (Phase 1):** Cross-department groups, AI suggestions (slot reserved), historical migration (forward-only), self-review bulk, Daily-frequency KPIs (E12).

---

## 4. North-Star UX — Full-Page Dashboard at `/review/bulk-scoring`

Opens **empty**: filter shell + summary skeletons only. No DB queries until the reviewer clicks **Load Scope**.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Bulk Scoring Dashboard                            [Period: Apr-2026 ▾]  │
├──────────────────────────────────────────────────────────────────────────┤
│ Scope:  [Company▾][Division▾][BU▾][Dept▾][Manager▾][KPI Group▾]         │
│ Stage:  ( ) Self  (•) Manager  ( ) Skip  ( ) HR  ( ) Auditor            │
│ Filters:[Pending only ▢] [Hide N/A ▢] [Hide approved ▢]  [Load Scope ▶] │
├──────────────────────────────────────────────────────────────────────────┤
│ Preview (auto, lightweight):                                            │
│ Employees: 142  |  KPIs: 38  |  Cells: 5,396  |  Est: 0.4 MB  |  OK ✓   │
├──────────────────────────────────────────────────────────────────────────┤
│ KPI metric cards (after Load):                                          │
│ [Pending 1,204] [In progress 312] [Approved 3,880] [SLA breach 18]      │
├──────────────────────────────────────────────────────────────────────────┤
│ Bulk Scoring Grid (virtualized rows × cols):                            │
│             E1   E2   E3   ... E142    [Apply to All Row ▼] [Send Back] │
│  KPI-1 ▢    —    —    —                                                 │
│  KPI-2 ▢    3    —    4                                                 │
│  ...                                                                     │
├──────────────────────────────────────────────────────────────────────────┤
│ Side drawer (click cell): KPI history · Evidence · Audit · Observations │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Empty-state copy
> "Select Company / BU / Department and a Stage, then click **Load Scope**. Nothing is fetched until you do — keeping your dashboard fast."

---

## 5. Click-to-Load Architecture (Cost & Speed Control)

| Stage | Trigger | What loads | Budget |
|---|---|---|---|
| T0 Shell | Page mount | Filter options only (cached) | <400 ms paint, 0 row reads |
| T1 Preview | Filter change | `bulk_scope_preview(filters)` returns counts + est_payload_kb | <80 ms p95 |
| T2 Load Scope | **Button click** | `bulk_scoring_snapshot(filters, page=0, size=200)` — slim columns, server-projected | <900 ms p95 |
| T3 Drill | Cell click | `kpi_cell_detail(kpi_id, emp_id)` | <250 ms |
| T4 Write | Save | `propagate_org_kpi_value(..., stage)` or `bulk_advance_workflow_stage` | <1.2 s for 100 cells |

### 5.1 Hard guardrails
- **Cell cap:** `emp_count × kpi_count > 25,000` OR `est_payload_kb > 5 MB` → Load button disabled with: "Narrow scope (max 25,000 cells per load)."
- **Stale-while-revalidate:** React Query keyed by `(filters, period)` 5 min; switching filters and back does not refetch.
- **No realtime subscriptions** on this page. A manual "Refresh" pill triggers re-snapshot (POLICY §120 §5).
- **Pagination:** Snapshot returns pages of 200 KPI-rows; lazy-load on grid scroll.

### 5.2 Why this reduces Cloud compute
- Filter cascades stay client-side until commit. No speculative reads.
- Single snapshot RPC replaces today's N+1 pattern in `useKpiEmployeeMatrix`.
- Server-side projection (~80 B/row) vs full-join payload (~600 B/row).
- Row+col virtualization keeps DOM <1.5k nodes for any scope.

---

## 6. Performance Budget

| Metric | Target | Mechanism |
|---|---|---|
| First paint | <400 ms | Shell-only, no queries |
| Scope preview | <80 ms p95 | Index-only count RPC |
| Snapshot (200×30) | <900 ms p95 | Server RPC, slim, gzip |
| Scroll | 60 fps | `@tanstack/react-virtual` |
| Save (100 cells) | <1.2 s | Single tx RPC |
| Heap | <120 MB | Page eviction |

---

## 7. Page Anatomy (Reuse First)

| Section | Reuse | New |
|---|---|---|
| Period selector | `usePeriodSelector` | — |
| Filter strip | `OrgFilterCombobox`, `useKpiFilters`, `CompanyFilter` | `BulkScopeBar` |
| Preview metrics | `Card`, `Skeleton` | `ScopePreviewRow` |
| Grid | virt patterns from `KpiWeightageDashboard` | `BulkScoringGrid` |
| Cell editor | `ScoreInputCell` (UnifiedScorecard) | `BulkCellEditor` ("Apply to row") |
| Confirm | `ConfirmDestructiveDialog` | — |
| Send-back | `SendBackDialog` | — |
| Drawer | `Sheet` | `KpiCellDrawer` |

---

## 8. Data Model & RPC Contract

### 8.1 Schema additions
```sql
-- kpis
ALTER TABLE kpis ADD COLUMN kpi_group_type TEXT NOT NULL DEFAULT 'individual'
  CHECK (kpi_group_type IN ('individual','departmental','org'));

-- review_submissions
ALTER TABLE review_submissions
  ADD COLUMN is_group_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN group_write_batch_id UUID NULL,
  ADD COLUMN kpi_group_type TEXT NULL;

-- New batch ledger
CREATE TABLE bulk_score_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by UUID NULL,   -- NULL for system (System Performer Attribution)
  stage TEXT NOT NULL,
  scope_filters JSONB NOT NULL,
  affected_count INT NOT NULL,
  skipped JSONB NOT NULL,   -- {not_in_kra_set, reviewer_locked, no_target_rows, approved, na, sent_back}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Auto-included in `get_backup_table_order()` — no allow-list edits.

### 8.2 RPCs (all `SECURITY DEFINER`, role-checked, POLICY §88 enforced)
```sql
bulk_scope_preview(p_period TEXT, p_year INT, p_filters JSONB)
  RETURNS TABLE(emp_count INT, kpi_count INT, pending_cells INT, est_payload_kb INT);

bulk_scoring_snapshot(p_period TEXT, p_year INT, p_stage TEXT,
                      p_filters JSONB, p_page INT, p_page_size INT DEFAULT 200)
  RETURNS JSONB;  -- {rows:[{kpi, weightage, cells:[{emp_id, score, status, is_na, final_locked}]}], total_rows, total_emps}

propagate_org_kpi_value(... , p_stage TEXT);      -- extended from existing
bulk_advance_workflow_stage(emp_ids UUID[], p_stage TEXT, p_period TEXT, p_year INT);
kpi_cell_detail(p_kpi_id UUID, p_emp_id UUID) RETURNS JSONB;
```

### 8.3 Write semantics
- Batch UPSERT; rows with `final_score IS NOT NULL` are **skipped** (POLICY §88), counted in `skipped.approved`.
- Each write stamps `group_write_batch_id`; cell edits after batch flip `is_group_override=true`.
- "Reset to group" reverts a cell to latest batch value, clears flag.
- One inbox notification per recipient per `group_write_batch_id` (no storm).

---

## 9. Roles & Permissions
| Role | Reads | Writes |
|---|---|---|
| Employee | self only — page hidden | — |
| Manager | direct reports | their reviewer stage |
| Skip-Level | indirect reports | skip stage |
| HR PMS | org-wide | HR stage |
| Auditor | assigned KPIs (Auditor Access Expansion) | audit stage |
| Management | org-wide | management stage |
| Admin | all | all stages |
RLS enforced inside each RPC; reviewer's own profile excluded from grid (Reviewer Self-Exclusion).

---

## 10. Edge Cases
| # | Case | Handling |
|---|---|---|
| E1 | Mixed-frequency group | Off-cycle KPIs auto-N/A, included in row but disabled |
| E2 | Late joiner mid-cycle | Appears in next preview; batch write skips with reason `no_target_rows` |
| E3 | Inactive employee | Excluded (Core rule) |
| E4 | Mid-cycle weightage change | Locked period bypass per KPI Weightage Dashboard |
| E5 | Override then re-apply group | Override preserved unless "Reset to group" clicked |
| E6 | Cross-dept employee | Filtered out unless dept matches; surfaced in preview as `excluded_count` |
| E7 | POLICY §88 finalized cell | Skipped, counted, never overwritten |
| E8 | Sent-back KPI | Visible but read-only with badge (Governance Bypass Exceptions) |
| E9 | Concurrent reviewers | Snapshot includes `version`; write rejects on stale version |
| E10 | Empty scope after filters | Banner "No KPIs match this scope" |
| E11 | Exceeds cell cap | Load disabled with guidance to narrow |
| E12 | Daily-frequency KPI | Excluded from grid; drawer link to per-employee daily entry |

---

## 11. Risks & Mitigation
| Risk | Mitigation |
|---|---|
| Loss of individual accountability | `is_group_override` flag + per-cell audit + admin-set `kpi_group_type` default `individual` |
| Cloud CPU spike | Click-gated load, server projection, 25k-cell cap, no realtime |
| POLICY §88 regression | RPC-layer skip + unit test asserting `final_locked` rows untouched |
| Reviewer over-applies "Apply to row" | `ConfirmDestructiveDialog` with affected-count + batch-id audit + Reset to group |
| Cache staleness | "Refresh" pill + 5-min SWR |
| Notification storm | Batched by `group_write_batch_id` — one inbox row/recipient/batch |
| Over-generalization | Auto-detect ≥70% dept overlap is **advisory only**, never auto-writes `kpi_group_type` |

---

## 12. Future Enhancement Slots (built-in seams)
1. **AI Score Suggestions** — Lovable AI Gateway (`google/gemini-2.5-flash`), last 3 cycles context. Flag `feature_ai_bulk_suggest`.
2. **Saved Scopes** — `bulk_saved_scopes` table; chip row above filter bar.
3. **Analytics tab** — variance heatmap, manager calibration, KPI distribution (lazy-mounted).
4. **Calibration mode** — cell color = variance vs dept median.
5. **Async CSV export** — via `large-export-pagination-policy`.
6. **Mobile drill-down** — single-KPI list view, reuses `SafetySkeletonBlock`.
7. **Approval workflows** — bulk approve / send-back in one click (Management Bulk Approval parity).

---

## Appendix A — Reuse Map
Org KPI propagation; `useKpiEmployeeMatrix` (read-only inspiration); `canonicalGroupKey`; `workflow_config`; `audit_kpi_assignments`; `OrgFilterCombobox`; `PropagationPreviewDialog`; `ConfirmDestructiveDialog`; `SendBackDialog`; Notification & Dispatch Engine; `Skeleton`; `@tanstack/react-virtual`.

## Appendix B — Open stakeholder questions
1. Default `kpi_group_type` rollout: keep `individual` everywhere and admins opt-in, or seed `departmental` for KPIs with ≥90% dept overlap?
2. Should Management role get bulk approve in Phase 1 or Phase 2?
3. Hard cell cap value — 25,000 confirmed?

---

## Version History
- **v1.1 (2026-05-20)** — Redesigned as full-page dashboard, added click-to-load architecture, perf budget, cell cap, `bulk_scope_preview` + `bulk_scoring_snapshot` RPCs, drawer for drill-in. Supersedes v1.0.
- **v1.0 (2026-05-19)** — Initial PRD (modal/grid concept).
