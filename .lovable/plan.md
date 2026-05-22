## Goal
Ship PRD v2.0 Phase 1: a flag-gated, additive Bulk Review Dashboard with parallel reviewer stages and audited post-approval re-open. Zero impact on legacy flows when flag is OFF (default).

## §0 Non-Regression Contract (locked)
All 12 clauses from PRD §0 are binding. No legacy route, column, RPC signature, RLS policy, or notification template is modified. All new behaviour ships behind `feature_bulk_review_dashboard` (default `false`).

## Stakeholder answers (locked from clarifications)
- Flag default: **OFF** for every tenant
- `mgmt_can_reopen` default: **false** (Admin-granted only)
- E16 period close: **auto-revert** with `auto_reverted=true` revision row
- Variance badge: **fixed 1.0 absolute** on the 0–5 rating
- Open questions 1, 6, 7 from Appendix A are deferred (sensible defaults applied; called out in M1 docs)

## Risk & Impact Report
| Dimension | Impact | Mitigation |
|---|---|---|
| Data | New columns are NOT NULL with safe defaults; new tables only. Auto-included in backup via `get_backup_table_order()`. | Strictly additive DDL. Migration is forward-only. Rollback = flip flag OFF. |
| Workflow | None when flag OFF. When ON, parallel stages activate only on the new page; legacy scorecard remains sequential source of truth. | Flag-gated at both UI route and RPC entry (`RAISE EXCEPTION 'feature disabled'`). |
| UI/UX | New sidebar entry "Bulk Review (Beta)" (Admin-gated). New full-page route. No edits to existing pages. | Empty state on mount; click-to-load only. |
| Regression | High blast radius if `propagate_org_kpi_value` is altered. | Add a new overload (`p_stage` arg) instead of editing the existing signature. Legacy snapshot tests must pass byte-identical. |
| Scalability | 25k cell cap, 5MB payload, paged snapshots (200/page), `@tanstack/react-virtual` rows + cols, SWR 5min, no realtime. | Hard caps enforced at RPC layer + UI Load button disabled. |
| Rollback | Disable flag → dashboard hides, RPCs reject. New columns retain defaults; new tables stay populated but unread. | No destructive rollback path needed. |

## Delivery milestones (each is an independent PR)

### M1 — Schema, flag, and feature gate (DB + infra only, no UI)
- New migration (strictly additive):
  - `kpis.kpi_group_type` (`individual`|`departmental`|`org`, default `individual`)
  - `review_submissions`: `is_group_override`, `group_write_batch_id`, `is_auditor_override_of_hr`, `skipped_by_management JSONB`, `final_revision_no INT DEFAULT 0`, `row_version INT DEFAULT 1` (for E9 concurrency)
  - New tables `bulk_review_batches`, `final_score_revisions` (with RLS, Admin-read + SECURITY DEFINER write only)
  - `admin_feature_flags` table (if absent) + seed `feature_bulk_review_dashboard=false`, `mgmt_can_reopen=false`
  - `has_bulk_review_flag()` SECURITY DEFINER helper
- DOCUMENTATION.md + POLICY.md updated (POLICY §88 amended to reference revisions as the only legal post-approval mutation path).
- Unit tests: flag defaults, table existence, RLS lockdown on new tables.

### M2 — Read RPCs + empty dashboard shell
- New SECURITY DEFINER RPCs (all guarded by flag):
  - `bulk_scope_preview(p_period, p_year, p_filters)` — counts only
  - `bulk_review_snapshot(p_period, p_year, p_viewer_stage, p_filters, p_page, p_page_size DEFAULT 200)`
  - `kpi_cell_detail(p_kpi_id, p_emp_id)`
- New page `/review/bulk-scoring`:
  - Route + sidebar entry "Bulk Review (Beta)" gated on (Admin flag enabled) AND (user role ∈ reviewer set)
  - Empty-state shell: filter bar (`OrgFilterCombobox`, `CompanyFilter`), Period/Stage selectors, Load Scope button, skeletons
  - **Zero DB reads** on mount or filter change beyond `bulk_scope_preview` (counts).
