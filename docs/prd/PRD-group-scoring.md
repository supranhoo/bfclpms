# PRD — Group-Based & Departmental KPI Scoring at Scale

- **Version:** 1.0 (Draft)
- **Author:** Product / HR-Tech
- **Date:** 20 May 2026
- **Status:** For stakeholder review
- **Related:** ADR-064, `mem://features/review/group-based-scoring`
- **Reuse posture:** ~70% of required primitives already exist (Org KPI suite, propagation RPCs, snapshot RPC, canonical grouping, workflow engine). This PRD extends — it does not replace.

---

## 1. Problem Statement

### 1.1 Current state
The PMS scores every employee individually. A single `review_submissions` row holds one KPI for one employee for one period, and is walked through 7 workflow stages (Self → Manager → Skip-Level → HR PMS → Auditor → Management → Final).

### 1.2 The scalability wall
For a typical operations department:

| Dimension | Value |
|---|---|
| Employees per dept | 20 – 50 |
| KPIs per employee | 10 – 15 |
| Workflow stages | 7 |
| Cell actions per cycle per dept | **~4,200** |
| Manager-stage clicks alone | **~600** |

Field interviews (Plant Heads, HR PMS, Auditors) confirm:
- ~**60% of KPIs are identical** within a department (Safety, Compliance, Attendance, Dept-level revenue/output, Adherence to SOPs).
- Reviewers score the same value 30+ times in a row — copy-paste fatigue produces drift (σ ≈ 0.6 across employees on what should be identical KPIs).
- A 50-person dept consumes ~90 min of a Manager's time per cycle just at *their* stage.
- Auditor & HR PMS stages compound the loss.

### 1.3 Why current features don't solve it
- **Org KPI propagation** (existing) solves the *Data Owner write-once* case — but only for the **value** entered by the Data Owner. Reviewers (Manager, Auditor, HR PMS, Skip-Level, Management) still grade row-by-row.
- **KPI Mapping Matrix** is admin/configuration tooling, not a scoring surface.
- **Bulk Zero-Score** is a closure tool, not a quality-scoring tool.
- **Unified Scorecard** is single-employee-centric.

### 1.4 Outcome we want
Group-scoped scoring (one input → many employees, with explicit per-cell override) for *every* reviewer stage, preserving POLICY §88 immutability, individual accountability, and the full audit trail.

---

## 2. Objectives (measurable)

| # | Objective | Baseline | Target | Measurement |
|---|---|---|---|---|
| O1 | Cut Manager-stage time per 50-person dept | 90 min | ≤ 15 min (-83%) | UX timing via `system_audit_logs.event_type='STAGE_SESSION_COMPLETED'` |
| O2 | Reduce intra-dept score variance for departmental KPIs | σ ≈ 0.6 | σ ≤ 0.1 | Nightly aggregate on `review_submissions` grouped by `kpi_definition_id`+`department_id` |
| O3 | Auditability of every group write | n/a | 100% rows carry `group_write_batch_id` | Query `review_submissions` where `is_group_override IS NOT NULL` |
| O4 | Regression on POLICY §88 (frozen `final_score`) | 0 | 0 | Hard server-side guard + unit test |
| O5 | Reviewer satisfaction (CSAT) | 3.1 / 5 | ≥ 4.4 / 5 | Quarterly survey |
| O6 | Cycle close lag (last input → Final) | 9 days | ≤ 4 days | `final_score` vs cycle end |

---

## 3. Scope

### In scope (Phase 1)
- Bulk scoring grid for Manager, Auditor, HR PMS, Skip-Level, Management.
- Departmental KPI group type + admin governance.
- Per-cell override with audit linkage.
- Bulk stage transitions ("Approve column" / "Send back column").
- Department × KPI heatmap (Management + Audit roles).
- Mobile fallback (collapses to existing UnifiedScorecard).

