---
name: Group-Based KPI Scoring (PRD v1.1)
description: Full-page Bulk Scoring Dashboard at /review/bulk-scoring; click-gated load, 25k-cell cap, two new preview/snapshot RPCs, row+col virtualization, per-cell override with audit linkage
type: feature
---

**Status:** PRD v1.1 only (docs/prd/PRD-group-scoring.md, ADR-064 +addendum). No code, no migrations yet.

**Contract (locked at PRD v1.1):**
- Surface is a **full-page dashboard** at `/review/bulk-scoring`. NOT a modal. Mounts empty.
- **Click-to-load:** no `kpis`/`review_submissions` reads on mount or filter change. Filter changes only fire `bulk_scope_preview` (counts only). Grid hydrates only after explicit **Load Scope** click.
- **Hard cap:** reject scopes where `emp_count × kpi_count > 25,000` OR `est_payload_kb > 5 MB`. Load button disabled with guidance to narrow.
- **New RPCs:** `bulk_scope_preview(period, year, filters)` (≤80 ms p95) and `bulk_scoring_snapshot(period, year, stage, filters, page, page_size=200)` (≤900 ms p95). Both SECURITY DEFINER, role-checked, slim-projected (~80 B/row).
- **No realtime** on this page — manual Refresh pill only (POLICY §120 §5). SWR cache 5 min keyed by `(filters, period)`.
- **Virtualization mandatory:** `@tanstack/react-virtual` on rows and columns.
- New `kpi_group_type` on `kpis`: `individual` (default) | `departmental` | `org`. Default MUST stay `individual` — auto-detect ≥ 70% dept overlap is *advisory* only, never an automatic write.
- New `review_submissions` columns: `is_group_override BOOLEAN DEFAULT false`, `group_write_batch_id UUID NULL`, `kpi_group_type TEXT` (denormalised).
- New table `bulk_score_batches` (one row per batch write). `performed_by` is profile id; NULL for system actions (System Performer Attribution).
- Bulk writes go through extended `propagate_org_kpi_value(stage)` + new `bulk_advance_workflow_stage(emp_ids[], stage, period, year)` RPCs. NEVER use client-side `from('review_submissions').update(...)` for bulk paths.
- POLICY §88 invariant: bulk write MUST skip rows with `final_score IS NOT NULL`. Hard guard at RPC layer + unit test.
- Skipped reasons taxonomy mirrors POLICY §111.6 (BENIGN = `{not_in_kra_set, reviewer_locked, no_target_rows, approved, na, sent_back}`).
- Override semantics: editing a cell after a group write sets `is_group_override=true`; "Reset to group" reverts to latest batch value and clears the flag.
- Notifications batched per `group_write_batch_id` — one inbox row per recipient per batch.
- Backup: `bulk_score_batches` auto-included via `get_backup_table_order()` (no allow-list edits).
- Daily-frequency KPIs are NOT eligible for group writes (E12) — score individually per Daily KPI Aggregation Logic.
- Reviewer's own profile excluded from grid columns per Reviewer Self-Exclusion.

**Perf budget:** first paint <400 ms, scope preview <80 ms p95, snapshot (200×30) <900 ms p95, save (100 cells) <1.2 s, heap <120 MB, 60 fps scroll.

**Reuse map:** Org KPI propagation, snapshot RPC, `canonicalGroupKey`, `workflow_config`, `audit_kpi_assignments`, `OrgFilterCombobox`, `CompanyFilter`, `PropagationPreviewDialog`, `ConfirmDestructiveDialog`, `SendBackDialog`, `Sheet` (drawer), Notification & Dispatch Engine, `Skeleton`, `@tanstack/react-virtual`, virt patterns from `KpiWeightageDashboard`.

**Out of scope (Phase 1):** Self-review bulk; cross-department groups; AI suggestions; historic migration to group form (forward-only).

**Open stakeholder questions:** see PRD Appendix B.
