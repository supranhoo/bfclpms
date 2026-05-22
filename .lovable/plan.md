## Goal

Replace `docs/prd/PRD-group-scoring.md` with **v2.0 — Bulk Review Dashboard (Parallel-Stage Review)**, with two hard non-negotiables added on top of the previous draft:

> **A. Strictly additive.** Everything ships alongside existing surfaces. Nothing is removed, no route is hijacked, no current behaviour changes without an explicit Admin opt-in.
>
> **B. Zero negative impact.** Existing flows (Team Reviews, Auditor grid, HR PMS queue, Management approval, Org KPI propagation, Rollback Requests, Self-Review recall, Notifications, Backup) must continue to work bit-for-bit identically when the new dashboard is unused.

These two clauses become **§0 — Non-Regression Contract** at the top of the PRD and gate every other section.

---

## PRD v2.0 — full draft (replaces current file)

```
# PRD: Bulk Review Dashboard (Parallel-Stage Review) — ADDITIVE
Version: 2.0
Supersedes: v1.1 (sequential group-scoring)
Status: Awaiting stakeholder sign-off
Owner: PMS Product
```

### §0 Non-Regression Contract (NEW, top of doc)

This release is **additive only**. Sign-off is conditional on:

1. **No legacy route is removed or redirected** in Phase 1.
   - `/review/team`, `/review/auditor`, `/review/hr-pms`, `/review/management`, `/admin/*`, `/reports/*` stay byte-identical.
   - The new dashboard lives at the **new** path `/review/bulk-scoring`. It is reachable only via a new sidebar entry "Bulk Review (Beta)" gated by an Admin flag.
2. **No existing table column is renamed, retyped, or dropped.** Schema changes are strictly `ADD COLUMN … NOT NULL DEFAULT …` or new tables. Triggers are additive; existing triggers are not modified.
3. **No existing RPC signature is altered.** New behaviour ships as new RPCs (`bulk_*`). Where an existing function must learn a new mode (e.g. `propagate_org_kpi_value`), we ship a **new overload** with an extra param and leave the old signature untouched.
4. **No existing RLS policy is widened or removed.** New RLS is added only on new tables / new columns. RPCs use `SECURITY DEFINER` with internal role checks; underlying tables stay locked down.
5. **No write goes through a code path the legacy UI does not already use**, except through the three new `bulk_*` RPCs. Edits made via the legacy per-employee scorecard remain the source-of-truth path and continue to work whether or not the dashboard exists.
6. **No notification template, email subject, or inbox row format used by legacy flows is changed.** Bulk batches use new templates; legacy single-cell flows stay on existing ones.
7. **Backup / restore coverage is automatic** for new tables via `get_backup_table_order()` — no allow-list edit (Core rule).
8. **Feature flag `feature_bulk_review_dashboard` defaults to `false`** at go-live for every tenant. Admin must explicitly enable. When `false`, no new RPCs are callable from the UI and the sidebar entry is hidden.
9. **Parallel review semantics are gated on the same flag.** With the flag off, the existing sequential stage progression (`status` = last completed stage, sequential reviewer order) is unchanged.
10. **POLICY §88 (Submission Snapshot Immutability) is preserved.** Post-approval re-open is a new, explicit, audited operation requiring a `final_score_revisions` row — it does NOT silently mutate any historical submission. With the flag off, re-open is unreachable.
11. **Regression test gate:** the existing test suites for Team Reviews, Auditor flow, HR PMS flow, Management approval, Org KPI propagation, Rollback Requests, Self-Review recall, Notification Engine, and Backup/Restore must pass unchanged. Build will fail if any legacy snapshot test changes output.
12. **Rollback path:** disable the flag → dashboard hides → legacy flows continue unaffected. No data needs to be unwound; new columns retain their defaults; new tables remain empty or untouched.

Any change request that violates §0 must be rejected at PR review.

---

