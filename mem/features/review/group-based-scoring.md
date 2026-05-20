---
name: Group-Based KPI Scoring (PRD v1.0)
description: Bulk reviewer-stage scoring grid; departmental group writes via extended propagation RPC; per-cell override with audit linkage
type: feature
---

**Status:** PRD only (docs/prd/PRD-group-scoring.md, ADR-064). No code, no migrations yet.

**Contract (locked at PRD v1.0):**
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

**Reuse map:** Org KPI propagation, snapshot RPC, `canonicalGroupKey`, `workflow_config`, `audit_kpi_assignments`, `OrgFilterCombobox`, `PropagationPreviewDialog`, `ConfirmDestructiveDialog`, `SendBackDialog`, Notification & Dispatch Engine.

**Out of scope (Phase 1):** Self-review bulk; cross-department groups; AI suggestions; historic migration to group form (forward-only).

**Open stakeholder questions:** see PRD Appendix B.