### Out of scope (later phases)
- **Phase 2:** Self-review bulk (employees score themselves individually for now).
- **Phase 3:** Cross-department groups (e.g. all Plant Heads org-wide).
- **Phase 4:** AI-suggested group scores.
- Migration of historic individual scores into group form (forward-only, like KPI Standardization Registry).

---

## 4. Functional Requirements

### FR-1 — KPI Group Model
Introduce `kpi_group_type` (column on `kpis`, denormalised to `review_submissions`):

| Value | Meaning | Default policy |
|---|---|---|
| `individual` | Per-employee, no group write allowed | Default for all KPIs |
| `departmental` | Same score applied to all employees in the same dept for that period | Opt-in via admin or auto-detect |
| `org` | Already exists — managed via `org_kpi_data_owners` | Unchanged |

**Auto-detection rule (advisory, never automatic write):**
- If ≥ 70% of employees in a department share the same canonical `kpi_definitions.id` *and* same weightage in the same period, surface a banner: *"Mark as Departmental? (32 of 41 employees in Production share this KPI)"*.
- Admin confirms via `MarkOrgLevelDialog` pattern (renamed `MarkGroupTypeDialog`).

**Governance:** changing `kpi_group_type` mid-cycle triggers the existing `change_org_kpi_scope_cascading` resolver path (reused) and emits an audit row.

### FR-2 — Bulk Scoring Grid (`/review/bulk-scoring`)

```text
                ┌──────── Sticky top: employee chips ────────┐
                │ E1   E2   E3   E4 …  E48  E49  E50         │
┌── Sticky ─────┼────────────────────────────────────────────┤
│ KPI #1 (Dept) │ [ Group: 4.0 ↧ ]                           │
│ ↳ weight 10%  │ 4.0  4.0  4.0  3.5*  4.0 … 4.0  N/A  ✓4.0 │
│ KPI #2 (Indv) │  3   4    5    4    3   … 4    4    5      │
│ KPI #3 (Dept) │ [ Group: 3.5 ↧ ]                           │
│ ↳ weight 15%  │ 3.5  3.5  🔒  3.5  3.5 … 3.5  3.5  3.5    │
└───────────────┴────────────────────────────────────────────┘
         * = override     🔒 = locked     ✓ = approved
```

- **Rows:** canonical KPI (grouped via `canonicalGroupKey`).
- **Columns:** employees in selected scope. Filters: Company → BU → Division → Dept → Designation → Grade → Manager (reuse `OrgFilterCombobox`). State persisted in URL (Dashboard View Persistence memory).
- **Cell:** current best-score (8-stage fallback). Editable only at *reviewer's own stage* per employee, gated by `workflow_config`.
- **Group input** (only for `departmental` rows): typing a value → preview dialog → confirm → fans out via reviewer-stage extension of `propagate_org_kpi_value`.
- **Per-cell override:** editing one cell after a group write keeps the group value elsewhere; cell is flagged `is_group_override=true`, badge appears, audit event `BULK_SCORE_OVERRIDE` written.
- **Reset to group** link on overridden cells.

### FR-3 — Bulk Stage Transition
- New RPC `bulk_advance_workflow_stage(emp_ids uuid[], stage text, period text, year int)`.
- "Approve column" / "Send back column" actions per employee column.
- Hard guards (mirrors single-employee path):
  - Skip rows where `final_score IS NOT NULL` (POLICY §88).
  - Skip rows whose current status is past the reviewer's stage.
  - Skip `is_na=true`.
  - Skip rows sent back to a prior stage (Send-Back Data Preservation).

### FR-4 — Scope Filters
- Reuse the Reports filter stack verbatim.
- "Group view" toggle hides individual KPI rows (and vice versa).
- "Pending only" toggle (default ON for reviewer roles).

### FR-5 — Override & Reconciliation
- New columns on `review_submissions`:
  - `is_group_override BOOLEAN DEFAULT false`
  - `group_write_batch_id UUID NULL` (FK to `bulk_score_batches`)