### 1. Problem
- Reviewers (Manager, Skip, HR PMS, Auditor, Management) currently process KPIs sequentially. Wall-clock per cycle ≈ 21 days with 5–7 idle days per stage.
- Same KPI is scored 4× independently with σ ≈ 0.6 drift across stages.
- Post-approval findings have no formal in-system path; teams use Rollback Requests which clear downstream stages — destructive.
- Large departments (100+ emp × 30–40 KPI) consume 90 min per stage per dept.

### 2. Success Metrics (no regression to legacy metrics)
| Metric | Today | Target (new dashboard usage) | Legacy guard |
|---|---|---|---|
| Cycle wall-clock (Self → Final) | 21 d | ≤ 10 d | Legacy ≥ today |
| Idle days per stage | 5–7 | ≤ 1 | Legacy unchanged |
| Stage-time per dept | 90 min | ≤ 15 min | Legacy unchanged |
| Same-KPI σ across stages | 0.6 | ≤ 0.15 | Reported, not enforced |
| Post-approval findings inside system | 0% | 100% via revisions | Rollback Requests still work |
| POLICY §88 regressions | 0 | 0 (hard guard) | Hard guard |
| Audit-trail completeness | 100% | 100% batch-linked | 100% |

### 3. Scope
**In Phase 1 (flag-gated, additive)**
- New page `/review/bulk-scoring` with full-page dashboard, click-gated load, 25 k cell cap, virtualized grid.
- Parallel reviewer stages after Self gate (Manager, Skip, HR PMS, Auditor) — resolved per employee's `workflow_config` via `get_employee_workflow`.
- Auditor → HR PMS supremacy (Auditor may override HR PMS score on the same KPI; HR PMS may not overwrite Auditor).
- Management Final Approve anytime after Self.
- Post-approval re-open by Admin (always) or Management (flag) — explicit, audited, revision-row.
- New sidebar entry "Bulk Review (Beta)" behind Admin flag.

**Out (Phase 2+)**
- Cross-dept groups, AI suggestions, Daily-frequency bulk, Self-Review bulk entry, mobile bulk view, deprecation of legacy reviewer grids.

### 4. Workflow Model (only active when flag = ON)

#### 4.1 State machine
```text
draft / kra_set
      │ Self submit (employee OR Org KPI Data Entry)
      ▼
self_submitted  ── GATE ──────────────────────────────────────
      │ unlock every stage in this employee's workflow_config
   ┌──┴────┬────────┬────────┐
   ▼       ▼        ▼        ▼
manager  skip    hr_pms   auditor          (run in any order, any time)
                    ▲────── overridden_by ─┤
                                           ▼
                              management_approved (anytime after self)
                                           │ Admin / Mgmt(flag) reopen
                                           ▼
                              reopened (rev N) ──► management_approved (rev N+1)
```

#### 4.2 Per-employee stage set
Resolved via `get_employee_workflow(emp_id, period, year)` (per `mem://architecture/database/per-employee-workflow-resolution`). Templates like `self_l1_audit`, `self_hr_pms`, `self_audit_mgmt`, etc. each project a different parallel set. **No hardcoded stage array.**

#### 4.3 Auditor > HR PMS rule
- HR PMS may set `hr_pms_score` only when `auditor_score IS NULL`.
- Auditor may always set `auditor_score`, AND may set `hr_pms_score` on the same cell with `is_auditor_override_of_hr = true`.
- Universal 8-Stage Fallback already prefers Auditor > HR PMS, so display is correct without extra logic.

#### 4.4 Management Final Approve
- Enabled cell-by-cell or row-by-row as long as `self_submitted = true`.
- On approve: stamp `final_score` from the highest-priority completed stage; non-acted reviewer stages get an audit row `skipped_by_management = true` (not a fake score).
- Bulk-approve uses `ConfirmDestructiveDialog`.

#### 4.5 Post-approval re-open (NEW)
- Triggers: Admin role, OR Management with `mgmt_can_reopen = true`.
- Flow: reason required → choose stages to unlock → cell re-opens → on next approval, insert a `final_score_revisions` row (delta, before/after, reason, batch_id) and bump `final_revision_no`.
- Prior `final_score` is **never deleted**; the revision supersedes via `revision_no`.
- 4-eyes rule for Management: re-opener ≠ next approver. Admin bypasses 4-eyes (audited).
- Notification: inbox + email to employee, manager, original approver.