- Hook: `useBulkScopePreview`, `useBulkReviewSnapshot` (TanStack Query, SWR 5min, no realtime)
- Tests: empty-mount = zero `kpis`/`review_submissions` queries; 25k cell cap disables Load button; flag OFF returns "disabled by admin".

### M3 — Virtualized grid + cell drawer (read-only)
- Grid component using `@tanstack/react-virtual` (rows + cols).
- Cell shows viewer-stage score; hover chip strip; variance badge (|max−min| > 1.0 across completed stages).
- Drawer: KPI history, stage scores, evidence, observations, audit log, revisions (reuses existing `Sheet`, `KpiHistoryCard`, `KpiObservationsSection`).
- Stage progress strip + tiles (Pending mine / Variance / Awaiting Mgmt / SLA).
- Manual Refresh pill (no realtime).
- Tests: virt thresholds, variance math, drawer renders all sections.

### M4 — Parallel-stage writes
- New SECURITY DEFINER RPCs:
  - `bulk_write_stage_scores(p_stage, p_cells JSONB, p_batch_reason TEXT)` — requires `self_submitted=true`; rejects `hr_pms` write when `auditor_score IS NOT NULL`; skips rows where `final_score IS NOT NULL` (POLICY §88 guard); `row_version` check; writes `bulk_review_batches` row + per-cell audit + `group_write_batch_id` stamp.
  - `bulk_management_approve(p_cells JSONB, p_batch_reason TEXT)` — stamps `final_score` from highest-priority completed stage; records `skipped_by_management` JSONB; `ConfirmDestructiveDialog` in UI.
  - New overload `propagate_org_kpi_value(..., p_stage)` — original signature untouched.
- Stage-write toolbar in grid: "Apply to row", "Send back" (reuses `SendBackDialog`), "Bulk approve".
- Auditor > HR PMS UI: override badge + inbox notification to HR PMS (Notification Engine batched per `batch_id`).
- Tests: §88 skip, Auditor>HR rule, concurrency reject, batched notifications (one row per recipient per batch).

### M5 — Post-approval re-open + edge cases
- `bulk_reopen_cells(p_cells JSONB, p_stages_to_unlock TEXT[], p_reason TEXT)` — Admin always, Management only if `mgmt_can_reopen=true`; 4-eyes guard (re-opener ≠ next approver) for Management, bypass+audit for Admin; inserts `final_score_revisions`, bumps `final_revision_no`, NULLs `final_score`, unlocks stages.
- Re-open UI in drawer (only when approved + role allows).
- E16 cron / period-close hook: auto-revert open revisions at lock with `auto_reverted=true`.
- Weekly Admin "Re-opens this week" report tile.
- All 21 edge cases (E1–E21) covered with unit tests.

## Out of scope (Phase 2+)
Cross-dept groups, AI suggestions, Daily-frequency bulk, Self-Review bulk entry, mobile bulk view, deprecation of legacy reviewer grids.

## Documentation deliverables (per milestone)
- DOCUMENTATION.md — new section "Bulk Review Dashboard"
- POLICY.md — §88 amendment + new §121 "Parallel-Stage Review & Re-open"
- New memory: `mem/features/review/bulk-review-dashboard` (replaces the v1.1 `group-based-scoring` memory)
- ADR-066 — "Parallel-stage review with audited re-open"
- Version history bumped on each milestone

## Suggested first PR (M1) — concrete file list
- `supabase/migrations/<ts>_bulk_review_dashboard_schema.sql`
- `mem/features/review/bulk-review-dashboard` (new)
- `mem/index.md` (entry added)
- `docs/adr/ADR-066.md`
- `DOCUMENTATION.md`, `POLICY.md` updates
- Tests in `src/test/bulkReview/schema.test.ts`

Ready for your approval to start M1.