- "Reset to group" reverts the cell to the latest batch value and clears the override flag.
- Reports (FR-9) expose override rate per reviewer.

### FR-6 — Role-scoped variants

| Role | Visible scope | Editable cells |
|---|---|---|
| Manager | Direct + indirect reports (Merged Team Reviews memory) | Manager stage only |
| Skip-Level | Per `workflow_config.skip_level` chain | Skip-level stage only |
| HR PMS | Full org | HR PMS stage |
| Auditor | Per `audit_kpi_assignments` (Auditor Access Expansion) | Auditor stage |
| Management | Full org | Management stage |
| Admin | Full org, read-only | None (governance view) |

### FR-7 — Notifications
- One batched notification per `group_write_batch_id` (Notification & Dispatch Engine memory).
- Recipient summary: *"Manager Vivek scored 28 KPIs across 30 employees in Production for Apr 2026."*
- Per-employee inbox row collapses to one entry, deep-linked to the bulk batch.

### FR-8 — Heatmap View
- Toggle in grid header.
- Rows = departments; Columns = canonical KPIs.
- Cell colour = avg best-score for the dept × KPI for the period.
- Click → drills into the grid filtered to that dept/KPI.
- Available to Management, Audit, Admin only.

### FR-9 — Reports & Audit
- New report tile **"Group Scoring Activity"** (Reports Hub):
  - Batches per reviewer per period.
  - Override rate per reviewer (quality signal).
  - KPIs marked `departmental` but never used in group write (governance signal).
- Existing `system_audit_logs` filter UI gains `group_write_batch_id` chip.

---

## 5. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | Grid for 50 emp × 30 KPI (1,500 cells) loads ≤ 2s on 3G-Fast. Uses snapshot RPC + virtualised table (`@tanstack/react-virtual`, already in deps). |
| Concurrency | Optimistic locking on `review_submissions.updated_at`; stale-write toast with diff preview. |
| Security | All writes via `SECURITY DEFINER` RPC, role + assignment check (Edge Function Security memory). No client-side `from('review_submissions').update(...)` for bulk paths. |
| Accuracy | Numeric inputs validated against KPI scale & UoM. High-threshold warnings reused from Data Entry Validation Guardrails. R0 governance unchanged. |
| Auditability | 1 summary row in `system_audit_logs` per batch + per-cell rows linked by `group_write_batch_id`. Performer attribution per System Performer Attribution memory. |
| Accessibility | WCAG 2.1 AA. Keyboard nav: arrow keys move between cells; Enter commits; Esc cancels. Screen-reader announces "group applied" vs "override". |
| Mobile | < 768px collapses to single-employee UnifiedScorecard with "Next employee →" pager. |
| Internationalisation | English only (current standard). |
| Backup coverage | New table `bulk_score_batches` automatically included via `get_backup_table_order()` RPC (no allow-list). |

---

## 6. User Workflow

### 6.1 Manager / Reviewer
```text
1. Sidebar → Reviews → "Bulk Scoring" tab
2. Select Period + Scope (default: own dept, current open period)
3. Grid loads (KPI rows × emp cols, status pills per cell, "Pending only" ON)
4. For each departmental KPI row:
     a. Type group score in header input
     b. Preview dialog ("Apply 4.0 to 28 employees, 2 locked, 1 N/A skipped")
     c. Confirm
5. For individual KPI rows: score per cell (keyboard-driven)
6. Override any group cell as needed → amber badge appears
7. Bottom action bar:
     • "Submit selected columns" → batch advance current-stage → next-stage
     • "Send back selected" → opens SendBackDialog (reused) with column list
8. Notifications fan out (batched per batch_id)
```

### 6.2 Auditor
- Same grid, scoped via `audit_kpi_assignments`.
- KPIs not assigned to this auditor are hidden, not greyed.
- Query workflow (existing) attached per cell.

### 6.3 HR PMS / Skip-Level / Management
- Same grid, full org scope, their stage only.
- Management gains "Bulk Approve All Reaching Management" shortcut (extends Management Bulk Approval memory).