### 5. UX — Full-Page Dashboard at `/review/bulk-scoring`

Opens empty: filter shell + skeletons. No DB reads until **Load Scope** click.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Bulk Review Dashboard (Beta)         [Period Apr-2026 ▾]  [My Stage ▾] │
├──────────────────────────────────────────────────────────────────────────┤
│ Scope: [Company▾][Division▾][BU▾][Dept▾][Manager▾][KPI Group▾][Tpl▾]   │
│ Filters:[Pending mine▢][Hide N/A▢][Hide approved▢][Variance>0.5▢] [▶]  │
├──────────────────────────────────────────────────────────────────────────┤
│ Stage progress strip (parallel-aware):                                  │
│ Self ████████ 142/142 │ Mgr ██░ 60/142 │ Skip ███ 80/142                │
│ HR PMS ████ 110/142 │ Auditor ██ 55/142 │ Mgmt ░░ 12/142                │
├──────────────────────────────────────────────────────────────────────────┤
│ Tiles: [Pending mine 480][Variance 32][Awaiting Mgmt 312][SLA 8]        │
├──────────────────────────────────────────────────────────────────────────┤
│ Grid (virtualized rows×cols). Cell shows viewer-stage score; hover =    │
│ chip strip "Self 3 · Mgr 3 · HR 2 · Aud 3 · Mgmt –" with names+times.   │
│ Variance badge if max-min completed > 1.0.                              │
│ [Apply to row ▼] [Send back] [Bulk approve]  (role-gated)               │
├──────────────────────────────────────────────────────────────────────────┤
│ Drawer (cell click): KPI history · all stage scores · evidence ·        │
│ observations · audit log · revisions · Re-open (if approved & allowed)  │
└──────────────────────────────────────────────────────────────────────────┘
```

Empty-state copy:
> "Pick a scope and click **Load Scope**. Nothing is fetched until you do — your dashboard stays fast and Cloud-friendly."

### 6. Click-to-Load Architecture

| Tier | Trigger | RPC | Budget |
|---|---|---|---|
| T0 | Page mount | filter options cache | < 400 ms paint |
| T1 | Filter change | `bulk_scope_preview` | < 80 ms p95 |
| T2 | Load Scope click | `bulk_review_snapshot` | < 900 ms p95 |
| T3 | Cell click | `kpi_cell_detail` | < 250 ms |
| T4 | Write | `bulk_write_stage_scores` / `bulk_management_approve` / `bulk_reopen_cells` | < 1.2 s / 100 cells |

Guardrails: 25 k cell cap, 5 MB payload, SWR 5 min, no realtime, manual Refresh pill.

### 7. Data Model (strictly additive)

```sql
-- kpis: new column, default keeps every existing KPI as 'individual'
ALTER TABLE kpis ADD COLUMN kpi_group_type TEXT NOT NULL DEFAULT 'individual'
  CHECK (kpi_group_type IN ('individual','departmental','org'));

-- review_submissions: new columns only, all NOT NULL DEFAULT
ALTER TABLE review_submissions
  ADD COLUMN is_group_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN group_write_batch_id UUID NULL,
  ADD COLUMN is_auditor_override_of_hr BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN skipped_by_management JSONB NULL,
  ADD COLUMN final_revision_no INT NOT NULL DEFAULT 0;

-- New tables (auto-backed-up via get_backup_table_order)
CREATE TABLE bulk_review_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by UUID NULL,
  stage TEXT NOT NULL,
  scope_filters JSONB NOT NULL,
  affected_count INT NOT NULL,
  skipped JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE final_score_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES review_submissions(id),
  revision_no INT NOT NULL,
  prev_final_score NUMERIC NULL,
  new_final_score NUMERIC NULL,
  reason TEXT NOT NULL,
  reopened_stages TEXT[] NOT NULL,
  performed_by UUID NULL,
  batch_id UUID NULL REFERENCES bulk_review_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, revision_no)
);

-- Tenant flag
INSERT INTO admin_feature_flags(key, value)
  VALUES ('feature_bulk_review_dashboard', 'false')
  ON CONFLICT DO NOTHING;
