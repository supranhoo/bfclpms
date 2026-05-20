
# PRD — Group-Based & Departmental KPI Scoring at Scale

**Deliverable:** Write `docs/prd/PRD-group-scoring.md` (~800-1200 lines) plus a short architecture addendum `docs/adr/ADR-064.md`. No code changes in this round — PRD only.

**Reuse-first principle:** The platform already ships ~70% of the building blocks needed. The PRD must explicitly map each requirement to an existing feature and only call out *gaps*. No greenfield duplication.

---

## What already exists (reuse inventory)

| Capability | Existing surface | PRD reuses as |
|---|---|---|
| Org-level KPI definition + scoping (Org/Dept/Employee) | `org_kpi_data_owners`, `change_org_kpi_scope_cascading`, `OrgKpiOverview`, `OrgKpiScopeChangeDialog` | Group-KPI master |
| One-value-to-many propagation | `propagate_org_kpi_value` RPC, `usePropagateOrgKpiValue`, `PropagationPreviewDialog` | Bulk score writer |
| Snapshot read path (no RLS timeout) | `get_org_kpi_data_entry_snapshot` RPC | Bulk grid loader |
| Per-row / per-card status pills | `deriveScopedRowStatus`, `deriveOrgKpiTileStatus` (ADR-055) | Group grid status column |
| KPI canonical grouping across name variants | `kpi_definitions` + `kpi_name_aliases`, `canonicalGroupKey` | Cross-employee KPI rollup |
| Matrix view (KPI × Employee) | `useKpiEmployeeMatrix`, `KpiMappingMatrix` page | Bulk scoring grid skeleton |
| Bulk template / zero-score / grant flows | `BulkTemplateAssignDialog`, `BulkZeroScoreSection`, `BulkGrantAccessDialog` | UX pattern reference |
| Workflow engine (per-employee status) | `workflow_config`, ADR-055, POLICY §88 immutability | Per-stage gating for group writes |
| Audit trail | `system_audit_logs`, ORG_KPI_AUTOPULLED, etc. | Group-write audit events |
| Frequency & cycle locks | `resolve_terminal_period`, KPI Frequency Indicators memory | Cycle gating for group entry |