### 6.4 Admin
- Read-only grid + Audit log filtered by `group_write_batch_id`.
- Governance panel: mark/unmark KPIs as `departmental`, view auto-detect suggestions, view override-rate leaderboard.

---

## 7. UI / UX Design Concepts

### 7.1 Grid component
- Sticky left column: KPI name (canonical) + KRA + weightage + group/individual chip + frequency badge.
- Sticky top row: employee chips with status dot (workflow stage) + initials avatar + tooltip with full name + employee code.
- Group rows: subtle teal tint; group input + "↧ Apply to all unlocked" inline button.
- Cell states (semantic tokens — no raw colour classes):

| State | Visual |
|---|---|
| `pending` | empty, neutral border |
| `entered` | filled, primary tone |
| `group-applied` | filled, accent-teal tone |
| `override` | filled, amber dot in corner |
| `locked` | grey, padlock icon |
| `na` | dash, muted |
| `approved` | green check, read-only |
| `query-open` | filled, question-mark badge (KPI Query Workflow) |

### 7.2 Bulk action bar (sticky bottom)
- "Apply group values" (count) · "Submit selected columns" (count) · "Send back selected" · "Reset overrides" (admin only).
- `ConfirmDestructiveDialog` for any action affecting > 10 cells (Destructive Action Governance memory).

### 7.3 Heatmap toggle
- Same page, switch button top-right.
- Recharts heatmap, semantic colour ramp from `--muted` (low) to `--primary` (high).

### 7.4 Filter chip stack
- Same look as Reports Hub (Company-Scoped Reporting memory).
- Chips collapse on mobile into a Sheet.

### 7.5 Dashboards per role
- **Manager dashboard tile:** "Bulk scoring saved you ~75 min this cycle."
- **Audit dashboard tile:** "12% of departmental KPIs were overridden — review."
- **Admin dashboard tile:** "5 KPIs detected as candidates for Departmental marking."
- **Management dashboard tile:** "Heatmap → click any cell to drill in."

---

## 8. Data Model

### 8.1 New table — `bulk_score_batches`
```text
id                 uuid PK
period             text          -- 'Apr', 'Q1', etc.
year               int
scope_type         text          -- 'department' | 'org' | 'custom'
scope_id           uuid NULL     -- department_id when scope_type='department'
kpi_definition_id  uuid          -- canonical KPI
stage              text          -- 'manager' | 'auditor' | 'hr_pms' | 'skip_level' | 'management'
applied_value      numeric
is_na              boolean DEFAULT false
performed_by       uuid NULL     -- NULL for system actions (System Performer Attribution)
employee_count     int
override_count     int DEFAULT 0
skipped_count      int DEFAULT 0
skipped_reasons    jsonb         -- {locked: 2, na: 1, past_stage: 0, approved: 0}
created_at         timestamptz DEFAULT now()
```

### 8.2 New columns on `review_submissions`
| Column | Type | Purpose |
|---|---|---|
| `is_group_override` | boolean DEFAULT false | Cell was edited away from a group value |
| `group_write_batch_id` | uuid NULL FK → `bulk_score_batches` | Last batch this cell participated in |
| `kpi_group_type` | text | Denormalised from `kpis` for fast filter |

### 8.3 New column on `kpis`
| Column | Type | Purpose |
|---|---|---|
| `kpi_group_type` | text NOT NULL DEFAULT 'individual' | `individual` / `departmental` / `org` |

### 8.4 Reused, unchanged
- `kpi_definitions` (canonical), `kpi_name_aliases`
- `org_kpi_data_owners` (org-level ownership)
- `workflow_config` (per-employee stage gating)
- `system_audit_logs` (one summary row + per-cell rows linked by batch id)
- `audit_kpi_assignments` (Auditor scoping)
- `get_org_kpi_data_entry_snapshot` RPC pattern (extended for reviewer grid)