```

**No existing column is altered. No existing RPC signature changes.** Where `propagate_org_kpi_value` needs a `p_stage` argument, ship a **new overload** (Postgres function overloading), leaving the old signature in place for the legacy callers.

### 8. RPCs (all new, `SECURITY DEFINER`, role-checked)

```sql
bulk_scope_preview(p_period, p_year, p_filters)
  RETURNS (emp_count, kpi_count, pending_by_stage JSONB, est_payload_kb);

bulk_review_snapshot(p_period, p_year, p_viewer_stage, p_filters, p_page, p_page_size DEFAULT 200)
  RETURNS JSONB;

bulk_write_stage_scores(p_stage, p_cells JSONB, p_batch_reason TEXT)
  -- Rules:
  --   require self_submitted = true
  --   stage='hr_pms' AND auditor_score IS NOT NULL → reject row
  --   POLICY §88: final_score IS NOT NULL → skip unless reopen ticket present

bulk_management_approve(p_cells JSONB, p_batch_reason TEXT)
  -- Stamps final_score, audits skipped_by_management for non-acted stages
  -- require self_submitted = true

bulk_reopen_cells(p_cells JSONB, p_stages_to_unlock TEXT[], p_reason TEXT)
  -- Admin or Management(reopen). Inserts final_score_revisions row,
  -- bumps final_revision_no, NULLs final_score, unlocks chosen stages,
  -- audits as REOPEN_FINAL_SCORE. 4-eyes guard enforced.