**Gap list driving new work in PRD:**
1. No reviewer-facing **bulk scoring grid** (KPI rows × employee columns) — current Org KPI Data Entry is for the *Data Owner* writing one value, not for *Manager/Auditor/HR PMS/Management* scoring across a team.
2. No concept of a **KPI group** independent of "org-level" (e.g. an Individual KPI that happens to be common across 30 employees but isn't owned by a Data Owner).
3. No **per-stage bulk approve / send-back** across an employee column.
4. No **override-on-cell** UX (group value applied, then one cell individually adjusted) with audit linkage.
5. No **department × KPI heatmap** for Management/Audit roles.

---

## PRD document structure (to be written)

The PRD file follows the user's exact 12-section spec. Each section will be filled per below.

### 1. Problem Statement
- Today: scoring is per `review_submissions` row, one employee at a time, walked through 7 workflow stages each.
- At 50 employees × ~12 KPIs × 7 stages = **4,200 individual cell-actions per cycle per department**. Manager step alone = ~600 clicks.
- ~60% of those KPIs are *identical* across the department (Safety, Compliance, Attendance, Dept revenue share) but are scored independently → drift, inconsistency, time loss.
- Existing Org-KPI propagation solves the *data-entry* side but not the *reviewer* side.

### 2. Objectives (measurable)
- Cut Manager-stage scoring time per department from ~90 min → **≤ 15 min** (-83%).
- Reduce same-KPI score variance across a department from current avg σ ≈ 0.6 → **≤ 0.1** (only intentional overrides).
- 100% of group-scored KPIs carry a traceable audit row identifying group-write vs override.
- Zero regression on POLICY §88 (immutability of approved `final_score`).

### 3. Scope
- **In:** Manager, Auditor, HR PMS, Skip-Level, Management bulk scoring; group definitions; override UX; dashboards.
- **Out (Phase 1):** Self-review bulk (employees still self-score individually); cross-department groups; AI auto-score.

### 4. Functional Requirements (detailed)

**FR-1 KPI Group Model**
- Introduce `kpi_group_type` per KPI: `individual` | `departmental` | `org` (org already exists).
- `departmental` = scored once per department, applied to all employees in that dept for that period.
- Group inferred automatically when ≥ N employees in same department share canonical `kpi_definitions.id` and weightage — admin can confirm/override.

**FR-2 Bulk Scoring Grid (new page `/review/bulk-scoring`)**
- Rows: canonical KPI (grouped via `canonicalGroupKey`).
- Columns: employees in selected scope (BU → Division → Dept → Team filter chain, reuse `OrgFilterCombobox`).
- Cell: shows current best-score (8-stage fallback) + reviewer's editable score for *their* stage only (gated by `workflow_config` per employee).
- Header row per KPI: "Group score" input — writing it fans out to every unlocked cell in that row via existing `propagate_org_kpi_value` pattern (extended to reviewer stages).
- Per-cell override: edit one cell → group value remains, override flagged with badge + audit event `BULK_SCORE_OVERRIDE`.

**FR-3 Bulk Stage Transition**
- "Approve column" / "Send back column" actions on each employee column — batched server-side via new RPC `bulk_advance_workflow_stage(emp_ids[], stage, period)` (mirrors single-employee path; reuses RLS).
- Hard guards: skip rows where `final_score IS NOT NULL` (POLICY §88), skip rows past current stage, skip N/A.

**FR-4 Scope Filters**
- Reuse Reports filter stack (Company → BU → Division → Dept → Designation → Grade → Manager).
- Persist filter set in URL (Dashboard View Persistence memory).

**FR-5 Override & Reconciliation**
- Per-cell override stored on `review_submissions.<stage>_score` as today; new boolean `is_group_override` + `group_write_batch_id` for traceability.
- "Reset to group value" link on overridden cells.

**FR-6 Role-scoped variants**
- Manager: own direct + indirect reports, own stage.
- Auditor: assigned KPIs only (reuse `audit_kpi_assignments`).
- HR PMS / Skip-Level / Management: their stage, full org scope.
- Admin: read-only grid for governance.

**FR-7 Notifications**
- Single batched notification per group-write (reuse notification engine), not N per employee.

### 5. Non-Functional Requirements
- **Perf:** grid renders 50 emp × 30 KPI = 1500 cells under 2s; uses snapshot RPC + virtualized table (`@tanstack/react-virtual`, already in deps).
- **Concurrency:** optimistic locking on `review_submissions.updated_at`; conflict toast on stale writes.
- **Security:** all writes go through RPC under `SECURITY DEFINER` with role + assignment check (Edge Function Security memory).
- **Accuracy:** numeric inputs validated against KPI scale/UoM; high-threshold warnings (Data Entry Validation Guardrails memory).
- **Auditability:** every bulk write produces 1 `system_audit_logs` summary row + per-cell rows linked by `group_write_batch_id`.

### 6. User Workflow
```text
Manager → Reviews → "Bulk Scoring" tab
  → Pick Period + Dept (filters persisted in URL)
  → Grid loads (KPI rows × emp cols, status pills per cell)
  → For each Departmental KPI row:
      enter Group score in header → preview dialog ("Apply 4.0 to 28 employees, 2 locked, 1 N/A skipped") → Confirm
  → For Individual KPI rows: score per cell
  → Override any group cell as needed (badge appears)
  → "Submit column" per employee OR "Submit all unlocked" → batch advance
  → Notifications fan out (batched)
Auditor / HR PMS / Skip-Level / Management → same grid, scoped to their stage
Admin → read-only grid + Audit log filtered by group_write_batch_id
```

### 7. UI/UX Concepts
- **Layout:** Sticky left column (KPI + canonical name + weightage + group/individual chip). Sticky top row (employee chips with status dot + workflow stage badge).
- **Group row affordance:** subtle background tint, "↧ Apply to all" inline button next to input.
- **Cell states:** `pending` (empty), `entered` (blue), `group-applied` (teal), `override` (amber dot), `locked` (gray padlock), `na` (dash), `approved` (green check).
- **Bulk action bar (sticky bottom):** "Apply group values", "Submit selected columns", "Send back selected".
- **Heatmap view toggle** for Management/Audit: dept × KPI matrix colored by avg score.
- Reuse `ConfirmDestructiveDialog` for any group action affecting >10 cells.
- Mobile: collapses to single-employee view (existing UnifiedScorecard).

### 8. Data Model
- **New columns** on `review_submissions`:
  - `is_group_override BOOLEAN DEFAULT false`
  - `group_write_batch_id UUID NULL`
  - `kpi_group_type TEXT` (denormalized for fast filter)
- **New table** `bulk_score_batches`:
  - `id, period, year, scope_type (dept|org|custom), scope_id, kpi_definition_id, stage, applied_value, performed_by, employee_count, override_count, created_at`
- **Reuse:** `kpi_definitions` (canonical), `org_kpi_data_owners` (group ownership), `workflow_config` (stage gating), `system_audit_logs`.
- **No FK to auth.users** (project rule). Automated rows: `performed_by = NULL` (System Performer Attribution memory).

### 9. Edge Cases
- Mixed-frequency group (monthly + quarterly KPI in same dept): group write only fans to employees whose period is in active cycle (KPI Frequency memory).
- Late joiner mid-cycle: snapshot RPC auto-includes; group write applies; existing `trg_autopull_propagated_org_kpi` already handles back-fill.
- Employee marked inactive after group write: write succeeds for active set only; inactive excluded (Employee Status Management memory).
- Approved (`final_score` set) cells: always skipped, listed in preview dialog with reason.
- Sent-back KPI in group: skipped from group write to preserve Send-Back Data Preservation rules.
- Mid-cycle KPI weightage change: blocked during open bulk session (existing variance acknowledgement pattern).
- Override then group re-apply: override survives unless reviewer explicitly clicks "Reset to group".
- Cross-department employee (matrix org): treated as individual until admin assigns to a dept group.

### 10. Benefits & Impact
- 80%+ reduction in reviewer click-time.
- Consistency: identical KPIs share identical scores by default → cleaner analytics, fairer comparisons.
- Faster cycle close → earlier incentive computation.
- Lower data-entry error rate (one input vs N).

### 11. Risks & Mitigation
| Risk | Mitigation |
|---|---|
| Loss of individual accountability | Override-on-cell + `is_group_override` flag visible everywhere; reports surface override % per reviewer |
| Reviewer rubber-stamps group score without thinking | Preview dialog forces value review; Audit role can filter "group-only, never overridden" KPIs as a quality signal |
| POLICY §88 violation if approved scores get overwritten | Server RPC hard-skips rows where `final_score IS NOT NULL`; unit-tested |
| Concurrent reviewers double-writing | `updated_at` optimistic lock; conflict toast |
| Frequency drift (quarterly KPI written in non-cycle month) | Reuse `resolve_terminal_period`; preview shows skipped cycles |
| Notification storm | Batched per `group_write_batch_id`, single inbox row per recipient |
| Over-generalization (true individual KPIs forced into group) | Admin toggle `kpi_group_type` per KPI; default to `individual` unless ≥70% dept overlap detected |

### 12. Future Enhancements
- AI-suggested group scores from historical median + variance.
- Cross-department groups (e.g. all Plant Heads org-wide).
- Self-review bulk for employees with multiple identical reportees.
- Drilldown analytics: override rate per reviewer, score drift per KPI.
- Mobile-first bulk approve via swipe.

---

## Deliverables in this round (plan mode → on approval)

1. `docs/prd/PRD-group-scoring.md` — full PRD per spec above (~800-1200 lines, with example screenshots referenced as TBD wireframes).
2. `docs/adr/ADR-064.md` — short architecture record: "Bulk scoring grid reuses Org KPI propagation pattern; new `bulk_score_batches` table + 2 columns on `review_submissions`; no new auth surface."
3. `mem/features/review/group-based-scoring.md` — memory entry summarising the contract for future agents.
4. Update `mem/index.md` to reference (3).

**No code, no migrations, no schema changes in this round.** Implementation will be a separate, approval-gated plan after stakeholder sign-off on the PRD.