### 8.5 No FK to `auth.users`
Per workspace rule — `performed_by` is a profile id; system actions write NULL.

### 8.6 RLS posture
- `bulk_score_batches`: select for admin/auditor/management/hr_pms/manager-on-own-dept; insert via RPC only.
- New `review_submissions` columns inherit existing RLS — no policy change required.

---

## 9. Edge Cases & Scenarios

| # | Scenario | Behaviour |
|---|---|---|
| E1 | Mixed-frequency group (monthly + quarterly KPI same dept) | Group write fans only to employees in active cycle (KPI Frequency Indicators); skipped cycles listed in preview |
| E2 | Late joiner mid-cycle | Snapshot RPC auto-includes; group write applies; `trg_autopull_propagated_org_kpi` back-fills |
| E3 | Employee deactivated after group write | Write succeeds for active set; inactive excluded (Employee Status Management) |
| E4 | Approved cells (`final_score IS NOT NULL`) | Always skipped, listed in preview with reason `approved` |
| E5 | Sent-back KPI in group | Skipped to preserve Send-Back Data Preservation; reason `sent_back` |
| E6 | Mid-cycle weightage change | Bulk session blocked with "Reload — weightage changed" toast |
| E7 | Override then group re-apply | Override survives; only "Reset to group" clears it |
| E8 | Matrix-org employee (multiple depts) | Treated as individual until admin assigns primary dept |
| E9 | Reviewer's own profile in group | Self-row hidden (Reviewer Self-Exclusion memory) |
| E10 | Group write that would zero-score everyone | Confirms via `ConfirmDestructiveDialog` + Bulk Zero-Scoring policy |
| E11 | Concurrent group writes (two managers same dept) | Optimistic lock conflict → second writer sees diff + can re-apply |
| E12 | Daily KPI in a group | Daily aggregation (existing) applies per employee; group write blocked, shown as "Daily — score individually" |
| E13 | KPI is N/A for some employees only | Group write skips N/A cells; counted in `skipped_reasons.na` |
| E14 | Query open on a cell (KPI Query Workflow) | Cell editable but flagged; group write skips cells with open query |
| E15 | Rollback request approved after group write | Rollback (existing flow) clears `group_write_batch_id` on affected cells |

---

## 10. Benefits & Impact

- **Efficiency:** 80%+ reduction in reviewer click-time at scale.
- **Consistency:** Identical KPIs share identical scores by default; intentional differences become *explicit overrides* (signal, not noise).
- **Cycle speed:** Earlier Final → earlier incentive computation → faster payroll integration.
- **Data quality:** Override rate becomes a measurable QA metric per reviewer.
- **Adoption:** Reviewers no longer dread Manager-stage week.
- **Audit posture:** Every group write is a single, queryable batch — easier external/internal audit.

---

## 11. Risks & Mitigation

| Risk | Severity | Mitigation |
|---|---|---|
| Loss of individual accountability | High | Override-on-cell + `is_group_override` flag surfaced everywhere; reports show override % per reviewer; Audit can filter "group-only, never overridden" KPIs |
| Reviewer rubber-stamps group score | Med | Preview dialog forces value review; periodic "spot-check" prompt for reviewers with 0% override rate over 3 cycles |
| POLICY §88 violation (overwriting approved score) | Critical | Server RPC hard-skips `final_score IS NOT NULL`; unit-tested; nightly invariant query |
| Concurrent reviewer double-write | Med | `updated_at` optimistic lock; conflict toast with diff preview |
| Frequency drift (quarterly written in non-cycle month) | Med | Reuse `resolve_terminal_period`; preview lists skipped cycles |
| Notification storm | Med | Batched per `group_write_batch_id`; one inbox row per recipient per batch |
| Over-generalisation (true individual KPIs forced into group) | High | Default = `individual`; admin opt-in; auto-detect ≥ 70% threshold is *advisory only*; cooling-off period before suggestion repeats |
| Group misuse for performance management abuse | High | Override rate report; Audit role can flag dept with 0% override over multiple cycles |
| Mobile reviewers can't access grid | Low | Mobile collapses to UnifiedScorecard pager (Phase 1 acceptable) |
| Backup coverage gap for new table | Critical | `get_backup_table_order()` is allow-list-free (Backup rule); new table auto-included |