kpi_cell_detail(p_kpi_id, p_emp_id) RETURNS JSONB;
```

All RPCs short-circuit with `RAISE EXCEPTION 'feature disabled'` when `feature_bulk_review_dashboard = false` for the tenant. Defence-in-depth even if the UI accidentally exposes the route.

### 9. Roles & Permissions
| Role | Read | Write | Re-open |
|---|---|---|---|
| Employee | self only — dashboard hidden | Self only | No |
| Manager | direct reports | `manager` | No |
| Skip-Level | indirect reports | `skip` | No |
| HR PMS | org-wide | `hr_pms` (blocked if `auditor_score IS NOT NULL`) | No |
| Auditor | assigned KPIs (Auditor Access Expansion) | `auditor` + override of `hr_pms` | No |
| Management | org-wide | `management` (Final Approve anytime) | Flag |
| Admin | all | all | Always |

### 10. Edge Cases
| # | Case | Handling |
|---|---|---|
| E1 | Mixed-frequency group | Off-cycle KPIs auto-N/A, disabled |
| E2 | Late joiner | Skipped with `no_target_rows`; next period |
| E3 | Inactive employee | Excluded (Core rule) |
| E4 | Mid-cycle weightage change | Locked-period bypass (KPI Weightage Dashboard) |
| E5 | Override then re-apply group | Override preserved unless Reset to group |
| E6 | Cross-dept employee | Filtered; surfaced as `excluded_count` |
| E7 | POLICY §88 finalized cell | Skipped unless reopen ticket present |
| E8 | Sent-back KPI | Read-only badge (Governance Bypass Exceptions) |
| E9 | Concurrent writers | `row_version` check; stale → reject |
| E10 | Empty scope | Banner "No KPIs match" |
| E11 | Cell cap exceeded | Load disabled with guidance |
| E12 | Daily-frequency KPI | Excluded; drawer link to daily entry |
| E13 | Self-Review not submitted | All cells visible; stage writes rejected ("Self pending") |
| E14 | HR PMS tries to write after Auditor | Rejected ("Auditor finalized; ask Auditor to amend") |
| E15 | Mgmt approves with no reviewer scores | Allowed; `final_score = self_score`; audited |
| E16 | Re-open then no new approval before period close | Auto-revert to prior `final_score` at lock; revision marked `auto_reverted=true` |
| E17 | Re-opener = approver | Blocked for Management (4-eyes); Admin allowed (audited) |
| E18 | Bulk notification storm | One inbox row per recipient per `batch_id` |
| E19 | Multi-period aggregation | Read-only (Multi-Period Aggregation policy) |
| E20 | Admin disables flag mid-cycle | Dashboard hides; in-flight RPC calls reject; legacy flows unaffected |
| E21 | User opens dashboard while flag is off | Route shows "Bulk Review is disabled by your administrator" — no RPCs called |

### 11. Risks & Mitigation
| Risk | Mitigation |
|---|---|
| Loss of accountability under parallelism | Per-stage rows + audit + variance badge |
| Mgmt approves before others see KPI | `skipped_by_management` audit + inbox to Manager/HR/Auditor |
| Re-open abused | 4-eyes + reason + immutable revision row + weekly Admin report |
| Auditor overrides HR PMS unfairly | UI badge + inbox to HR PMS + Observation thread |
| RPC complexity | Only 3 write RPCs; unit tests per gate |
| Cache staleness | `row_version` + 5 min SWR + Refresh pill |
| RLS recursion | SECURITY DEFINER helpers per RLS Recursion Management memory |
| Backup gap | Auto via `get_backup_table_order()` |
| Legacy drift | §0 contract + regression test gate |
| Flag accidentally enabled | Default `false`; flag flip audited; tenant-scoped |

### 12. Reuse Map
v1.1 reuses (OrgFilterCombobox, ConfirmDestructiveDialog, SendBackDialog, Sheet, Skeleton, `@tanstack/react-virtual`, Notification Engine), `get_employee_workflow`, `final-score-governance-and-immutability` memory (extended), `kpi-audit-logs-canonical` (new action types: `BULK_STAGE_WRITE`, `BULK_MGMT_APPROVE`, `REOPEN_FINAL_SCORE`, `AUDITOR_OVERRIDE_HR_PMS`), `incentive-score-revisions` pattern for `final_score_revisions`.

### Appendix A — Open stakeholder questions
1. Confirm `feature_bulk_review_dashboard` default = `false` at go-live, opt-in per tenant.
2. 4-eyes rule for Management re-open — confirm.
3. `mgmt_can_reopen` default — `false` (admin-granted) or `true` for all Management?
4. Auto-revert on period close (E16) — keep, or hard-block period close while revisions are open?
5. Variance badge threshold — 1.0 absolute or relative to KPI scale?
6. Confirm Manager / Skip stages remain parallel-eligible when the template includes them.
7. Confirm `final_score_revisions` table name & shape.

### Version History
- **v2.0 (2026-05-22)** — Additive Bulk Review Dashboard with parallel reviewer stages after Self gate, Auditor > HR PMS override, Management anytime-approve, post-approval re-open with `final_score_revisions`, behind `feature_bulk_review_dashboard` flag (default OFF). §0 Non-Regression Contract added. Supersedes v1.1.
- **v1.1 (2026-05-20)** — Full-page dashboard, click-to-load, snapshot RPCs.
- **v1.0 (2026-05-19)** — Initial modal/grid concept.

---

## Companion doc updates (post sign-off)

- `DOCUMENTATION.md` → new "Bulk Review Dashboard" section + state-machine diagram + RPC contract + §0 quote.
- `POLICY.md` → new §121 "Parallel Review & Post-Approval Re-open" + §88 amendment recognising re-open as the only sanctioned post-final mutation; §122 "Additive-Only Release Rule".
- New memory `mem://features/review/bulk-review-parallel-stage` summarising locked invariants + the §0 contract.
- Touch (read-only references): `mem://architecture/pms/universal-scoring-logic`, `mem://features/review/final-score-governance-and-immutability`, `mem://architecture/pms/workflow-status-convention`.

---

## What I need from you to switch to build
1. Confirm Appendix-A questions (especially flag default, 4-eyes, variance threshold).
2. Approve the §0 Non-Regression Contract verbatim.
3. Approve `final_score_revisions` shape.

On approval I will (a) overwrite `docs/prd/PRD-group-scoring.md` with v2.0, (b) create the new memory file, (c) open implementation tickets in order: feature flag → schema → RPCs (flag-guarded) → dashboard shell → grid → drawer → re-open flow → opt-in sidebar entry → regression test gate.