---

## 12. Future Enhancements

1. **AI-assisted suggestions** — recommended group score = historical median ± variance band, with explainability.
2. **Cross-department groups** — e.g. all Plant Heads, all Shift Engineers org-wide.
3. **Self-review bulk** — only for employees with multiple identical reportees (e.g. team leads scoring shifts).
4. **Drilldown analytics** — override rate per reviewer × KPI; intra-batch variance.
5. **Mobile-first bulk approve** — swipe-right to approve a column.
6. **Calibration sessions** — multiple managers in same scope co-edit a draft batch (requires Phase 2 realtime).
7. **Group templates** — save a "standard Q1 score set" and reapply next quarter.
8. **Slack / Email recap** — daily digest of group writes for Management.

---

## Appendix A — Reuse Inventory

| Capability | Existing surface | Reused as |
|---|---|---|
| Org-level KPI scoping | `org_kpi_data_owners`, `change_org_kpi_scope_cascading`, `OrgKpiScopeChangeDialog` | Group-KPI master |
| One-value-to-many propagation | `propagate_org_kpi_value` RPC, `usePropagateOrgKpiValue`, `PropagationPreviewDialog` | Bulk score writer |
| Snapshot read | `get_org_kpi_data_entry_snapshot` RPC | Grid loader pattern |
| Status pills | `deriveScopedRowStatus`, `deriveOrgKpiTileStatus` (ADR-055) | Cell status |
| Canonical grouping | `kpi_definitions` + `kpi_name_aliases`, `canonicalGroupKey` | Cross-employee rollup |
| KPI × Emp matrix | `useKpiEmployeeMatrix`, `KpiMappingMatrix` | Grid skeleton |
| Bulk patterns | `BulkTemplateAssignDialog`, `BulkZeroScoreSection`, `BulkGrantAccessDialog` | UX pattern reference |
| Workflow gating | `workflow_config`, ADR-055, POLICY §88 | Per-stage gating |
| Audit trail | `system_audit_logs` | Batch + per-cell linkage |
| Frequency cycle lock | `resolve_terminal_period`, KPI Frequency Indicators | Cycle gating |
| Filter stack | Reports Hub filter chain | Scope filters |
| Destructive confirm | `ConfirmDestructiveDialog` | > 10-cell actions |
| Notifications | Notification & Dispatch Engine | Batched fan-out |

## Appendix B — Open Questions for Stakeholders

1. Auto-detect threshold — 70% confirmed, or configurable per company (multi-company governance)?
2. Override rate alert threshold for Audit — 30%? 50%?
3. Should Skip-Level see group input even if their stage is rarely group-relevant?
4. Mobile: ship the pager fallback in Phase 1, or block bulk on mobile entirely?
5. Self-review bulk: required for shift-team leads in Phase 1, or strictly Phase 2?

## Appendix C — Phasing (post-approval)

| Phase | Scope | Effort (est.) |
|---|---|---|
| 1.0 | Schema + `bulk_advance_workflow_stage` RPC + reviewer-stage extension of propagation RPC | 1 sprint |
| 1.1 | Bulk Scoring Grid (Manager + Auditor roles) | 1 sprint |
| 1.2 | HR PMS, Skip-Level, Management roles + Heatmap | 1 sprint |
| 1.3 | Reports tile + Admin governance + auto-detect | 1 sprint |
| 1.4 | Mobile fallback + accessibility audit | 0.5 sprint |

## Version History

| Version | Date | Author | Notes |
|---|---|---|---|
| 1.0 | 20 May 2026 | Product/HR-Tech | Initial draft for stakeholder review |
