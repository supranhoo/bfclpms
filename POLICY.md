## §111.7 Bulk Review Action Resolver (codified 2026-05-25; cascade addendum 2026-05-25)

The Bulk Review dashboard MUST resolve its bulk-action button via
`src/lib/bulkActionForStage.ts`. Direct role checks (e.g. `effectiveRole === 'management'`)
for the bulk action button are prohibited.

Role → action matrix:

| Effective role | Viewer-stage | Action | RPC |
|---|---|---|---|
| `management` | any | Bulk Approve (Mgmt) — terminal | `bulk_management_approve` |
| `admin` | `management` | Bulk Approve (Mgmt) — terminal | `bulk_management_approve` |
| `admin` | `manager` / `skip_level` / `hr_pms` / `auditor` | Bulk Sign-off (<stage>) | `bulk_write_stage_scores(p_stage)` |
| `manager` / `skip_level` / `hr_pms` / `auditor` | any | Bulk Sign-off (own stage) | `bulk_write_stage_scores(p_stage = own role)` |
| `employee` / unknown / null | any | no button | — |

Intermediate reviewers can only bulk-sign **as themselves** — the viewer-stage
dropdown does NOT let an HR PMS user act as Auditor, etc. Only `admin` may
act on behalf of another stage via that dropdown. Bulk sign-off does NOT
accept per-cell score overrides; the server keeps the previous-stage score
and advances the workflow. Score overrides remain a per-cell action in the
detail drawer. Regression: `src/lib/bulkActionForStage.test.ts`.

### §111.7.a Inheritance cascade & workflow advancement (RCA 2026-05-25)

`public.bulk_write_stage_scores(p_stage, p_cells)` MUST guarantee both:

1. **Inheritance** — when `p_cells[i].score` is NULL/omitted, the RPC writes
   the highest-priority **prior-stage** value into the stage column. Writing
   NULL into `manager_score` / `skip_level_score` / `hr_pms_score` /
   `auditor_score` from a sign-off path is forbidden.

   | Stage acted on | Cascade (first non-null wins) |
   |---|---|
   | `manager`     | `self_score` |
   | `skip_level`  | `manager_score` → `self_score` |
   | `hr_pms`      | `skip_level_score` → `manager_score` → `self_score` |
   | `auditor`     | `hr_pms_score` → `skip_level_score` → `manager_score` → `self_score` |

   When the cascade yields NULL, the cell MUST be skipped with reason
   `no_prior_score` and surfaced in the toast.

2. **Workflow advancement** — after the score loop the RPC MUST call
   `public.reconcile_workflow_statuses(p_kpi_ids := <affected>)` so the
   parent `kpis.status` moves from the just-completed stage to the next
   pending stage in the resolved per-employee workflow. A bulk sign-off that
   stamps a stage score but leaves `kpis.status` unchanged is a defect.

3. Each applied cell MUST insert a `kpi_audit_logs` row with action
   `BULK_STAGE_SIGNOFF_<STAGE>` and `details.inherited_from` recording the
   source stage of the value written.

Toast contract: `summariseSkipReasons` (`src/lib/summariseSkipReasons.ts`)
groups skip reasons (≤2 buckets) inline; falls back to "see audit log" for
3+ distinct reasons.

### §111.7.a.1 Shared remark & evidence persistence (RCA 2026-05-25 v2.66.13.6)

`public.bulk_write_stage_scores(p_stage, p_cells, p_batch_reason, p_attachment_urls)`
MUST persist the shared dialog remark AND any shared supporting evidence onto
the **acted stage's** own columns, not only into batch metadata:

| Stage acted on | Remarks column | Evidence column |
|---|---|---|
| `manager`    | `manager_remarks`    | `manager_evidence_urls` |
| `skip_level` | `skip_level_remarks` | `skip_level_evidence_urls` |
| `hr_pms`     | `hr_pms_remarks`     | `hr_pms_evidence_urls` |
| `auditor`    | `auditor_remarks`    | `auditor_evidence_urls` |

Rules:

- `p_batch_reason` is **mandatory** for stage sign-off (≥ 10 chars after trim) — same UX contract as `bulk_management_approve`.
- When a per-cell `remarks` value is supplied it wins; otherwise the shared `p_batch_reason` is written to the stage remark column.
- `p_attachment_urls` is optional (max 5). When present, each URL is appended to the existing acted-stage evidence array (no overwrite).
- The frontend MUST forward the dialog's `attachmentUrls` to the RPC; discarding them is a defect.
- Cache invalidation MUST also include `bulk_review_snapshot_all` and `bulk_scope_preview` so the matrix and detail drawer never show a stale "current stage" badge after a successful sign-off.

Regression: `src/test/bulkWriteStageScoresContract.test.ts`, `src/test/bulkApproveDialogSignoffMode.test.tsx`.

### §111.7.a.2 Achievement-based 5th-rung fallback & impact preview (v2.66.13.9)

When the 4-rung inheritance cascade (§111.7.a) yields NULL because no prior
stage scored a cell, `public.bulk_write_stage_scores` MUST attempt a 5th
rung: compute a rating from the row's own `kpis` thresholds (R0–R5) and
`review_submissions.achieved_value` via
`public.fn_compute_rating_from_achievement(p_kpi, p_achieved_value)`.

Rules:

- **Per-employee, never shared.** Every cell uses its OWN `kpis` row's Wt%,
  formula (`criteria`, `threshold_mode`, `uom_type`, `uom`) and R0–R5
  thresholds. Two employees with different formulas MUST produce different
  ratings for the same achievement.
- Returns NULL when achievement is missing or no threshold is parseable.
  The cell is then skipped with the existing `no_prior_score` reason.
- Successful compute stamps `kpi_audit_logs.new_value.inherited_from =
  'computed_from_achievement'` for transparency.
- `final_score` immutability (§88) is unaffected — this rung only fires for
  intermediate stage cells whose `final_score IS NULL`.

**Dialog impact preview** — `BulkApproveDialog` in `signoff` mode MUST render
a per-cell + per-employee impact summary (`BulkSignoffPreview.tsx`) built by
`src/lib/bulkSignoffImpact.ts`. The per-employee rollup MUST use
Dashboard-parity weighted-score math (`Σ rating × wt / Σ wt`, `is_na` and
unscored rows excluded — Core memory). The "Sign off" CTA MUST display
`Sign off N of M` when any cell is skipped by the 5-rung cascade, and MUST
disable when no cell is actionable.

Regression: `src/lib/carriedScoreResolver.test.ts`, `src/lib/bulkSignoffImpact.test.ts`.

### §111.7.a.3 Reviewer-entered Achieved/Manual Scores & Admin Override (v2.66.13.10)

The Bulk Sign-off impact preview MUST allow reviewers to fill missing data
and admins to override carried scores directly from the dialog, without
leaving the bulk workflow.

- **Achieved Value (per cell).** A numeric input (or qualitative dropdown
  for binary/tiered KPIs) honouring the row's UoM suffix. When filled, the
  row's rating is recomputed via `resolveWithInputs()` using the row's OWN
  `kpis` thresholds and `criteria` (per-employee — never a shared rule).
- **Manual Score (per cell).** Numeric 0–5, step 0.5. When filled, it wins
  over the Achieved-computed rating and the cascade. Source badge becomes
  `manual`.
- **Admin Override toggle.** Visible only to users with the Admin role.
  When ON, every row becomes editable regardless of carried source. Each
  override write MUST stamp `kpi_audit_logs.new_value.inherited_from =
  'admin_override'` with the prior carried value captured in
  `reason_payload.prev` for traceability. Non-admins MUST never see the
  toggle or its effects.
- **Precedence (highest first):** `manualScore` → `achievedOverride` →
  admin override sentinel (forces required-dot) → 4-rung cascade →
  5th-rung computed-from-achievement.
- **Required-unfilled gating.** The "Sign off" CTA MUST be disabled while
  any row resolves to `{ score: null, source: 'override' }` (admin enabled
  override but left the row blank). Rows resolving to `source: 'none'`
  continue to be skipped (`no_prior_score`) and do not block the CTA.
- **RPC contract.** `public.bulk_write_stage_scores` accepts three new,
  backward-compatible parameters: `p_manual_scores jsonb DEFAULT NULL`,
  `p_achieved_values jsonb DEFAULT NULL`, `p_is_override boolean DEFAULT
  false`. When `p_achieved_values` is present the RPC updates
  `review_submissions.achieved_value` first, then re-runs
  `fn_compute_rating_from_achievement`. `p_manual_scores` bypasses the
  cascade entirely. `p_is_override` switches the audit `inherited_from`
  stamp to `'admin_override'`.

Regression: `src/lib/carriedScoreResolver.test.ts` (manual wins, override
empty row, clamp, N/A short-circuit, cascade fallback),
`src/lib/bulkSignoffImpact.test.ts` (manual override count,
requiredUnfilled flagging, per-employee achieved recompute).

## §111.6 Bulk Scoring KPI Detail RPC Source Contract (RCA 2026-05-25)

The Bulk Scoring detail/write-as-Manager drawer RPC (`kpi_cell_detail`) MUST source organization KPI detail metadata from `public.org_kpi_values`. The obsolete `public.org_kpis` relation MUST NOT be referenced or recreated as a compatibility shim. Category display in this drawer MUST come from the mapped employee KPI (`kpis.category_id`) joined to `kra_categories`, so category visibility remains tied to the KPI row actually being reviewed. Workflow metadata MUST use the supported `get_employee_workflow(employee, period, year)` helper and degrade gracefully if workflow resolution fails. Regression: `src/test/kpiCellDetailContract.test.ts`.

## §111.5 Org KPI Category Chip Parity (RCA 2026-05-11)

The category-header chip aggregator (`OrgKpiDataEntry.tsx`, "X Pending / X Entered / X Propagated") MUST share the ADR-055 fact-based override with the per-row pill (`deriveScopedRowStatus`) for **every** scope — `organization`, `employee`, and `department`. Specifically: when no `org_kpi_values` row carries a value but every mapped child KPI has advanced past `kra_set`, the chip MUST report `'propagated'`, not `'pending'`. Implemented in `src/lib/orgKpiStatus.ts::deriveOrgKpiTileStatus`. Regression: `src/test/orgKpiTileStatusChipParity.test.ts`.

## §111.3 Propagated Status — Snapshot Truth (RCA 2026-05-08)

Per-row "Propagated" status on the Org KPI Data Entry page MUST be derived
from the snapshot RPC `get_org_kpi_data_entry_snapshot.propagatedEmpIdsByKey`.

- A row is `propagated` iff the employee id appears in that set, OR
  `org_kpi_values.status = 'approved'` (approved override).
- The browser-side `useOrgKpiSubmissionFallback` hook MAY supplement the
  display value but MUST NOT be the sole source of the badge.
- The header summary (`X propagated / Y not propagated`) is computed from
  the same `ScopedRow.status` values and remains visible whenever any
  row carries a value, including one-sided distributions (50/0).
- Any local copy of `data.scopedRows` (e.g. `OrgKpiEntryCard.scopedValues`)
  MUST sync the non-editable `status` field from the latest snapshot on
  every refetch, even while the user is editing other fields. The row
  identity guard (`scopedRowsSignature`) MUST therefore include `status`
  so an `entered → propagated` flip is detected as a real change. Without
  this, a successful Propagate leaves the header stuck at
  "0 propagated / N not propagated" because the id set is unchanged.
  Regression: `src/test/orgKpiCounts.test.ts` ("status flips entered -> propagated").
- **RCA-2026-05-09 — ADR-055 parity per row.** The fact-based "every
  child has advanced past `kra_set`" override (ADR-055) applies to BOTH
  the card-level pill AND the per-row pill in the scoped table. Anywhere
  the UI labels a row "Propagated", it MUST consult `kraSetEmpIdsByKey`
  first via `deriveScopedRowStatus()` (`src/lib/orgKpiStatus.ts`).
  `isPastKraSet` (i.e. `kpis.status !== 'kra_set'`) dominates the
  OKV.status / snapshot-set / submission-fallback signals. Without this,
  any employee whose child KPI advanced through a path that didn't
  populate `propagatedEmpIdsByKey` (legacy propagation, repair RPC,
  sibling percolation, manual admin save) shows as "Not propagated"
  while the card and the scorecard correctly show Propagated /
  Manager Check. Regression: `src/test/orgKpiScopedRowStatus.test.ts`.

Rationale: independent browser joins drift from the snapshot whenever
normalization, RLS, or query coverage diverges, which produced the
"0 propagated / 50 not propagated" regression even after every employee
was successfully propagated.
# PMS — Business Policy Document

> **Version:** 2.21.9 — **§97 Org KPI exclusion from employee Pending-KRA issue flags.** Unified Issues / pending-KRA compliance surfaces MUST NOT classify `kpis.is_org_level = true` rows at `kra_set` as employee pending-KRA acceptance failures. Org KPI `kra_set` means the row is awaiting Data Owner value entry/propagation, not employee self-action. Non-terminal multi-month placeholder rows are also excluded from pending-KRA issue flags because only the terminal month is actionable. **§96 retained:** Org KPIs bypass self-review column scoring.
>
> **Version:** 2.21.8 — **§96 Org KPI Self-column rendering.** Org KPIs (`kpis.is_org_level = true`) bypass the self-review stage by design — the achieved value is supplied by the Data Owner via `org_kpi_values`, never via `review_submissions.self_score`. The reviewer scorecard (`KpiDetailsTable`) MUST therefore render the Self column for Org KPIs as a muted em-dash with an explanatory tooltip ("Self-review is not collected for Org KPIs. The achieved value is provided by the Data Owner."), and MUST NOT render the amber "N/A" badge in that cell. Genuine N/A submissions (`review_submissions.is_na = true`) continue to surface as "N/A" and take precedence over the bypass branch. **§95 retained:** reviewer-stage rosters MUST include employees whose `review_submissions` row carries the completed-stage score signature, in addition to those currently AT the stage. **§94 retained:** reviewer dashboards must expose a manual refresh that invalidates employee, KPI, and submission-score caches together. **§93 retained:** Org KPI "Stuck" requires propagated/approved OKV plus an in-scope child still in `kra_set`.
>
> **Version:** 2.21.7 — **§95 Reviewer roster score-signature seed.** Any reviewer-stage roster (HR PMS, Audit, Management — and by extension Manager / Skip-Level when surfaced as a "Reviewed" count) MUST include employees whose `review_submissions` row for the selected period carries the completed-stage score signature (`hr_pms_score`, `auditor_score`, `management_score`, `manager_score`, `skip_level_score` respectively), in addition to employees currently AT the stage. Reviewed-stat counters that intersect period KPIs with the visible roster will silently report `0` if this seed is missing, because already-reviewed KPIs belong to employees who have advanced past the stage. **§94 retained:** reviewer dashboards must expose a manual refresh that invalidates employee, KPI, and submission-score caches together. **§93 retained:** Org KPI "Stuck" requires propagated/approved OKV plus an in-scope child still in `kra_set`. **§92 retained:** slim PostgREST selects must be verified against `information_schema.columns`.

> **Last Updated:** 2026-04-23  
> **Version:** 2.21.6 — **§94 Reviewer dashboard manual-refresh contract.** Every reviewer grid surface (HR PMS, Audit, Management, Team Reviews, Skip-Level, Pending Self/Manager/Skip review) MUST expose a manual **Refresh** control in the grid header. The control MUST invalidate, in a single action, every cache feeding both the stat-card counters (Total Employees, Pending Review, In Review, Reviewed, Total KPIs) AND the per-employee progress bars/badges — i.e. employee profile lists, `kpis-by-period-ranges`, and `review-submission-scores`. The control MUST display an in-flight indicator (spinning icon) and be disabled while any of those queries are still fetching, to prevent request storms. Auto-refetch behaviour (realtime sync, polling) is NOT a substitute and MUST remain in place alongside the manual control. **§93 retained:** An Org KPI card / Pending Report row may be classified **Stuck** ONLY when BOTH conditions hold: (a) the `org_kpi_values` row's `status` is `propagated` or `approved`, AND (b) at least one in-scope child `kpis` row is still in `kra_set`. The check must be scope-aware.
>
> **Version:** 2.21.4 — **§91 Reviewer dashboard data contract.** The slim KPI column projection used by reviewer dashboards (`SLIM_KPI_SELECT` in `src/hooks/useKpis.ts`) MUST include all five stage-score signature columns: `manager_score`, `skip_level_score`, `hr_pms_score`, `audit_score`, `management_score`. Reviewer-stage progress bars (HR PMS, Audit, Management) MUST derive their "done" segment from the relevant score signature so they remain consistent with the corresponding "Reviewed" stat-card counter, and their numeric label MUST display `done/total` for those views (not `clearedKraSet/total`).
>
> **Version:** 2.21.1 — User Management list (`/admin/users`) shows **all** users by default (active + inactive). The Status filter (All / Active / Inactive) governs the view; inactive rows are visually muted with a red **Inactive** badge so admins can discover and reactivate deactivated accounts without DB access. Other employee pickers/selectors continue to filter by `is_active=true` for assignment integrity.
>
> **Version:** 2.21.0 — Compute engine no longer references non-existent `profiles.location`; PostgREST errors now surface as HTTP 500 instead of silent zero-result. Edge functions must check `error` on every Supabase query (silent destructuring of `data` is forbidden).
> **Maintainer:** Lovable AI  
> **Companion Document:** [DOCUMENTATION.md](DOCUMENTATION.md) (Technical Reference)

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Roles & Permissions](#2-roles--permissions)
3. [Review Workflow Policy](#3-review-workflow-policy)
4. [Submission Policies](#4-submission-policies)
5. [Scoring & Rating Policy](#5-scoring--rating-policy)
6. [Remarks Policy](#6-remarks-policy)
7. [N/A (Not Applicable) Policy](#7-na-not-applicable-policy)
8. [Query & Escalation Policy](#8-query--escalation-policy)
9. [SLA Thresholds](#9-sla-thresholds)
10. [Observation Policy](#10-observation-policy)
11. [Org-Level KPI Policy](#11-org-level-kpi-policy)
12. [Rollback Policy](#12-rollback-policy)
13. [Performance Improvement Plan (PIP) Policy](#13-performance-improvement-plan-pip-policy)
14. [Training Needs Identification (TNI) Policy](#14-training-needs-identification-tni-policy)
15. [Password & Security Policy](#15-password--security-policy)
16. [Data Backup & Retention Policy](#16-data-backup--retention-policy)
17. [Export & Report Access Policy](#17-export--report-access-policy)
18. [Admin Configurable Settings Reference](#18-admin-configurable-settings-reference)
19. [Admin NA Score Clearing Policy](#19-admin-na-score-clearing-policy)
20. [Auto KRA Rollover Cron Schedule](#20-auto-kra-rollover-cron-schedule)
21. [Frequency Period Auto-Resolution Policy](#22-frequency-period-auto-resolution-policy)
22. [Version History](#23-version-history)

---

## 1. Purpose

This document serves as the **single source of truth** for all business rules, workflow logic, and configurable policies governing the Performance Management System (PMS). Any code change that modifies business behavior **must** be reflected here.

---

## 2. Roles & Permissions

### 2.1 Role Definitions

| Role | Code | Scope |
|------|------|-------|
| Employee | `employee` | View own KPIs, submit self-review, raise queries |
| Manager | `manager` | Review direct & skip-level reports, approve/send-back/query KPIs |
| Skip-Level Manager | *(derived)* | Automatically determined via `reporting_manager_id` chain; reviews indirect reports |
| HR PMS | `hr_pms` | Conducts HR PMS Review stage; can view all KPIs and queries |
| Auditor | `auditor` | Validates assessments, ensures compliance; can assign audit KPIs |
| Management | `management` | Final approval authority; organizational oversight |
| Admin | `admin` | Full system access; user/config/data management |

### 2.2 Admin Role Switch ("View as My Role")

- Admins can toggle between "Admin View" and their natural hierarchical role (Manager/Employee)
- Only affects UI visibility — database permissions (`user_roles`) remain `admin`
- Persisted in `localStorage` (key: `pms_admin_mode`)

### 2.3 Role Assignment

- Roles are assigned via User Management (`/admin/users`)
- Each user has exactly one role in `user_roles`
- The `hr_pms` role is manually assignable by admins
- The `manager` role is implicitly derived when an employee has direct reports

---

## 3. Review Workflow Policy

### 3.1 Standard Workflow Stages

```
KRA Set → Self Review → Manager Check → [Skip-Level Check] → [HR PMS Review] → Audit → Management Review → Approved
```

Stages in brackets `[]` are optional and configurable per workflow template.

### 3.2 Configurable Workflow Templates

- Admins can create workflow templates with custom stage sequences
- Templates are assigned to employees via `workflow_config` (by department, designation, or individual)
- The default template includes: `self_review → manager_check → audit → management_review → approved`

### 3.3 Status Transitions

| From Status | Action | To Status | Who |
|-------------|--------|-----------|-----|
| `kra_set` | Submit self-review | `self_review` | Employee |
| `self_review` | Manager approves | Next stage per workflow | Manager |
| `self_review` | Manager sends back | `kra_set` | Manager |
| `manager_check` | Next reviewer forwards | Next stage per workflow | Auditor/HR PMS/Skip-Level |
| `management_review` | Management approves | `approved` | Management |
| Any stage | Raise query | No status change | Any reviewer |

### 3.5 Sent-Back KPI Governance Bypass

When a reviewer sends back a KPI, its status reverts to `kra_set`. If the employee's governance permissions (Edit KPI / Self Review) are disabled, the system **still allows** the employee to edit and resubmit a sent-back KPI. This is detected when `status === 'kra_set'` **and** a prior submission exists for that KPI.

- **Fresh KPIs** (`kra_set` with no submission): Governed by standard role permissions — if Edit KPI / Self Review are disabled, the KPI remains read-only (unless it is a daily-frequency KPI; see §3.6).
- **Sent-back KPIs** (`kra_set` with existing submission): Governance lock is bypassed; employee can update data and resubmit.
- A visual banner informs the employee that the KPI was sent back for revision.

### 3.6 Daily-Frequency KPI Governance Bypass

Daily-frequency KPIs require continuous data entry throughout the month. When governance locks disable "Edit KPI" or "Self Review" for the Employee role, daily KPIs at `kra_set` status are **exempt** from these restrictions.

- **Scope:** Only KPIs with `frequency = 'daily'` and `status = 'kra_set'`.
- **Behavior:** The `SelfReviewSheet` bypasses `isGovernanceLocked` when `isDailyUnlocked` is true.
- **UI:** A blue info banner ("Daily data entry is permitted for this KPI even during restricted review periods.") is displayed when the bypass is active.
- **Security:** Employees can only edit their own KPIs (RLS enforced). The bypass does not affect other roles or frequency types.
- **Hard-lock precedence:** This bypass applies **only to governance-level restrictions** (role permission toggles). It does **NOT** override period hard-locks (`is_period_locked = true`). When a period is hard-locked, daily KPIs are blocked like all other KPIs — only admins can modify data in hard-locked periods.

### 3.4 Review Period Locking

- Admins can lock a review period via Review Periods page
- Locked periods prevent further status changes and submissions
- Checked via `is_period_locked()` database function

---

## 4. Submission Policies

### 4.1 Daily/Weekly KPI Two-Level Submission

**Level 1 — Sub-Period Entries:**
- Individual day/week values saved to `sub_period_submissions`
- No workflow status change
- Resubmission allowed (with reason if `require_resubmit_reason` is enabled on the KPI)

**Level 2 — Monthly Aggregated Submission:**
- "Submit Month" aggregates sub-period entries into `review_submissions`
- Status transitions from `kra_set` → `self_review`
- **Month-end gate:** Submit Month button is disabled while the review month is still active; unlocks on the 1st of the following month

### 4.2 Submission Window

| Setting | Default | Admin-Configurable |
|---------|---------|-------------------|
| `daily_submission_window_days` | 2 days | Yes (1–60 days) |
| `resubmission_grace_hours` | 0 hours | Yes (0–72 hours) |
| `working_days_per_month` | 22 days | Yes (18–26 days) |

- Only dates within the submission window are selectable in the SubPeriodSelector
- Per-employee working days can be overridden via `employee_working_days` table

### 4.3 Evidence Upload

| Setting | Default | Admin-Configurable |
|---------|---------|-------------------|
| `require_evidence_default` | `false` | Yes |

- Multi-file upload supported via `review-evidence` storage bucket
- Evidence URLs stored in `self_evidence_urls` / `manager_evidence_urls` arrays

---

## 5. Scoring & Rating Policy

### 5.1 Rating Scale

| Score | Label | Level | Color |
|-------|-------|-------|-------|
| 5 | Outstanding | Blue | `#3B82F6` |
| 4 | Exceeds Expectations | Green | `#10B981` |
| 3 | Meets Expectations | Yellow | `#F59E0B` |
| 2 | Below Expectations | Red | `#EF4444` |
| 1 | Needs Improvement | Red | `#DC2626` |
| 0 | Not Achieved | Red | `#991B1B` |

### 5.2 Score Calculation by UOM Type

| UOM Type | Input | Calculation |
|----------|-------|-------------|
| `numeric` | Number | Compared against R5–R0 thresholds |
| `binary` | Yes/No | Yes = R5 (5), No = R0 (0) |
| `tiered` | Dropdown option | Admin-defined rating per option (0–5) |

### 5.3 Threshold Modes

- **Absolute:** Achieved value compared directly to R5–R0 values
- **Percentage:** Achieved value compared as % of target to R5–R0 percentage values

### 5.4 Overall Rating Formula

```
overallRating = Σ(score × weightage) / Σ(effectiveWeightage)
```

- N/A KPIs excluded from **both** numerator and denominator
- Unscored KPIs (all score fields NULL across all 8 stages) excluded from **both** numerator and denominator — identical to N/A treatment (§70)

### 5.5 Daily Binary KPI Scoring (Missed Days Penalty)

```
Total No = Missed Days + "No" Submissions
0 No → 5, 1 No → 4, 2 No → 3, 3 No → 2, 4 No → 1, >4 No → 0
```

Both non-compliance ("No") and non-submission (missed days) are equally penalized.

---

## 6. Remarks Policy

### 6.1 Mandatory Remarks by Review Level

Remarks can be made mandatory independently for each review level. This is controlled via `workflow_settings` (category: `validation`).

| Setting Key | Label | Default | Admin-Configurable |
|-------------|-------|---------|-------------------|
| `remarks_mandatory_self` | Mandatory remarks for Self Review | `true` | Yes |
| `remarks_mandatory_manager` | Mandatory remarks for Manager Review | `true` | Yes |
| `remarks_mandatory_skip_level` | Mandatory remarks for Skip-Level Review | `true` | Yes |
| `remarks_mandatory_hr_pms` | Mandatory remarks for HR PMS Review | `true` | Yes |
| `remarks_mandatory_auditor` | Mandatory remarks for Auditor Review | `true` | Yes |
| `remarks_mandatory_management` | Mandatory remarks for Management Review | `false` | Yes |

### 6.2 Enforcement Behavior

- When mandatory: Label shows red asterisk (`*`)
- Attempting to submit without remarks shows toast: "Remarks are required for [Level] review"
- Submit/approve button remains clickable — validation on click with clear feedback
- Applies to: `SelfReviewSheet`, `UnifiedScorecard`, `EmployeeScorecard`

### 6.3 Enforcement Points

| Component | Level | Validation Location |
|-----------|-------|-------------------|
| `SelfReviewSheet.tsx` | Self | `handleSubmitReview()`, `handleSubmitMonthlyReview()` |
| `UnifiedScorecard.tsx` | Manager, Skip-Level, HR PMS, Auditor, Management | `handleSubmitForReview()` |
| `EmployeeScorecard.tsx` | Manager | `handleSubmitReview()` |

---

## 7. N/A (Not Applicable) Policy

### 7.1 Employee-Initiated N/A

- Employee marks KPI as N/A during self-review
- Must provide a reason with minimum character count

| Setting | Default | Admin-Configurable |
|---------|---------|-------------------|
| `na_reason_min_chars` | 50 chars | Yes (10–200 chars) |

### 7.2 Reviewer-Initiated N/A

- Any reviewer can mark a non-NA KPI as N/A
- Must provide a reason (mandatory)
- KPI is forwarded to the next stage with `is_na = true`
- Audit log records the action with `na_marked_by_role`

### 7.3 N/A Override (Reviewer)

- Reviewer can override an existing N/A marking (make KPI applicable again)
- Must provide override remarks and a score
- Sets `is_na = false`, clears `na_marked_by_role`
- Audit log records the override action

### 7.4 N/A Confirmation

- If reviewer does not override, they must confirm the N/A status
- Audit log records confirmation

---

## 8. Query & Escalation Policy

### 8.1 Query Workflow

- Any reviewer can raise a query against a KPI
- Query does **not** change the KPI status
- Queries are tracked in `kpi_queries` with auto-generated ticket numbers (`Q-XXXXX`)
- Both raiser and receiver can view query; managers/auditors/hr_pms/management can view team queries

### 8.2 Send Back

- Reviewers can send back a KPI to a previous stage
- Send back targets are determined by the workflow template
- Requires a mandatory reason
- KPI status reverts to the target stage

---

## 9. SLA Thresholds

All SLA thresholds are admin-configurable via System Settings → Workflow Settings.

| Issue Type | Warning (days) | Critical (days) | Setting Keys |
|------------|---------------|-----------------|-------------|
| Open Query | 5 | 10 | `query_sla_warning_days`, `query_sla_critical_days` |
| Stalled KPI | 14 | 30 | `stalled_kpi_warning_days`, `stalled_kpi_critical_days` |
| Pending KRA | 7 | 14 | `pending_kra_warning_days`, `pending_kra_critical_days` |
| Training Need | 14 | 30 | *(hardcoded)* |
| PIP | 7 | 14 | *(hardcoded)* |
| PIP Milestone | 0 | 7 | *(hardcoded)* |

---

## 10. Observation Policy

| Setting | Default | Admin-Configurable |
|---------|---------|-------------------|
| `max_observation_impact` | 5 points | Yes (1–5) |
| `self_observation_auto_apply` | `false` | Yes |

- Observations are feedback entries attached to KPIs
- Types: Positive, Concern, Neutral
- Support reply threads (`kpi_observation_replies`)
- Auto-generated ticket numbers (`OBS-XXXXX`)
- Visibility controls: observer can set visibility scope
- Configurable roles for who can add observations

---

## 11. Org-Level KPI Policy

### 11.1 Scoping

| Scope | Description |
|-------|-------------|
| `organization` | Single value for entire organization |
| `department` | Value per department |
| `employee` | Value per individual employee |

### 11.2 Propagation

- Admin/Data Owner enters org KPI value in `org_kpi_values`
- Propagation inserts/updates `review_submissions` for all affected employees
- Uses `INSERT ... ON CONFLICT UPDATE` pattern

### 11.3 Propagation Without Rollback (Risk)

- Higher-level scores (manager_score, auditor_score, etc.) are **NOT** cleared
- KPI status remains unchanged
- **Risk:** If KPI has progressed past `self_review`, existing reviewer scores remain based on old data

### 11.4 Rollback

- **Rollback (scope):** Clears `review_submissions` data and resets KPI status to `kra_set` for the current scope
- **Rollback All Scopes:** Same but for every employee assigned to that Org KPI
- **Recommendation:** Use rollback when the base metric changes after KPIs have progressed beyond `self_review`

### 11.5 Data Ownership

- Data owners are assigned per Org KPI via `org_kpi_data_owners`
- Data owners can enter values and propagate for their assigned KPIs
- Access controlled via RLS policies

### 11.6 Bulk Review Org-GAP Indicator

- Bulk Review may display an `ORG · gap` indicator only when the complete loaded row has a mixed org-level mapping state.
- Org-flag lookups for large scopes MUST be batched; missing lookup rows caused by client/API limits must not be treated as a real mapping gap.
- Manual Refresh must invalidate both the matrix snapshot and the org-flag lookup so corrected mappings are visible without realtime.

---

## 12. Rollback Policy

### 12.1 User-Initiated Rollback Requests

- Any user can request a rollback of a KPI to a previous status
- Request logged in `kpi_rollback_requests` with reason
- Status: `pending` → `approved` / `rejected` / `expired`
- Another user (not the requester) must action the request

### 12.2 Rollback Request Visibility

- Pending rollback requests are shown as banners on KPI review sheets
- All authenticated users can view rollback requests
- Only non-requesters can approve/reject

---

## 13. Performance Improvement Plan (PIP) Policy

### 13.1 PIP Lifecycle

```
Draft → Pending HR Approval → Active → [Extended] → Completed / Cancelled
```

### 13.2 PIP Outcomes

| Outcome | Description |
|---------|-------------|
| Successful | Employee met improvement targets |
| Partially Successful | Partial improvement achieved |
| Unsuccessful | Targets not met |

### 13.3 PIP Access Control

| Action | Who |
|--------|-----|
| Create | Manager (for direct reports), Admin, Management |
| View | Employee (own), Manager (initiated or team), Admin, Management |
| Update | Admin, Management, Initiating Manager |
| Delete | Admin only |

### 13.4 PIP Milestones

- Each PIP can have multiple milestones with dates and expected outcomes
- Status: `pending` → `met` / `partially_met` / `not_met`
- Reviewed by manager or admin

---

## 14. Training Needs Identification (TNI) Policy

- Automatically detected based on performance scores below threshold
- Triggered via `detect_training_needs_for_period()` function
- Gap types: `skill`, `knowledge`, `behavior`
- Priority levels: `low`, `medium`, `high`, `critical`

---

## 15. Password & Security Policy

| Setting | Default | Admin-Configurable |
|---------|---------|-------------------|
| `password_min_length` | 6 chars | Yes (6–16 chars) |

### 15.1 Password Management

- **Self-Service Reset:** Via "Forgot Password" on login page (rate limited: 1/60s)
- **Admin-Initiated Reset:** Via User Management with two options:
  1. Generate Reset Link
  2. Set Direct Password
- **Bulk Password Rollout:** Auto-generate and distribute credentials for new employees

### 15.2 Row-Level Security (RLS)

- All 46+ public tables have RLS enabled
- Key patterns: own-data, team-data (manager), role-based, admin-full-access
- `workflow_settings`: All authenticated users can read; only admins can update
- `app_settings`: Public read (login branding); admin update only

---

## 16. Data Backup & Retention Policy

### 16.1 Backup Coverage

- **All public tables** (81) must be included in backup/restore functions
- Any new table migration must update backup functions in the same change

### 16.2 Backup Types

| Type | Trigger | Retention | Architecture |
|------|---------|-----------|--------------|
| Manual | Admin clicks "Backup Now" | Indefinite | Client-orchestrated multi-phase (INIT → batch loop with retry → FINALIZE) |
| Scheduled | pg_cron (Daily/Weekly/Monthly) | Indefinite | Self-contained single-invocation with 100s time guard; partial success if time exceeded |
| Uploaded | Admin uploads external backup file | Indefinite | N/A |

### 16.3 Restore Policy

- Double-confirmation required for any restore
- Warnings displayed if FK constraint issues occur
- `auth.users` excluded (managed by auth system)

### 16.4 Reliability Guarantees

- **Manual backups**: Each batch (9 tables) is independently retryable up to 2 times. Failed batches do not block other batches.
- **Scheduled backups**: Time guard ensures the function never exceeds CPU limits. Partial backups are logged with status `partial` and include a manifest of completed tables.
- **No orphaned backups**: Failed finalization marks the log as `failed`. Stuck backups (running > 30 min) are auto-cleaned on next invocation.

---

## 17. Export & Report Access Policy

### 17.1 KRA Export

- Export permissions, visible columns, and PDF layout are configurable via `workflow_settings` (category: `export`)
- Role-based access for export functionality

### 17.2 Report Access Overrides

- Admins can grant specific users View or Download access to reports
- Override users gain full SELECT access to `kpis`, `review_submissions`, `profiles` via `has_report_access_override()` function
- Read-only (SELECT only), explicitly admin-granted

### 17.3 Workflow-Aware Score Display (Invariant)

- **Reports MUST NOT display scores for workflow stages that do not exist in the employee's resolved workflow.**
- If a role's stage (e.g., `audit`, `management_review`, `skip_level_check`, `hr_pms_review`) is absent from the employee's month-specific workflow, the corresponding score column MUST show `—` (null), even if a value exists in the database (e.g., from admin data entry for a non-workflow role).
- For non-approved KPIs, `finalScore` must be recalculated using only in-workflow scores after blanking out-of-workflow scores.
- For approved KPIs, `final_score` from the database is authoritative (already validated at approval time).
- This invariant applies to all reports displaying per-role scores: KPI Detail Report, and should be extended to other reports as needed.

### 17.4 Rollback & Re-Submission Data Clearing (Invariant)

- **When a rollback is approved**, all reviewer fields (score, rating, remarks, evidence, achieved_value) for stages AFTER the `target_status` in the canonical stage ordering MUST be set to `null`. `final_score` and `final_rating` MUST also be cleared.
- **When a reviewer re-submits after a rollback**, the `submitReview` mutation MUST clear all reviewer fields for stages AFTER the current `activeReviewStage`. This prevents stale downstream data from persisting.
- The canonical stage ordering for clearing purposes is: `self_review → manager_check → skip_level_check → hr_pms_review → audit → management_review`.
- This invariant prevents the dashboard and review journey from displaying stale scores from a prior review cycle that was rolled back.

### 17.5 Reconciliation Must Be Cycle-Aware (Invariant)

- The `reconcile_workflow_statuses` function MUST NOT advance a KPI based on a downstream score that predates the most recent rollback or send-back to the current status.
- **Branch 3 (Review-Stage Mismatch):** Before advancing a KPI, the reconciler MUST verify that no rollback/send-back audit log targeting the current status exists with a timestamp newer than the submission's `updated_at`. If such a log exists, the downstream score is stale and the KPI MUST be skipped.
- **Approval final_score sync:** When the reconciler approves a KPI, `final_score` and `final_rating` MUST be set from the terminal stage's score (determined by the employee's month-specific workflow), NOT a generic COALESCE fallback chain. An ELSE fallback to COALESCE is permitted only for unrecognized terminal stages.
- This invariant prevents the reconciler from re-approving KPIs with stale post-rollback scores.

---

## 18. Admin Configurable Settings Reference

All settings below are managed via **System Settings → Workflow Settings** and stored in `workflow_settings` table.

### Submission Windows (category: `submission`)

| Key | Default | Range | Unit |
|-----|---------|-------|------|
| `daily_submission_window_days` | 2 | 1–60 | days |
| `resubmission_grace_hours` | 0 | 0–72 | hours |
| `working_days_per_month` | 22 | 18–26 | days |

### SLA Thresholds (category: `sla`)

| Key | Default | Range | Unit |
|-----|---------|-------|------|
| `query_sla_warning_days` | 5 | 1–14 | days |
| `query_sla_critical_days` | 10 | 3–30 | days |
| `stalled_kpi_warning_days` | 14 | 7–30 | days |
| `stalled_kpi_critical_days` | 30 | 14–60 | days |
| `pending_kra_warning_days` | 7 | 3–14 | days |
| `pending_kra_critical_days` | 14 | 7–30 | days |

### Validation Rules (category: `validation`)

| Key | Default | Type |
|-----|---------|------|
| `na_reason_min_chars` | 50 | number (10–200) |
| `require_evidence_default` | `false` | boolean |
| `password_min_length` | 6 | number (6–16) |
| `remarks_mandatory_self` | `true` | boolean |
| `remarks_mandatory_manager` | `true` | boolean |
| `remarks_mandatory_skip_level` | `true` | boolean |
| `remarks_mandatory_hr_pms` | `true` | boolean |
| `remarks_mandatory_auditor` | `true` | boolean |
| `remarks_mandatory_management` | `false` | boolean |

### Observation Settings (category: `observation`)

| Key | Default | Type |
|-----|---------|------|
| `max_observation_impact` | 5 | number (1–5) |
| `self_observation_auto_apply` | `false` | boolean |

### Export Settings (category: `export`)

Configured via role arrays and column arrays in `workflow_settings`.

---

## 19. Admin NA Score Clearing Policy

When an admin marks a KPI as **N/A** via the Admin Data Entry dialog:
- All scoring fields are **nullified**: `final_score`, `final_rating`, `achieved_value`, and all role-level scores/ratings (`self_score`, `manager_score`, `skip_level_score`, `hr_pms_score`, `auditor_score`, `management_score` + their rating counterparts).
- This applies regardless of the KPI's current workflow status (including `approved`).
- The action is fully reversible: toggling NA OFF allows re-entry of scores.
- All cleared values are preserved in the `kpi_audit_logs` (`old_value` field).

---

## 20. Auto KRA Rollover Cron Schedule

- **Schedule:** 1st of every month at 00:00 UTC (`0 0 1 * *`)
- **Authentication:** Uses `X-Cron-Secret` header (matching `CRON_SECRET` env var) + Bearer anon key for gateway auth
- **Body:** `{"triggered_by": "cron"}` — triggers the system path which checks the `auto_kra_rollover` setting before proceeding
- **Edge Function:** `auto-rollover-kpis` — copies KPIs from previous month to current month for all employees
- **Disabling:** Set `auto_kra_rollover` to any value other than `enabled` in `system_settings`
- **Notification Consolidation (§118):** Rollover inserts KPIs via `batch_insert_kpis_with_rollover_flag()` DB function which sets `app.rollover_batch = 'true'`, suppressing per-KPI notification triggers. After all inserts, the edge function sends ONE consolidated in-app notification and ONE email per employee with the full KPI list. The `send_email_on_notification` trigger skips `kra_rollover` type notifications to prevent duplicates.

---

## 22. Frequency Period Auto-Resolution Policy

### 22.1 Auto-Resolution at Import/Creation

When creating or importing KPIs with multi-month frequencies (Quarterly, Bi-Monthly, Half-Yearly, Annual), the system auto-resolves `review_period` to the cycle's **active terminal month** — i.e., the last month of the cycle that is not locked.

| Frequency | Cycle Example | Terminal Month |
|-----------|--------------|----------------|
| Quarterly | Jan–Mar | March |
| Bi-Monthly | Jan–Feb | February |
| Half-Yearly | Jan–Jun | June |
| Annual | Jan–Dec | December |

### 22.2 DB Trigger Enforcement

- The `enforce_frequency_lock` trigger fires on INSERT to `kpis`
- If the resolved `review_period` falls on a locked month (per `frequency_config.locked_months`), the INSERT is **blocked** with an error
- Admin users are exempt from this enforcement
- This prevents data corruption from KPIs being assigned to months where they cannot be reviewed

### 22.3 Affected Code Paths

| Path | Resolution Logic |
|------|-----------------|
| `import-kpis` edge function | `resolveToActiveMonth()` applied before INSERT |
| `AdminKpiCreateDialog.tsx` | `resolveToActiveMonth()` applied before INSERT |
| DB trigger | Final enforcement gate at INSERT time |

---

## 23. Version History

| Version | Date | Change |
|---------|------|--------|
| 2.21.3 | 2026-04-22 | Edge admin auth policy tightened: shared admin edge helpers must not depend on a live auth session lookup as the sole identity proof. They must validate the caller through a backend-verified path (for this project: user-context database access under RLS) and still enforce the server-side `user_roles` admin check before any privileged write or audit-log action. Added regression coverage for the admin auth path. |
| 2.21.0 | 2026-04-17 | Incentive compute engine: removed reference to non-existent `profiles.location` column from `compute-monthly-incentives` SELECT (root cause of "No active employees resolved" / 0-records-processed regression — PostgREST returned an error that was silently swallowed by destructuring `{ data }` only). All profile fetches in the function now check `error` and return HTTP 500 with the PostgREST message. New engine-governance rule: **edge functions must check `error` on every Supabase query — silent destructuring of `data` is forbidden.** |
| 2.01.0 | 2026-04-13 | Observation inbox "Open in App" routing split: @mentions → read-only mention sheet; observation_raised/reply/resolved → role-aware employee scorecard deep-link (admin→team, auditor→audit, management→management). Backfilled existing notifications. |
| 1.92.4 | 2026-04-10 | UX fix: bulk zero-score confirmation now accepts `ZERO`, `zero`, or `0` — previously only exact `ZERO` was accepted, blocking users who typed `0`. |
| 1.90.4 | 2026-04-10 | Technical sync: §76 bulk zero-score edge function force-redeployed after stale kpiErr fix; added mandatory deployment verification to Edge Function Checklist. |
| 1.90.3 | 2026-04-10 | Technical sync: §76 orphaned `kpiErr` variable reference removed from scan-mode block in `bulk-zero-score-non-submitters`. |
| 1.90.2 | 2026-04-10 | Technical sync: §76 bulk zero-score scan query fixed — `is_na` exclusion now correctly queries `review_submissions` instead of non-existent `kpis.is_na` column. |
| 1.90.1 | 2026-04-10 | Technical sync: admin backend auth for §76 now validates explicit bearer-token claims and the Bulk Zero-Score UI forwards auth headers explicitly; no business rule change. |
| 1.82.2 | 2026-04-10 | Add missing UPDATE RLS policy for `menu_access_user_overrides` — fixes "Failed to grant access" error when re-granting an existing override |
| 1.81.0 | 2026-04-10 | `admin-incentive` menu override now grants compute access to `compute-monthly-incentives` edge function (§72 updated) |
| 1.74.0 | 2026-04-08 | SSOT alignment: §3.6 clarified that Daily KPI governance bypass does NOT override period hard-locks. Edge function `fix-corrupted-binary-scores` performer attribution fixed per §55. |
| 1.9.0 | 2026-03-07 | Daily-Frequency KPI Governance Bypass (§3.6): Daily KPIs at `kra_set` status bypass governance read-only locks to allow continuous data entry. Blue info banner shown when bypass is active. |
| 2.0.0 | 2026-03-23 | Auto-Advance Zero Sent-Back Exclusion: edge function now checks both kpi_queries AND kpi_audit_logs for sent-back KPIs before auto-scoring zero. Rolled back 16 incorrectly penalized KPIs across 8 employees. |
| 1.9.0 | 2026-03-21 | Pending Self-Reviews Admin Page (§24): Admin page for bulk zero-scoring overdue kra_set KPIs past configurable deadline. Manager/skip-level penalty for overdue manager_check KPIs targeting KRA "Implementation of common - policies / systems / processes". Configurable deadline day, employee remark, and manager remark via system_settings. |
| 1.8.0 | 2026-03-07 | Sent-Back KPI Governance Bypass (§3.5): Employees can edit and resubmit KPIs that were sent back by a reviewer, even when Edit KPI / Self Review governance permissions are disabled. Fresh KPIs remain locked. |
| 1.7.0 | 2026-03-05 | Effective Month Selection Policy (§23): KRA assignment dialogs now require explicit month/year selection instead of deriving from non-existent system setting. Multi-month frequencies auto-resolve to terminal month via `getActiveMonthForCycle`. |
| 1.6.0 | 2026-03-05 | Bug bounty fixes (BUG-001–BUG-009): full 7-role coverage in User Management, email validation hardening, XSS sanitization in PolicyRenderer, SendBack character limit, stable React keys, pagination reset on filter, server-side unread notification count, Dashboard lazy-loading of allSubmissions |
| 1.25.0 | 2026-03-30 | Cycle-aware reconciliation invariant (§17.5): reconciler checks rollback audit logs before advancing KPIs with downstream scores; approval syncs final_score from terminal stage, not generic COALESCE |
| 1.24.0 | 2026-03-30 | Rollback and re-submission downstream data clearing invariant (§17.4): rollbacks clear all downstream reviewer fields; re-submissions clear downstream fields based on activeReviewStage |
| 1.23.0 | 2026-03-29 | KPI Detail Report workflow-aware score display: out-of-workflow stage columns blanked using employee's month-specific workflow (§17.3) |
| 1.28.0 | 2026-03-30 | Atomic final_score sync invariant: Admin data entry must write `final_score` in the same upsert that writes role-level data when advancing to `approved`. A separate `.update()` for `final_score` is prohibited. Includes 8-stage fallback verification. |
| 1.27.0 | 2026-03-30 | Scoring Health Check dual-interpretation rule: DESCRIPTION_THRESHOLD_MISMATCH accepts both target-multiplier and raw-percentage interpretations — flag only when neither matches |
| 1.26.0 | 2026-03-30 | reconcile_workflow_statuses single-function invariant: only one overload may exist. All migrations modifying this function MUST drop ALL known historical signatures `(boolean, text, integer, uuid[], uuid)` and `(text, integer, boolean, uuid, uuid[])` before recreating. |
| 1.22.0 | 2026-03-28 | Out-of-workflow admin data entry guard: Admin entering data for a role not present in the employee's workflow (e.g., auditor on hr_pms workflow) saves role-specific fields but does NOT advance KPI status or sync final_score. `resolveForwardStatus` returns null for out-of-workflow roles. |
| 1.21.0 | 2026-03-28 | Approved KPI Final Score Immutability: Once a KPI reaches 'approved' status, `final_score` is frozen. Admin data entry on approved KPIs updates only role-specific fields (e.g., auditor_score) without re-triggering status advancement or final_score sync. This prevents score drift from post-approval historical edits. |
| 1.20.0 | 2026-03-27 | Production Incentive Phase 2: BU sub-units (furnaces/lines), production target data entry grid, allocation rules for common employees (weighted % splits), incentive status column (hold/finalised/forfeited/released), manual status override with audit trail, program settings (incentive_base, min_kra_score, no_kra_eligible), department-specific slabs. Auto-computed status respects manual overrides. |
| 1.19.3 | 2026-03-27 | Incentive program name, type, description, effective dates, and active status now editable via Edit Program dialog (pencil icon opens form instead of toggling active) |
| 1.19.2 | 2026-03-27 | Binary Polarity toggle added to Assign New KRA dialog — admins can select Standard (Yes=5) or Inverted (No=5) scoring for binary KPIs; auto-detected from library selection |
| 1.55.0 | 2026-04-01 | Full-Cycle Rollover (§45): Multi-month KPIs now create records for ALL months in the cycle (>= target), not just terminal month. Enables scorecard visibility, weightage inclusion, and percolation for sibling months. |
| 1.56.0 | 2026-05-01 | Rollover Notification Consolidation (§118): KRA rollover now sends ONE consolidated email per employee instead of one per KPI. Uses `batch_insert_kpis_with_rollover_flag()` to suppress per-KPI triggers, then sends consolidated notification with full KPI table. |
| 1.54.0 | 2026-04-01 | Multi-Month Score Percolation (§47): DB trigger propagates terminal-month approval scores to sibling months in same cycle. Audit action SCORE_PERCOLATED. |
| 1.19.1 | 2026-03-27 | Monthly Review Reminder: updated disregard notice to "If you have already completed your review and team's review (if applicable), please disregard this reminder." |
| 1.19.0 | 2026-03-27 | Monthly Review Reminder: automated email on 1st of every month at 8 AM to all employees with active KRAs for previous month. Reminds self-review and team KRA review. Configurable via `monthly_review_reminder` event toggle. |
| 1.18.2 | 2026-03-27 | KRA Library Quick Search: removed category/KRA selection checkboxes; only KPI-level selection remains, auto-filling all fields |
| 1.15.0 | 2026-03-26 | Variance Report: New report at `/reports/variance` showing KPIs where Audit and Management scores differ. Access controlled via `report_access_config` with `reportKey="variance"`. Only KPIs with both scores present and differing are shown. |
| 1.13.0 | 2026-03-24 | Incentive Program Employee Mapping: New `incentive_program_mappings` table with flexible enrollment by department, BU, designation, PMS grade, or individual employee. Admin UI with ProgramEmployeeMapping component. Compute edge function resolves mappings before processing. Union logic — employee matching ANY mapping is eligible. |
| 1.12.0 | 2026-03-24 | Incentive Module (§23): Two tracks (Production & Support), configurable slabs/DQ rules, eligibility data entry, retroactive adjustment detection for Q/BM KPIs, monthly & retroactive reports |
| 1.5.0 | 2026-03-05 | Frequency Period Auto-Resolution Policy (§22): KPI import/creation auto-resolves multi-month frequency periods to terminal month. DB trigger blocks INSERT of KPIs with locked-month review_period for non-admin users |
| 1.4.0 | 2026-03-02 | Data correction: deleted 17 duplicate March KPIs (from Jan org-replication), inserted 12 missing KPIs from Feb, fixed Dileshwar weightage mismatch. Improved rollover dedup to also check kra_name-level existence preventing cross-source duplicates. 4 employees flagged for admin review (pre-existing source data issues). |
| 1.3.0 | 2026-03-02 | Data correction: deleted duplicate Org KPIs in Feb/March, ran manual Feb→March rollover, fixed rollover pagination bug (1000-row limit) |
| 1.2.0 | 2026-03-02 | Fixed auto-rollover cron job authentication (§20) — added X-Cron-Secret header |
| 1.1.0 | 2026-03-02 | Added Admin NA Score Clearing Policy (§19) — admin NA toggle now clears all scoring fields |
| 1.0.0 | 2026-03-02 | Initial POLICY.md creation — documented all existing business rules, workflow policies, configurable settings, and the new mandatory remarks feature |

---

## §29. Scope-Aware Propagation Validation Invariant

**Rule:** The Propagate button in Org KPI Data Entry must use scope-aware validation:
- **Organization scope:** enabled when top-level `achievedValue` is non-empty OR entry is marked N/A
- **Department/Employee scope:** enabled when at least one `scopedValues` row has a non-null `achievedValue` OR is marked N/A

**Rationale:** Scoped KPIs store values in per-department/per-employee rows, not in the top-level field. Checking only the top-level field permanently disables propagation for all scoped entries.

**Invariant:** Any future refactor of the Propagate button AND the blank-data propagation guard must preserve scope-aware validation logic. Both checks must differentiate org-scope (top-level value) from department/employee-scope (`scopedValues` array).

**Decision Context & Alternatives Considered:**
- *Alternative A: Check only top-level field for all scopes* — Rejected because scoped KPIs store values in per-department/per-employee rows, not in the top-level field, permanently disabling propagation.
- *Alternative B: Disable validation entirely* — Rejected because propagating empty values would overwrite existing employee scores.
- *Chosen approach:* Scope-aware validation differentiating org vs department/employee scopes. See [ADR-029](docs/adr/ADR-029.md).

---

## §30. Org KPI Audit Log Completeness Invariant

**Rule:** Every mutation to `org_kpi_values` must write a corresponding entry to `org_kpi_data_entry_logs`. This includes:
- `created` — initial value entry
- `updated` — value change
- `propagated` — value propagated to employee KPIs
- `rollback` — propagation rollback
- `unlocked` — admin unlock for re-editing
- `imported` — bulk import
- `copied_from_previous` — copy from previous period

**Rationale:** The Value History popover is the primary audit trail for org KPI data changes. Missing entries undermine accountability and make it impossible to trace when/who changed values.

**Invariant:** Any new org KPI mutation path must include an audit log write. Existing history gaps cannot be backfilled — only new operations are logged going forward.

**Decision Context & Alternatives Considered:**
- *Alternative A: Client-side-only logging* — Rejected because it's unreliable (network failures, browser crashes) and bypassable.
- *Alternative B: Periodic reconciliation batch job* — Rejected because it cannot reconstruct who made the change or when.
- *Chosen approach:* Server-side audit log write on every mutation path. See [ADR-030](docs/adr/ADR-030.md).

---

## §31. Sent-Back Indicator Detection Invariant

**Rule:** The sent-back indicator on the Org KPI scoped table must detect sent-back state by:
1. Finding employee KPIs at `kra_set` status (haven't re-progressed)
2. Cross-referencing with `kpi_queries` records of type `send_back` (any status — not just `'open'`)

**Rationale:** Send-back query records are auto-resolved when KPI status changes, so filtering by `status = 'open'` always returns empty results. The correct signal is: KPI is still at `kra_set` AND has a historical send-back query.

**Invariant:** The sent-back detection must never rely solely on `kpi_queries.status = 'open'`. It must check the KPI's current workflow status.

**Decision Context & Alternatives Considered:**
- *Alternative A: Filter by `kpi_queries.status = 'open'` only* — Rejected because send-back queries are auto-resolved on status change, so this always returns empty.
- *Alternative B: Add `was_sent_back` boolean flag to KPIs* — Rejected because it adds schema complexity; existing data already provides sufficient signal.
- *Chosen approach:* Cross-reference KPI status with query history. See [ADR-031](docs/adr/ADR-031.md).

---

## §32. Review Journey Previous Month Comparison Invariant

**Rule:** The Review Journey must show up to 2 previous months of the same KPI for trend comparison. The displayed data must:
1. Come from live database queries (same `kpis` + `review_submissions` tables as current month)
2. Use a short staleTime (≤2 minutes) to ensure real-time linkage with the dashboard
3. Resolve each previous month's workflow independently via `get_bulk_employee_workflows` RPC
4. Match KPIs by `employee_id + kpi_name + kra_name + category_id` (not by KPI ID)

**Rationale:** Reviewers need to compare current performance against recent history without switching between dashboards. The data must be live-linked to prevent stale comparisons.

**Invariant:** Previous month tiles must never show cached or snapshot data — they must always reflect the current state of the corresponding KPI in the database.

**Decision Context & Alternatives Considered:**
- *Alternative A: Snapshot/cached previous month data* — Rejected because stale snapshots wouldn't reflect corrections, rollbacks, or late entries.
- *Alternative B: Match previous KPIs by KPI ID* — Rejected because KPI IDs are unique per period; composite key matching is required.
- *Chosen approach:* Live database queries with composite key matching and short staleTime. See [ADR-032](docs/adr/ADR-032.md).

---

## §33. Rollback Cascade-Clear Invariant

**Rule:** When a KPI is rolled back (via rollback request approval or admin step-back), ALL review fields for the **target stage AND all subsequent stages** must be cleared. This includes: score, rating, remarks, evidence_url, and achieved_value for each stage, plus final_score and final_rating.

**Rationale:** If only stages after the target are cleared but the target stage's own data is preserved, stale scores from the previous approval cycle remain visible, creating a false impression that the stage has already been re-reviewed.

**Invariant:** The cascade-clear condition must use `>=` (not `>`) for stage index comparison, ensuring the target stage itself is included in the clear set.

**Decision Context & Alternatives Considered:**
- *Alternative A: Clear only stages after target using `>`* — Rejected because stale scores at the target stage would create a false impression of completed re-review.
- *Alternative B: Clear all stages regardless of target* — Rejected because stages before the target may have valid, current data.
- *Chosen approach:* `>=` comparison includes target stage in clear set. See [ADR-033](docs/adr/ADR-033.md).

---

## §34. Admin Edit Final Score Recomputation Invariant

**Rule:** When an admin edits any score field on an already-approved KPI, the system must recompute `final_score` using the authoritative 8-stage fallback chain (management → auditor → HR PMS → skip-level → manager → self) and patch the result if it differs from the current `final_score`. This recomputation is **independent of the `advance_status` toggle** — that toggle controls workflow progression only, not score integrity.

**Rationale:** The normal approval flow sets `final_score` during status advancement. Since already-approved KPIs skip status advancement, the `final_score` would remain stale after admin edits without explicit recomputation. The `advance_status` flag must never gate this recomputation.

**Invariant:** Post-upsert recomputation must always execute when `currentKpiStatus === 'approved'`, regardless of which role-level score was edited and regardless of the `advance_status` toggle state.

**Decision Context & Alternatives Considered:**
- *Alternative A: Gate recomputation behind `advance_status` toggle* — Rejected because the toggle controls workflow progression, not score integrity; approved KPIs never advance, leaving `final_score` permanently stale.
- *Alternative B: Prohibit admin edits on approved KPIs* — Rejected because admins need to correct data entry errors and handle late adjustments.
- *Chosen approach:* Unconditional recomputation on approved KPI edits. See [ADR-034](docs/adr/ADR-034.md).

---

## §35. Admin N/A Toggle Role-Scoped Clearing Invariant

**Rule:** When an admin marks a KPI as N/A via the Admin Data Entry dialog, the system must only clear scoring fields (achieved_value, rating, score, remarks) for the **currently selected role level** and the `final_score`/`final_rating`. Scores for other review levels (self, manager, skip-level, HR PMS, auditor, management) must remain untouched.

**Rationale:** The `is_na` flag is a KPI-level applicability marker. However, clearing scores across all levels when any single level is marked N/A causes data loss for already-completed reviews. The admin dialog must only send the `is_na` flag when it has been explicitly toggled (changed from its original state), preventing accidental re-clears on subsequent edits.

**Invariant:** The N/A clearing block in `useAdminDataEntry.ts` must never reference scoring fields for roles other than the active `role_level` parameter. The `AdminDataEntryDialog` must track the original `is_na` state and only include `is_na` in the mutation payload when the value differs from the original.

**Decision Context & Alternatives Considered:**
- *Alternative A: Clear all role levels when N/A is toggled* — Rejected because it causes data loss for already-completed reviews at other stages.
- *Alternative B: Always send `is_na` in mutation payload* — Rejected because it triggers unnecessary re-clears on subsequent edits.
- *Chosen approach:* Role-scoped clearing with change-tracking for `is_na`. See [ADR-035](docs/adr/ADR-035.md).

---

## §36. Slab Categories Zero-Hardcoding Invariant

**Rule:** Incentive slab categories (e.g., PMS Score, Production, Availability, Maintenance, Metal Recovery) must be stored in the `incentive_slab_categories` master-data table and never hardcoded in UI components or hooks. Admins can add/remove categories via the `SlabCategorySelector` inline input.

**Rationale:** Hardcoded category lists require code deployments to change and risk drift between environments. The DB-driven approach allows admins to extend categories (e.g., "Safety Score", "Quality") without developer intervention.

**Invariant:** No component or hook may define a static array of slab category values. All slab category lists must be sourced from the `incentive_slab_categories` table via the `useIncentiveSlabCategories` hook.

**Decision Context & Alternatives Considered:**
- *Alternative A: Hardcoded category arrays in components* — Rejected because it requires code deployments to change and risks environment drift.
- *Alternative B: Environment variable-based configuration* — Rejected because it still requires deployment and has no admin UI.
- *Chosen approach:* Database-driven master data with admin CRUD UI. See [ADR-036](docs/adr/ADR-036.md).

---

## §37. Employee Mapping — Resolved List Invariant

**Rule:** The incentive program employee mapping UI must display a unified, sortable table of all active employees with their organizational attributes (name, code, designation, department, BU, division, level, PMS grade). The UI must NOT use abstract entity pickers (e.g., separate tabs for divisions, departments, grades) as the primary mapping interface.

**Rationale:** Abstract entity pickers obscure which individual employees are actually enrolled. A resolved employee list gives admins immediate visibility into who is mapped, supports multi-select with filters, and prevents accidental over-enrollment.

**Invariant:** `ProgramEmployeeMapping` must always render a flat employee table with checkboxes. Bulk operations (select-all-filtered, clear-all-filtered) must use the `useBulkAddProgramMappings` / `useBulkRemoveProgramMappings` hooks for performance.

**Decision Context & Alternatives Considered:**
- *Alternative A: Abstract entity pickers (tabs for divisions, departments, grades)* — Rejected because it obscures which individual employees are enrolled and risks accidental over-enrollment.
- *Alternative B: Individual employee search and add* — Rejected because it's impractical for programs with hundreds of employees.
- *Chosen approach:* Flat employee table with filters and bulk operations. See [ADR-037](docs/adr/ADR-037.md).

---

## §38. Dashboard Observation Visibility Invariant

**Rule:** Every dashboard KPI row (desktop table and mobile card) must display the observation count when observations exist for that KPI. The indicator must be a compact, non-cluttered Eye icon with count in amber, rendered after the query badge.

**Rationale:** Observations represent critical feedback (positive, concern, neutral) from managers, auditors, and management. Hiding them inside the review panel reduces visibility and delays action. Surface-level indicators ensure all stakeholders see observation activity at a glance.

**Invariant:** `KpiDetailsTable` must accept an `observationCounts` prop and render an Eye+count indicator for KPIs with observations > 0. All scorecard containers must fetch observations via `useObservationsByKpis` and pass the derived counts.

**Decision Context & Alternatives Considered:**
- *Alternative A: Show observations only inside the review panel* — Rejected because it reduces visibility and delays action on critical feedback.
- *Alternative B: Separate observations dashboard page* — Rejected because it adds navigation overhead; observations are most actionable in KPI context.
- *Chosen approach:* Inline Eye+count indicator on every dashboard KPI row. See [ADR-038](docs/adr/ADR-038.md).

---

## §39. Notification KPI Name Truncation Invariant

**Rule:** All notification messages (in-app and email) must use the first line of the KPI name only, truncated to a maximum of 100 characters. The full KPI description, formula, and scoring logic must never appear in notification text.

**Rationale:** KPI names in the database often contain multi-line text with description, formula, and scoring logic appended. Including this in notifications makes them unreadable and clutters both the notification panel and email inbox.

**Invariant:** When creating notification records in client code (`useKpis.ts`, `useQueryWorkflow.ts`, etc.), always apply `.split('\n')[0].substring(0, 100)` to `kpi_name` before inserting. The `send_email_on_notification` DB trigger must apply `LEFT(SPLIT_PART(..., E'\n', 1), 80)` for all query and observation notification types.

**Decision Context & Alternatives Considered:**
- *Alternative A: Use full KPI name in notifications* — Rejected because multi-line names with formulas make notifications unreadable.
- *Alternative B: Maintain a separate `display_name` column* — Rejected because it adds schema complexity and a maintenance burden to keep in sync.
- *Chosen approach:* First-line extraction with truncation at both client and trigger levels. See [ADR-039](docs/adr/ADR-039.md).

---

## §40. Single-Source Query Raised Notifications

**Rule:** `query_raised` notifications must only be created by the database trigger `notify_on_query_raised()` on the `kpi_queries` table. Frontend code must NOT insert duplicate notification records for query raises.

**Rationale:** Duplicate notification paths cause inconsistent metadata keys (e.g., `reason` vs `query_reason`), leading to email templates receiving null values. A single server-side trigger ensures consistent metadata structure and prevents duplicate notifications.

**Invariant:** The `useRaiseQuery` mutation in `useKpis.ts` must NOT insert into the `notifications` table. The DB trigger uses `jsonb_build_object('query_id', NEW.id, 'query_reason', NEW.reason)` to ensure the email trigger can read `metadata->>'query_reason'` correctly.

**Decision Context & Alternatives Considered:**
- *Alternative A: Dual insert from frontend + trigger* — Rejected because it causes duplicate notifications and inconsistent metadata keys (`reason` vs `query_reason`).
- *Alternative B: Frontend-only notification creation* — Rejected because it's bypassable via direct API calls and less reliable than server-side triggers.
- *Chosen approach:* Single-source DB trigger for all query notifications. See [ADR-040](docs/adr/ADR-040.md).

---

### §41 — Incentive Report Export Completeness

**Rule:** All incentive report exports (Excel/XLSX) must include the full set of disqualification rule fields: `Is Disqualified`, `Disqualification Reasons`, and `LTI Penalty %`. These fields must never be omitted from the export template.

**Rationale:** Incomplete incentive reports risk payroll errors and compliance gaps. DQ data is critical for audit trails and financial reconciliation.

**Invariant:** The `IncentiveReportExport` component's Excel export must produce at least 28 columns covering Employee Info, Period, Programme, Scores, DQ Fields, Adjustments, Final, and Analytical data.

**Decision Context & Alternatives Considered:**
- *Alternative A: Minimal export with only summary fields* — Rejected because incomplete reports risk payroll errors and compliance gaps.
- *Alternative B: Separate DQ report* — Rejected because it forces payroll teams to cross-reference two documents.
- *Chosen approach:* Unified 28+ column export with all DQ fields included. See [ADR-041](docs/adr/ADR-041.md).

---

### §42: Dynamic Program Configuration Tabs

**Rule:** Incentive program configuration tabs must be database-driven via `incentive_program_custom_tabs`. No new hardcoded tabs shall be added to `IncentiveConfig.tsx`. All new per-employee data entry needs (vessel rates, production targets, custom metrics) must use the dynamic custom tab system.

**Core Tabs (immutable):** Mapping, Slabs, DQ Rules, Fields, BU Sub-Units, Allocation, Vessel Rates — these remain hardcoded because they have dedicated business logic components.

**Custom Tabs:** Admin-configurable via the `[+ Add Tab]` button. Each custom tab stores its field schema in JSONB (`fields` column) and per-employee data in `incentive_custom_tab_data.field_values` JSONB.

**Invariant:** The `ProgramInnerTabs` component must always render all active custom tabs from the database after the core tabs.

**Decision Context & Alternatives Considered:**
- *Alternative A: Hardcoded tabs in component* — Rejected because it requires code deployment for every new tab and cannot vary per program.
- *Alternative B: JSON configuration file* — Rejected because it still requires deployment and has no admin UI.
- *Chosen approach:* Database-driven custom tabs via `incentive_program_custom_tabs`. See [ADR-042](docs/adr/ADR-042.md).

---

### §43 — Org KPI Audit Review Governance

**Rule:** Organization-level KPIs that include an audit stage in their workflow must be reviewable via the dedicated Org KPI Audit Review page (`/admin/org-kpi-audit-review`). This page shows only org-level KPIs whose employee instances have reached the audit-reviewable status per each employee's workflow.

**Scoring:** Auditor scores are written to `review_submissions` (same pattern as `AuditScorecard.tsx`). Approving advances the KPI status to the next workflow stage via `resolveForwardStatus('auditor', stages)`.

**Bulk approve:** A single auditor score can be applied to all pending employees under one org KPI definition. Each employee's KPI is advanced individually, respecting their specific workflow.

**Access:** Auditor and Admin roles only. Menu key: `admin-org-kpi-audit`.

**Decision Context & Alternatives Considered:**
- *Alternative A: Use existing AuditScorecard for org KPIs* — Rejected because reviewing hundreds of employee instances individually is impractical and loses organizational context.
- *Alternative B: Auto-approve org KPIs at propagation time* — Rejected because it violates workflow policy; configured audit stages must be performed.
- *Chosen approach:* Dedicated bulk audit review page for org-level KPIs. See [ADR-043](docs/adr/ADR-043.md).

### §44 — Production Daily Entry Governance

**Rule:** Programs with per-ton production rates use daily achievement grids instead of BU-based production target entry. Employees are auto-populated from programme mappings — no BU dropdown is required.

**Rate configuration:** Production rates support four assignment modes: **Employee-wise** (per individual), **Department-wise** (applies to all employees in a department), **BU-wise** (applies to all employees in a business unit), and **Common** (single rate for all mapped employees). Rates are configured in the programme's "Production Rates" tab using a radio selector and entity picker.

**Rate resolution priority:** When the daily grid renders, each employee's effective rate is resolved using a strict priority cascade: Employee > Department > BU > Common. The first matching rate wins. Only employees with a resolved rate appear in the grid.

**Daily values:** Stored as JSONB (`{"1": 10, "2": 15, ...}`) in `production_daily_entries`, keyed by program + employee + month + year. Days beyond the month's length are ignored.

**Calculation:** Incentive amount = Total daily achievement × Effective rate per ton. The grid displays a badge (emp/dept/bu/com) next to each rate to indicate its source.

**Computation pipeline:** The `compute-monthly-incentives` edge function aggregates production daily entries and resolves rates using the priority cascade. For production programs, records are written **canonically per sub-period** (`1-10`, `11-20`, `21-31`) — one record per populated sub-period. `Full Month` is a **derived UI aggregation**, never a stored production record. Each sub-period record has its own `incentive_amount` and independent `status` (draft/confirmed/paid). Company resolution is unified between slab matching and rate cascade: prefer `profiles.company_id`, fallback to dept→BU→division→company chain.

**Payment period column:** `employee_incentive_records.payment_period` stores: `'1-10'`, `'11-20'`, `'21-31'` for production; `'Full Month'` for support/vessel programmes only. Unique constraint: `(employee_id, review_period, review_year, program_id, payment_period)`. Recompute purges legacy `'Full Month'` production rows.

**Recomputation cleanup:** The edge function deletes all existing records for each employee+program+month before upserting fresh results. This ensures: (a) period structure changes (full → split or vice versa) don't leave orphan records, (b) DQ status is always current after re-computation, and (c) manually overridden statuses are preserved via the pre-read at step 5 and re-applied during upsert.

**Date range filter:** UI toggle renamed from "All" to "Full Month". Totals always reflect all days regardless of visible range.

**Detection priority:** Vessel rates → Vessel grid; Production rates → Daily grid; Neither → Slab-based grid.

**Invariant:** The edge function must always aggregate `production_daily_entries` for production programs. The `incentive_amount` field must reflect `totalTons × resolvedRate`. Client-side-only calculations must never be the sole source of truth for incentive amounts.

**DQ amount visibility:** When an employee is disqualified, the `incentive_amount` retains the calculated value (what would have been earned). The `is_disqualified` flag and `disqualification_reasons` array indicate forfeiture. `final_incentive_percent` is set to 0 for slab-based programs. Payroll/finance teams MUST use `is_disqualified = true` (not `incentive_amount = 0`) to determine actual payout eligibility.

**DQ rule configuration requirement:** Every incentive program MUST have disqualification rules configured in `incentive_disqualification_rules` before computation. If no rules exist for a program, the DQ evaluation loop is a no-op and all employees pass as eligible. Standard rule set: warning, suspension, absence, LWP, LTI, contract. Admins can manage rules via the programme's "Disqualification Rules" tab in Incentive Configuration.

**Decision Context & Alternatives Considered:**
- *Alternative A: Monthly aggregate entry only* — Rejected because it loses granularity needed for period-based payment splits.
- *Alternative B: Flat rate for all employees* — Rejected because different roles/departments have different rate structures.
- *Alternative C: Client-side incentive calculation* — Rejected because client-side calculations are not authoritative.
- *Chosen approach:* Server-side daily grid with priority-based rate resolution. See [ADR-044](docs/adr/ADR-044.md).

## §45 — Frequency-Aware KRA Rollover

**Terminal month resolution:** When KPIs are rolled over to a new period, the system resolves the target `review_period` to the correct terminal month based on the KPI's frequency. Monthly KPIs use the raw target month; multi-month frequencies (Bi-Monthly, Quarterly, Half-Yearly, Yearly) are mapped to their cycle's terminal month (e.g., Quarterly April → June). This prevents insertion failures caused by frequency lock triggers blocking non-terminal months.

**Full-cycle record creation:** For multi-month KPIs, the rollover creates records for ALL months in the cycle that are >= the target month. For example, rolling to April for a Quarterly KPI creates records for April, May, and June. Earlier months in the cycle (Jan-Mar) already have records from the previous rollover. Each month is independently deduped against existing records using `kra_name + kpi_name + review_period` (not KRA-level terminal dedup, which would block sibling creation when the terminal already exists).

**Sibling month behavior:** Non-terminal month records are created with `status: 'kra_set'` and are naturally locked by the `enforce_frequency_lock_on_submission` trigger. They appear in scorecards as locked/blurred but visible. When the terminal month is approved, the `percolate_multimonth_score` trigger propagates scores and status to all sibling records.

**Service role bypass:** The `enforce_frequency_lock_on_submission` database trigger allows service-role callers (edge functions) to bypass frequency lock checks. This ensures automated processes like rollover and bulk assignment are not blocked by the trigger.

**Decision Context & Alternatives Considered:**
- *Alternative A: Create only terminal month record* — Rejected because sibling months would not appear in scorecards or participate in weightage calculations.
- *Alternative B: KRA-level terminal dedup* — Rejected because it blocks sibling month creation when the terminal already exists.
- *Chosen approach:* Full-cycle record creation with per-month dedup. See [ADR-045](docs/adr/ADR-045.md).

## §46 — Daily KPI Rating Calculation

**Missed Days Penalty score IS the rating:** When a Daily/Weekly KPI uses the `missed_days_penalty` aggregation method, the aggregated score (0–5 scale) is the final rating. It must NOT be re-mapped through the KPI's threshold-based `calculateScoreFromAchieved` function, which is designed for raw achieved values. Re-mapping would cause double-conversion errors (e.g., a penalty score of 0 incorrectly mapped to "Outstanding" for Lower-is-Better KPIs).

**Expected days source:** The Submit Monthly Review dialog must use `useExpectedDays` (which respects `day_count_type` and employee-specific working days) instead of raw calendar days. This ensures the submitted days count, missed days, and penalty score align with the Daily Submission Summary.

**Decision Context & Alternatives Considered:**
- *Alternative A: Re-map penalty score through threshold function* — Rejected because it causes double-conversion errors (penalty score already on 0–5 scale).
- *Alternative B: Use raw calendar days for expected days* — Rejected because it ignores `day_count_type` and employee-specific working days.
- *Chosen approach:* Penalty score used directly as rating; `useExpectedDays` for day counts. See [ADR-046](docs/adr/ADR-046.md).

## §47 — Multi-Month KPI Score Percolation

**Trigger:** When a multi-month KPI (Bi-Monthly, Quarterly, Half-Yearly, Yearly) transitions to `approved` on its terminal month, the database trigger `percolate_multimonth_score` automatically propagates the scores and `approved` status to all sibling KPI records in the same cycle.

**Scope:** Sibling KPIs are identified by matching `employee_id`, `kra_name`, `kpi_name`, `review_year`, and `frequency`, with `review_period` within the same cycle (determined by `get_cycle_months`).

**Skip rule:** Siblings already in `approved` status are not overwritten. Only non-approved siblings receive the propagated data.

**Data propagated:** All score fields (self, manager, skip-level, HR PMS, auditor, management, final), ratings, `achieved_value`, and `is_na` are copied from the terminal month's `review_submissions` row.

**Ordering:** The sibling KPI status is set to `approved` BEFORE the review submission is upserted, to prevent the `sync_kpi_status_from_submission` trigger from attempting a `kra_set → self_review` transition (which would be blocked by the frequency lock trigger).

**Audit trail:** Each percolated sibling receives a `kpi_audit_logs` entry with action `SCORE_PERCOLATED`, recording the source terminal KPI ID, source period, and frequency.

**Decision Context & Alternatives Considered:**
- *Alternative A: Manual per-month approval* — Rejected because multi-month KPIs represent a single measurement; separate approvals for identical data are redundant.
- *Alternative B: Application-level propagation* — Rejected because browser crashes or network failures could leave siblings inconsistent; DB triggers guarantee atomicity.
- *Chosen approach:* Database trigger for atomic score percolation. See [ADR-047](docs/adr/ADR-047.md).

## §48 — Auto-Advance KPI Scoring Policy

**Trigger:** When an admin triggers "Auto-Score with Zero" for overdue self-reviews, the system sets the KPI to `approved` status with all scores set to 0.

**All stages populated:** ALL review stage scores (self, manager, skip-level, HR PMS, auditor, management, final) are set to 0 with `red` rating. This ensures:
1. Journey tiles display "0" instead of "N/A" for skipped stages
2. Reports show consistent zero scores across all columns
3. Weighted average calculations include the KPI correctly

**N/A distinction:** Auto-advanced KPIs with 0 scores are NOT the same as N/A KPIs. The `auto_advance_reason` field distinguishes system-auto-scored KPIs from genuinely not-applicable ones. Journey tile UI checks this field to prevent false N/A badges.

**Audit:** Each auto-advance creates a `SYSTEM_AUTO_SCORED` audit log entry with the remark and source.

**Decision Context & Alternatives Considered:**
- *Alternative A: Set only self_score to 0, leave other stages as N/A* — Rejected because journey tiles would show "N/A", reports would have gaps, and weighted averages would be inconsistent.
- *Alternative B: Mark auto-advanced KPIs as N/A* — Rejected because N/A KPIs are excluded from weighted averages; auto-advanced KPIs should penalize the score.
- *Chosen approach:* All stages set to 0 with `auto_advance_reason` field for distinction. See [ADR-048](docs/adr/ADR-048.md).

## §49 — Admin Step-Back Target Selection, Full Reset & Sibling Reversion

**Target selection:** When stepping back a KPI, the admin can select any preceding workflow stage — not just the immediate previous stage. The `kra_set` stage is always available as a target.

**Full reset:** The "Clear all review data" option nullifies ALL submission fields (scores, ratings, remarks, evidence URLs, achieved values, `auto_advance_reason`). The KPI is reset to `kra_set` with `kpi_status = 'open'`, allowing the employee to start fresh. Audit action: `ADMIN_FULL_RESET`.

**Multi-month sibling reversion:** When an `approved` multi-month KPI (Bi-Monthly, Quarterly, Half-Yearly, Yearly) is stepped back, all sibling months in the same cycle are automatically reverted to the same target stage with the same data clearing applied. This prevents orphaned approved siblings from remaining in an inconsistent state. Audit action: `SIBLING_STEP_BACK` for each sibling.

**Safeguards:**
1. Full reset requires explicit checkbox confirmation + destructive-styled button
2. Mandatory reason field for audit trail
3. Employee receives notification with reason and transition details
4. kpi_queries entry created for Review Journey visibility

**Decision Context & Alternatives Considered:**
- *Alternative A: Allow step-back only to immediate previous stage* — Rejected because it forces multiple sequential rollbacks to reach earlier stages.
- *Alternative B: Leave sibling months in approved state after step-back* — Rejected because it creates inconsistent state with stale percolated scores.
- *Alternative C: Auto-delete sibling records on step-back* — Rejected because it destroys audit trail and prevents re-approval.
- *Chosen approach:* Flexible target selection with automatic sibling reversion. See [ADR-049](docs/adr/ADR-049.md).

---

## §50 — Architectural Decision Record Index

All architectural decisions documented as invariants in this policy are also maintained as formal ADR files in `docs/adr/`.

| ADR | §Section | Title |
|-----|----------|-------|
| [ADR-029](docs/adr/ADR-029.md) | §29 | Scope-Aware Propagation Validation |
| [ADR-030](docs/adr/ADR-030.md) | §30 | Org KPI Audit Log Completeness |
| [ADR-031](docs/adr/ADR-031.md) | §31 | Sent-Back Indicator Detection |
| [ADR-032](docs/adr/ADR-032.md) | §32 | Review Journey Previous Month Comparison |
| [ADR-033](docs/adr/ADR-033.md) | §33 | Rollback Cascade-Clear |
| [ADR-034](docs/adr/ADR-034.md) | §34 | Admin Edit Final Score Recomputation |
| [ADR-035](docs/adr/ADR-035.md) | §35 | Admin N/A Toggle Role-Scoped Clearing |
| [ADR-036](docs/adr/ADR-036.md) | §36 | Slab Categories Zero-Hardcoding |
| [ADR-037](docs/adr/ADR-037.md) | §37 | Employee Mapping — Resolved List |
| [ADR-038](docs/adr/ADR-038.md) | §38 | Dashboard Observation Visibility |
| [ADR-039](docs/adr/ADR-039.md) | §39 | Notification KPI Name Truncation |
| [ADR-040](docs/adr/ADR-040.md) | §40 | Single-Source Query Raised Notifications |
| [ADR-041](docs/adr/ADR-041.md) | §41 | Incentive Report Export Completeness |
| [ADR-042](docs/adr/ADR-042.md) | §42 | Dynamic Program Configuration Tabs |
| [ADR-043](docs/adr/ADR-043.md) | §43 | Org KPI Audit Review Governance |
| [ADR-044](docs/adr/ADR-044.md) | §44 | Production Daily Entry Governance |
| [ADR-045](docs/adr/ADR-045.md) | §45 | Frequency-Aware KRA Rollover |
| [ADR-046](docs/adr/ADR-046.md) | §46 | Daily KPI Rating Calculation |
| [ADR-047](docs/adr/ADR-047.md) | §47 | Multi-Month KPI Score Percolation |
| [ADR-048](docs/adr/ADR-048.md) | §48 | Auto-Advance KPI Scoring Policy |
| [ADR-049](docs/adr/ADR-049.md) | §49 | Admin Step-Back Target Selection, Full Reset & Sibling Reversion |

**Template:** New ADRs should follow [ADR-TEMPLATE.md](docs/adr/ADR-TEMPLATE.md).

---

## §51 — Active-Employee Filtering Invariant

**Rule:** All general-purpose profile-fetching hooks (`useProfiles`, `useProfilesByWorkflowStage`, `useSkipLevelTeamMembers`, `useEmployeeFilterOptions`) MUST include `.eq('is_active', true)` in their database queries. Inactive employees must only be visible in the User Management admin interface.

**Rationale:** Inactive employees (deactivated accounts) should not appear in dashboards, review workflows, filter dropdowns, or assignment selectors. Showing them creates confusion, inflates counts, and allows accidental assignment of work to departed employees. Historical data is preserved via KPI/review records and remains accessible in reports.

**Invariant:** Every Supabase query in a general profile-listing hook filters on `is_active = true`. The User Management page uses its own dedicated query that intentionally includes inactive profiles for administrative purposes.

**Decision Context & Alternatives Considered:**
- *Alternative A: Filter at the UI layer (post-fetch)* — Rejected because it wastes bandwidth fetching inactive rows and risks UI components forgetting to filter.
- *Alternative B: Use a database view that excludes inactive* — Rejected because it adds schema complexity and makes the filter implicit/hidden.
- *Chosen approach:* Explicit `.eq('is_active', true)` at the query level in each hook — simple, auditable, and consistent. See ADR-051.

---

## §52 — Multi-Company Data Isolation Invariant

**Rule:** The `companies` table stores multiple company entities. Organization structure tables (`divisions`, `designations`, `pms_grades`, `levels`) include a `company_id` foreign key. When the Organization Structure page is filtered by a selected company, all CRUD operations and display must be scoped to that company's `company_id`. Business units, departments, and sub-branches inherit company context through their parent division chain.

**Rationale:** Multi-company support allows a single PMS instance to manage organizational structures for multiple legal entities (e.g., parent and subsidiary companies). Without data isolation, structure from one company would bleed into another, causing confusion and incorrect assignments.

**Invariant:** All organization structure queries on the admin Organization page filter by the selected `company_id`. New entities created on that page automatically receive the active company's ID. The clone structure feature copies entities from a source company to a target company with re-mapped parent relationships.

**Decision Context & Alternatives Considered:**
- *Alternative A: Separate database schemas per company* — Rejected because it adds massive complexity and prevents cross-company reporting.
- *Alternative B: A single `company_id` on every table including departments, BUs, sub-branches* — Rejected because departments/BUs/sub-branches already inherit company context through their parent division chain; adding redundant FKs risks inconsistency.
- *Chosen approach:* `company_id` on leaf/root tables (divisions, designations, pms_grades, levels) with hierarchical inheritance for BUs/departments/sub-branches through their parent division. Simple, consistent, and avoids redundant data.

---

### §53 — Auth Resilience: No Indefinite Skeletons on Missing Identity Data

**Rule:** Authenticated entry screens (Dashboard, Home, Profile) must never remain in an indefinite loading/skeleton state when required identity records (profile, role) are missing or fail to load. The UI must fail visibly and recoverably.

**Rationale:** When `fetchProfile()` used `.single()` and the catch block returned `true`, auth loading completed with `profile === null`. Since `Dashboard.tsx` rendered `<DashboardSkeleton />` for `!profile`, users saw an infinite spinner with no way to recover.

**Invariant:**
1. `AuthContext.fetchProfile()` uses `.maybeSingle()` — never `.single()` — and sets an explicit `profileError` flag on failure or missing rows.
2. All top-level pages that require a profile must check both `loading` AND `profileError`/`!profile` states, rendering an actionable error (Retry + Sign Out) instead of an infinite skeleton.
3. The Auth/login page must never block rendering on optional configuration fetches (e.g., branding settings from `app_settings`). These are progressive enhancements with fallback defaults.

**Decision Context & Alternatives Considered:**
- *Alternative A: Auto-create profile on first login via trigger* — Deferred; already handled by existing `on_auth_user_created` trigger. Backfill migration addresses historical gaps.
- *Alternative B: Redirect to a setup wizard* — Over-engineered for the current use case where missing profiles indicate a data bug, not a normal flow.
- *Chosen approach:* Explicit error state with retry capability, plus backfill migration for existing broken records.

---

### §54 — Multi-Month Workflow Independence Invariant

**Rule:** Quarterly, Bi-Monthly, Half-Yearly, and Yearly KPIs must complete the full workflow independently in each month. The `percolate_multimonth_score` trigger must NOT auto-approve sibling months that have not independently reached their terminal workflow stage. System auto-scoring (score=0, rating=red) applies exclusively to overdue self-reviews (not submitted by the 10th) per ADR-048. No other system-initiated scoring is permitted.

**Rationale:** The original trigger blindly set sibling KPIs to `approved` status, bypassing all intermediate workflow stages including audit. This caused ~40 KPIs in 2026 to be approved without auditor review.

**Invariant:**
1. When a terminal-month KPI is approved, the trigger checks each sibling's current workflow stage against its terminal stage.
2. If a sibling is already `approved`, only scores are copied (no status change).
3. If a sibling is at its terminal workflow stage, it is approved and scores are copied.
4. If a sibling is mid-workflow, its status is NOT touched and a `PERCOLATION_DEFERRED` audit log is recorded.
5. All percolated submissions include `auto_advance_reason = 'Score percolated from terminal month'` for traceability.

**Decision Context & Alternatives Considered:**
- *Alternative A: Allow percolation to bypass workflow* — Rejected; caused auditor bypass and 40+ incorrectly approved KPIs.
- *Alternative B: Disable percolation entirely* — Rejected; score consistency across cycle months is still needed for already-completed KPIs.
- *Chosen approach:* Workflow-stage guard in the trigger + `PERCOLATION_DEFERRED` audit trail for mid-workflow siblings.

**Related ADR:** [ADR-047](docs/adr/ADR-047.md)

**UX Clause (added 2026-04-29):** All admin-facing KPI creation and edit dialogs MUST display, for any KPI with `frequency ∈ {Bi-Monthly, Quarterly, Half-Yearly, Yearly}`, an information banner that surfaces (a) the **full cycle month range** the KPI covers and (b) the **review anchor month** (cycle terminal). The banner MUST also expose a tooltip that explains the percolation contract so users do not perceive the cycle-end anchor behavior as a defect. Use the canonical helper `buildCycleScopeLabel()` in `src/lib/frequencyUtils.ts` — never recompute cycle months ad-hoc. Reference: `mem://features/admin/multi-month-kpi-cycle-ux`, tests in `src/test/multiMonthBannerCopy.test.ts`.

**UX Corollary — Pending-Period Alerts (added 2026-05-16):** Self-mode "You have N pending KPI(s) for {Month} {Year}" banners, and any equivalent reviewer-side actionable counter, MUST exclude non-anchor placeholder rows of multi-month cycles. Only the cycle's anchor (terminal) month is user-actionable; April/May rows of an Apr–Jun Quarterly cycle exist solely to receive percolated scores from the June approval and MUST NOT prompt the user to "act". All such derivations MUST resolve the anchor through `buildCycleScopeLabel()` — never by raw month comparison. Reference impl: `src/components/review/UnifiedScorecard.tsx` `pendingPeriods` memo. Tests: `src/test/pendingPeriodsMultimonth.test.ts`.

---

### §55 — System Audit Log Performer Attribution Invariant

**Rule:** All system-initiated actions (triggers, migrations, automated workflows) MUST use `performed_by = NULL` in audit logs. Triggers and functions must NOT fall back to arbitrary admin users or KPI owners when `auth.uid()` is NULL. The UI must display "System" for NULL performers.

**Rationale:** Two bugs caused misleading attribution: (1) `percolate_multimonth_score` fell back to `SELECT user_id FROM user_roles WHERE role = 'admin' LIMIT 1`, attributing system actions to an arbitrary admin; (2) `log_kpi_status_transition` used `COALESCE(auth.uid(), NEW.employee_id)`, making it appear employees changed their own status during migrations.

**Invariant:**
1. `performed_by` column in `kpi_audit_logs` is nullable.
2. When `auth.uid()` returns NULL (no user session), `performed_by` must be set to NULL.
3. No trigger or function may use fallback patterns like `SELECT user_id FROM user_roles` or `COALESCE(auth.uid(), NEW.employee_id)`.
4. The Review Timeline UI displays "System" with a distinct visual badge for NULL performers.
5. Cleanup was applied to 80 incorrectly attributed logs from the 2026-04-05 bulk step-back migration.

**Decision Context & Alternatives Considered:**
- *Alternative A: Create a dedicated "system" user account* — Rejected; adds complexity and doesn't prevent future fallback bugs.
- *Alternative B: Keep NOT NULL constraint and use a sentinel UUID* — Rejected; sentinel values are brittle and require coordination.
- *Chosen approach:* NULL performer = system action. Simple, explicit, and handled gracefully in UI.

---

## §56 — Mandatory Audit Trail for Review Submission Score Changes

**Effective Date:** 2026-04-05

All changes to score fields in `review_submissions` (self_score, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score) MUST produce an audit trail entry in `kpi_audit_logs`.

**Rules:**
1. Application code performing score updates must write a corresponding `kpi_audit_logs` entry in the same operation.
2. A safety-net database trigger (`trg_log_untracked_submission_changes`) automatically logs any score change as `SUBMISSION_SCORE_CHANGED` with `metadata.source = 'safety_net_trigger'`.
3. The presence of `safety_net_trigger` entries in production indicates a code path that bypassed proper audit logging and must be investigated and fixed.
4. No bulk update to `review_submissions` score fields is permitted without a corresponding audit trail — whether via migration, edge function, or admin tool.

**Decision Context & Alternatives Considered:**
- *Alternative A: Rely solely on application-level logging* — Rejected; a silent bulk operation on 2026-04-01 zeroed 159 management_scores with no trace.
- *Chosen approach:* Database-level safety-net trigger ensures no score change goes unlogged, regardless of the source.

---

## §57 — Audit Log Performer Visibility

**Effective Date:** 2026-04-05

Audit log performer names must be visible to any user who can view the audit log entry, regardless of the viewer's reporting chain or RLS restrictions on the `profiles` table.

**Rules:**
1. All timeline/audit display components must fetch performer profiles via the `get_profiles_for_audit_display(p_user_ids uuid[])` SECURITY DEFINER function, NOT via direct `profiles` table queries.
2. The function only returns `id`, `full_name`, and `email` — no sensitive fields are exposed.
3. This applies to both `KpiTimeline` (employee/manager view) and `OrgKpiHistoryTimeline` (admin/data-owner view).
4. Any new timeline or audit display component must use this same RPC pattern.
5. All action types that can appear in `kpi_audit_logs` must have a corresponding entry in the `actionConfig` map in `KpiTimeline.tsx` with appropriate icon, color, and label.

**Rationale:** Employees viewing their own KPI timeline could not see admin/auditor names because the `profiles` table RLS correctly restricts visibility to the reporting chain. However, hiding the performer's name on an audit entry the user already has access to adds no security — only confusion ("Unknown user"). The SECURITY DEFINER function resolves this for all existing and future audit log entries.

**Decision Context & Alternatives Considered:**
- *Alternative A: Relax profiles RLS policies* — Rejected; would expose all profile data to all users.
- *Alternative B: Store performer name directly in audit log* — Rejected; duplicates data and doesn't handle name changes.
- *Chosen approach:* SECURITY DEFINER function scoped to display-only fields, called exclusively by timeline components.

---

## §58 — Multi-Month Cycle Completion Gate

**Effective Date:** 2026-04-05

Multi-month KPIs (Quarterly, Bi-Monthly, Half-Yearly, Yearly) can only enter the review workflow after the terminal month's cycle period has ended. This prevents premature reviews with incomplete data.

**Rules:**
1. **Sibling months** (non-terminal months in a cycle) are blocked from ALL status transitions — not just the initial submission. They are never directly reviewable.
2. **Terminal months** are blocked from transitioning `kra_set → self_review` until `CURRENT_DATE > last day of terminal month`. For example, a Q1 March KPI can only be reviewed starting April 1.
3. **Admin bypass** is preserved — administrators can step back or modify KPIs regardless of cycle status.
4. **Service role bypass** is preserved — automated processes (rollover, percolation) are not affected.
5. **UI enforcement**: The `isCycleComplete()` utility function mirrors the trigger logic in the frontend, showing "Cycle in progress" messaging when the terminal month hasn't ended yet.
6. **Score percolation** from terminal to sibling months remains unchanged — it fires only when the terminal month reaches `approved` status after completing the full workflow.

**Data Correction (2026-04-05):** 18 KPIs that were prematurely reviewed before cycle completion were bulk-reset to `kra_set` status with full audit trail.

**Rationale:** Performance data for a quarter/bi-monthly/half-yearly/yearly period is only complete after the terminal month ends. Allowing reviews before this date risks scoring based on incomplete data, which undermines the integrity of the review process.

**Decision Context & Alternatives Considered:**
- *Alternative A: UI-only gate (no trigger)* — Rejected; would not prevent API-level premature reviews.
- *Alternative B: Lock based on a configurable date offset* — Rejected; adds unnecessary complexity. The natural cycle end (last day of terminal month) is the correct boundary.
- *Chosen approach:* Database trigger blocks all non-admin transitions + UI shows clear messaging.

---

## §59 — Mandatory Propagation Confirmation

**Effective Date:** 2026-04-05

All propagation actions in the Org KPI Data Entry system **must** require explicit user confirmation via a confirmation dialog before execution. This applies to:

1. **Main "Propagate" button** — already gated by `AlertDialog` (existing).
2. **"Propagate Selected" button** — already gated by `AlertDialog` (existing).
3. **Per-row propagate button** — now gated by `AlertDialog` (added in this policy).
4. **Any future propagation path** — must include a confirmation dialog before triggering the propagation RPC.

**Rationale:** Accidental propagation (especially on mobile devices with small tap targets) locks the Org KPI entry for non-admin users and pushes potentially incomplete data to employee scorecards. Requiring explicit confirmation prevents data integrity issues caused by accidental taps.

**RCA (2026-04-05):** A manager (Biswajit) accidentally propagated Org KPI values while entering data on a mobile device (389px viewport). The per-row propagate button (28×28px) was adjacent to input fields and had no confirmation gate, unlike the main propagate buttons.

---

## §60 — Workflow Change Step-Back for Approved KPIs

**Effective Date:** 2026-04-05

When an admin changes an employee's (or department's/PMS grade's) workflow template assignment, the system **must** automatically detect and step back any `approved` KPIs if the new workflow introduces review stages beyond the old workflow's terminal reviewer.

### Rules

1. **Detection**: The database trigger `trg_workflow_change_step_back` fires on INSERT or UPDATE of `workflow_config` when `workflow_template_id` changes.
2. **Comparison**: The trigger compares old and new workflow stages using canonical stage ordering (`kra_set < self_review < manager_check < skip_level_check < hr_pms_review < audit < management_review`).
3. **Step-back**: If the new workflow has stages canonically beyond the old terminal reviewer, all `approved` KPIs for the affected employees/period are reverted to the stage preceding the new uncovered stage.
4. **Score preservation**: All existing reviewer scores (self, manager, HR PMS, etc.) are preserved. Only `final_score` and `final_rating` are cleared.
5. **Audit trail**: Each stepped-back KPI receives a `WORKFLOW_CHANGE_STEP_BACK` audit log entry with old/new template IDs and the step-back reason.
6. **UI notification**: The workflow config UI shows a toast warning when KPIs are stepped back, informing the admin of the count and target stage.

**Rationale:** KPIs approved under a shorter workflow (e.g., HR PMS as terminal) must not remain `approved` when the workflow is extended (e.g., adding audit). The new terminal reviewer must review and approve these KPIs.

**RCA (2026-04-05):** KPI `ee7db054` (employee 100482, Samir Dey) was approved by HR PMS on Mar 28 under `self_l1_hr_pms`. On Apr 4, admin changed the workflow to `self_l1_audit`. The KPI remained `approved` despite never going through audit. 39 KPIs across 7 employees were affected.

---

### §62 — ViewLevel Determination from Reporting Chain

**Effective Date:** 2026-04-05

**Policy:**

1. **Reporting chain is the authority**: The `viewLevel` for a reviewer scorecard (e.g., `manager` vs `skip_level`) MUST be determined by querying the actual reporting chain in the database, NOT by relying on in-memory metadata tags from the employee selector grid.
2. **Resolution logic**: When an employee is selected for review in `team` view mode:
   - If the employee's `reporting_manager_id` equals the current user's ID → `viewLevel = 'manager'`
   - If the employee's manager's `reporting_manager_id` equals the current user's ID → `viewLevel = 'skip_level'`
   - Otherwise → `viewLevel = 'manager'` (default for admin/HR viewing non-chain employees)
3. **All selection paths**: This resolution must occur in every path that selects an employee: grid click, deep-link with KPI, deep-link without KPI, and URL restoration on refresh.
4. **No regression**: Grid-tagged `relationship` values are trusted if present (optimization). The reporting chain lookup is the fallback guarantee.

**Rationale:** The `relationship` tag set by the grid is fragile — it depends on skip-level data being fully loaded, is absent during URL restoration and deep-links, and is subject to race conditions. Skip-level managers (e.g., employee 101125 reviewing 101358) were unable to review KPIs at `manager_check` status because `viewLevel` incorrectly resolved to `manager`.

**RCA (2026-04-05):** Employee 101125 is the skip-level manager for several HR department employees including 101358. When viewing 101358's scorecard in team view, the `viewLevel` resolved to `manager` instead of `skip_level` because the `relationship` property was missing (URL restoration path). This caused the scorecard to use `viewType = 'team-review'`, which blocks review actions on KPIs at `manager_check` status.

---

### §63 — Daily Email Reminders for Unresponded Queries & Observations

**Policy:**

1. **Automatic daily reminders**: The system sends daily email reminders (at 9:00 AM IST) to employees who have open (unresponded) queries or unacknowledged observations.
2. **Consolidated emails**: Each recipient receives a single consolidated email listing all their pending queries or observations, not individual emails per item.
3. **Auto-stop**: Reminders cease automatically once the employee responds to/resolves the query or acknowledges the observation.
4. **Admin control**: Both reminder types (`query_response_reminder`, `observation_response_reminder`) are independently toggleable via Email Notification Settings.
5. **Respects global toggle**: Reminders are only sent when the global email notifications toggle is enabled.
6. **No duplicate sends**: Reminders are stateless — they query current `open` status each day. Once status changes, the item is excluded from future reminders.

---

### §64 — Auditor Cross-Check Visibility

**Effective Date:** 2026-04-05

**Policy:**

1. **Cross-check filter**: The Audit Panel includes an "All Employees (Cross-Check)" status filter that shows ALL active employees regardless of whether their workflow includes an audit stage.
2. **Read-only access**: When viewing employees via cross-check whose workflow does not include an audit stage, the auditor can view scores from other reviewers but cannot submit audit scores.
3. **No workflow bypass**: The cross-check mode does not add audit capability to employees' workflows — it only provides read-only visibility for score verification purposes.
4. **Demographic filters apply**: Standard demographic filters (department, designation, grade, manager) still apply in cross-check mode.
5. **Existing filters unchanged**: All existing audit panel filters (All Employees, My Assignments, Pending, In Audit, Forwarded) continue to respect workflow stage requirements.

---

## §65 — Per-Template Email Dispatch Scheduling

**Effective Date:** 2026-04-05

**Policy:**

1. **Per-template configuration**: Each email template can be independently configured to send either immediately (on event) or at a scheduled daily time.
2. **Default behavior**: All templates default to "Send Immediately" — no change to existing behavior until explicitly configured by an admin.
3. **Queue mechanism**: When a template is set to "Scheduled", triggered emails are queued in `email_dispatch_queue` and dispatched at the configured time (checked every 15 minutes).
4. **Stale protection**: Queued emails older than 24 hours are automatically skipped to prevent email floods after system downtime.
5. **Cleanup**: Sent queue entries are automatically purged after 7 days.
6. **Security exceptions**: Security-critical events (`email_changed`, `password_rollout`) bypass the schedule check and always send immediately regardless of schedule configuration.
7. **Timezone**: Schedule times are evaluated in the configured timezone (default: Asia/Kolkata).
8. **Fallback**: If queuing fails, the email is sent immediately as a failsafe.

---

## §66 — Self-Review Recall Policy

**Effective Date:** 2026-04-07

**Policy:**

1. **Recall window**: Employees may withdraw (recall) their submitted self-review within a configurable time window set by the Admin in System Settings.
2. **Default duration**: 24 hours from the time of submission.
3. **Manager gate**: Recall is blocked if the manager has entered any scores or remarks for the KPI. In such cases, the employee must use the formal Rollback Request process.
4. **Status revert**: Upon recall, the KPI status reverts from `self_review` to `kra_set`, and all self-review fields (achieved value, score, rating, remarks, evidence) are cleared.
5. **Audit trail**: Every recall action is logged as `SELF_REVIEW_RECALLED` in the KPI audit log with the performer's identity and timestamp.
6. **No limit on resubmissions**: After a recall, the employee may edit and resubmit without restriction (subject to governance window rules).
7. **Admin control**: The recall window can be set to 1, 2, 4, 6, 12, 24, 48, or 72 hours, or disabled entirely. When disabled, employees must use Rollback Requests for corrections.
8. **Ownership**: Only the KPI owner (employee_id) can recall their own submission. Managers and admins cannot recall on behalf of employees.

---

## §67 — Send-Back Data Preservation Policy

**Effective Date:** 2026-04-08

**Policy:**

1. **Self-review data preserved**: When a KPI is sent back to `kra_set` (by any reviewer level), the employee's self-review data (`self_score`, `self_rating`, `self_remarks`, `self_evidence_url`, `self_evidence_urls`, `achieved_value`) is **preserved**. The employee can see what they originally submitted and make targeted corrections.
2. **Reviewer data cleared**: All reviewer-level fields (manager, skip-level, HR PMS, auditor, management) are cleared to prevent stale assessment data from persisting through a revision cycle.
3. **Final scores cleared**: `final_score` and `final_rating` are always cleared on send-back, as the KPI must go through the full review chain again.
4. **NA flags reset**: `is_na` and `na_marked_by_role` are reset to `false`/`NULL` on send-back.
5. **Database trigger enforcement**: The `sync_submission_on_kra_set` database trigger enforces this policy at the database level, ensuring consistency regardless of which application path triggers the send-back.
6. **Send-back context**: The reason for send-back is stored in `kpi_queries` (type: `send_back`) and displayed via `SentBackBanner` on the employee's review sheet.

---

## §68 — Workflow Reconciliation Branch Precedence

**Effective Date:** 2026-04-08

**Policy:**

1. **Branch 1 (Orphaned status)**: Fires when a KPI's current status is not in its workflow template stages. Maps to the next canonical stage present in the workflow, or approves if none found. This handles workflow template changes that removed a stage.
2. **Branch 2a (Terminal stage completed)**: Fires when a KPI is at the last workflow stage and has a score. Advances to `approved` and sets `final_score`/`final_rating` from the terminal reviewer.
3. **Branch 2b (Scored not forwarded)**: Fires when a KPI has a score at its current stage but hasn't been forwarded. **Guarded**: only advances if no subsequent reviewer stage exists in the workflow. If a next reviewer exists, the branch is skipped (the KPI is at a valid resting state).
4. **Branch 3 (Review stage mismatch)**: Scans backwards from the last workflow stage to find downstream scores that exist while the KPI is at an earlier status. **Rollback-aware**: checks `kpi_audit_logs` for recent rollback/step-back actions. If a rollback is more recent than the submission, the downstream score is ignored (it's pre-rollback stale data).
5. **Branch interaction safety**: Branch 2b and Branch 3 do not conflict because Branch 2b only fires for the current stage (and only when no next reviewer exists), while Branch 3 only fires for stages beyond the current one (and respects rollback history). Both branches are mutually exclusive per KPI per reconciliation run.

---

## §57. Management Draft vs. Approved Distinction

**Effective Date:** 2026-04-08

**Policy:**

1. **Draft Save** (`MANAGEMENT_REVIEWED`): When a management reviewer scores a KPI and clicks "Save Draft", the `management_score` and `management_remarks` are persisted, but `final_score` remains `NULL` and status stays at `management_review`. This is an intermediate state — the KPI has NOT been finalized.

2. **Approval** (`MANAGEMENT_APPROVED`): When a management reviewer clicks "Approve", the `management_score` is copied to `final_score`/`final_rating`, and the KPI status transitions to `approved`. This is the terminal action that finalizes the KPI.

3. **Bulk Approve**: Management reviewers may use the "Approve All Drafted" button to batch-approve all KPIs that have been drafted (scored but not approved) for a given employee and period. Each KPI receives the same individual approval treatment: `management_score` → `final_score`, status → `approved`, audit log entry with `MANAGEMENT_APPROVED` action and `bulk_approve: true` metadata.

4. **Visual Indicator**: Drafted KPIs display an amber "Drafted" badge in the action column to distinguish them from unscored KPIs awaiting review. This badge is visible to management reviewers and to other review levels (as "Draft (Mgmt)").

---

## §69. Migration Scope Guards for Multi-Month KPIs

**Effective Date:** 2026-04-09

**Policy:**

1. **Cycle-Aware Filtering**: All database migrations that target multi-month KPIs (Bi-Monthly, Quarterly, Half-Yearly, Yearly) MUST include explicit cycle-aware period filters. Filtering by `review_period` alone is insufficient — the migration must determine which cycle the period belongs to and whether that cycle was complete at the time of the migration.

2. **Bi-Monthly Cycle Awareness**: In the Bi-Monthly scheme, each period belongs to one of six cycles: Dec-Jan, Feb-Mar, Apr-May, Jun-Jul, Aug-Sep, Oct-Nov. January belongs to the Dec-Jan cycle (terminal = December) AND the Feb-Mar cycle (as a non-member). Migrations must not conflate these.

3. **Quarterly Cycle Awareness**: Q1 = Jan-Mar (terminal = March), Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec. January is a Q1 sibling, not a standalone entity.

4. **Completion Check**: A cycle is considered "complete" when its terminal month's calendar end date has passed. Migrations targeting "premature" reviews must verify the cycle is NOT yet complete before resetting.

5. **Incident Reference**: On April 5, 2026, a migration reset 28 Bi-Monthly January 2026 KPIs belonging to the completed Dec-Jan cycle. These were restored via re-percolation from intact December 2025 terminal data (`ADMIN_BULK_RESTORE` audit action).

## §70. Unscored KPI Exclusion from Weighted Averages

**Effective Date:** 2026-04-09

**Policy:**

1. **Definition**: An "unscored KPI" is one where a `review_submissions` row exists but ALL score fields across all 8 stages (self_score, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score) are NULL. This typically occurs for KPIs at the `kra_set` stage where the submission row was auto-created by the `trg_sync_submission_on_kra_set` trigger.

2. **Exclusion Rule**: Unscored KPIs MUST be excluded from both the numerator and denominator of weighted average calculations — identical to N/A KPI treatment.

3. **Rationale**: Including unscored KPIs as score=0 artificially deflates the weighted average. An unscored KPI represents incomplete data, not a zero rating. The 8-stage fallback chain returning `null` (no score available) is semantically different from a reviewer explicitly assigning score=0.

4. **Invariant**: All scoring consumers (`useEmployeeScoresForPeriod`, `UnifiedScorecard`, `PreviousMonthsScoreMini`, Management Dashboard) must use the same exclusion logic: if the 8-stage fallback chain returns `null`, the KPI is excluded from weighted average calculations.

5. **Incident Reference**: Employees 100017 (Satyam) and 101773 (Dippendu) showed mismatched scores between the Employee Grid (correct: excluded unscored KPIs) and Scorecard Detail (incorrect: counted unscored KPIs as 0). Fixed in v2.17.7 by aligning `getRelevantScore` fallback from `?? 0` to `?? null`.

## §71. Cycle-Aware Multi-Month KPI Resolution

**Effective Date:** 2026-04-09

**Policy:**

1. **Per-KPI Cycle Start**: All multi-month frequency operations (percolation, locking, rollover, retroactive incentive detection) MUST resolve cycle boundaries using the KPI's `frequency_cycle_start` column. The global `frequency_config` table is a fallback ONLY when `frequency_cycle_start` is NULL.

2. **Resolution Priority**: Per-KPI override (`kpis.frequency_cycle_start`) → Global config (`frequency_config.sub_frequency`) → Hardcoded calendar default (first option in `frequencyCycleOptions.ts`).

3. **Cross-Cycle Contamination Prevention**: Score percolation MUST NOT copy scores from a terminal month to a sibling that belongs to a different cycle. The `get_cycle_months()` DB function must receive the KPI's `frequency_cycle_start` to correctly identify same-cycle siblings.

4. **Locking Invariant**: The `enforce_frequency_lock_on_submission` trigger must use the KPI's `frequency_cycle_start` to determine which months are locked (sibling/non-terminal) and which are terminal (reviewable). Incorrect locking due to mismatched cycle assumptions violates workflow integrity.

5. **Edge Function Alignment**: All edge functions that compute cycle months (`auto-rollover-kpis`, `detect-retroactive-incentive-changes`) must pass `frequency_cycle_start` from the source KPI when resolving cycle boundaries.

6. **Incident Reference**: 132 Bi-Monthly KPIs with `frequency_cycle_start = 'Feb-Mar'` were subject to cross-cycle contamination: January (terminal of Dec-Jan) incorrectly percolated scores to February (start of Feb-Mar cycle). Fixed in v2.17.8 by parameterizing `get_cycle_months()` with `p_cycle_start`.

---

### §72 — Incentive Data Entry Access for Menu Override Users

**Effective:** v1.79.0

1. **Scope**: Users granted the `admin-incentive-data` menu access override can perform data entry on incentive tables without requiring the full `admin` role.

2. **Profile Visibility**: Users with `admin-incentive-data` override can view ALL active employee profiles (`is_active = true`). This is required because incentive program mappings resolve employees across all departments — the standard manager-only profile visibility is insufficient.

3. **Table Access**: The `admin-incentive-data` override grants the following database-level permissions:
   - `employee_incentive_eligibility`: View, Create, Edit
   - `incentive_vessel_rates`: View, Create, Edit, Remove
   - `incentive_production_rates`: View, Create, Edit, Remove
   - `production_daily_entries`: View, Create, Edit, Remove
   - `incentive_eligibility_fields`: View (configuration read-only)

4. **Distinction from `admin-incentive`**: The `admin-incentive` menu key grants full incentive program configuration access (programs, slabs, rules) **and** compute authority (triggering `compute-monthly-incentives` edge function). The `admin-incentive-data` key grants only data entry capabilities. Both keys are independently checked in RLS — a user may have one or both.

5. **Security**: All access is gated by the `has_menu_access_override()` SECURITY DEFINER function, which checks the `menu_access_user_overrides` table. Only admins can grant overrides via the Menu Access Rights UI.

6. **Incident Reference**: User 201091 (Upendra Singh, role: manager) was granted `admin-incentive-data` override but could not see any employees on Incentive Data Entry. Root cause: (a) `profiles` RLS had no policy for this menu key, and (b) eligibility/production tables checked for `admin-incentive` instead of `admin-incentive-data`. Fixed in v1.79.0 by adding dedicated RLS policies.

---

### §73 — Incentive Edge Function RBAC: Shared Auth Helper

1. **Mandate**: All incentive edge functions (`compute-monthly-incentives`, `detect-retroactive-incentive-changes`, and any future incentive functions) **must** use the shared `checkIncentiveAccess()` helper from `supabase/functions/_shared/incentive-auth.ts`. Inline hardcoded role checks are prohibited.

2. **Authorization Tiers**:
   - **Tier 1 — Privileged Roles**: Users with `admin` or `hr_pms` roles in `user_roles` are always authorized.
   - **Tier 2 — Menu Override (Role-Agnostic)**: Users with **any** base role (`employee`, `manager`, `auditor`, etc.) are authorized if they have a matching entry in `menu_access_user_overrides` for **any** of the specified menu keys. The helper accepts a single key or an array of keys.
   - **Service Role Token**: Internal/cron calls using the service role key bypass all checks.

3. **Menu Key Mapping**:
   | Edge Function | Accepted Menu Keys (any one suffices) |
   |---|---|
   | `compute-monthly-incentives` | `admin-incentive`, `reports-incentive` |
   | `detect-retroactive-incentive-changes` | `admin-incentive`, `reports-incentive` |

4. **Granting Access**: Admins use **System Settings → Menu Access → User Overrides** to grant `admin-incentive` or `reports-incentive` to any user. Either override authorizes edge function execution. No code change or redeployment is required.

5. **Security**: The shared helper validates the JWT, checks roles, and checks overrides in a deterministic order. It never exposes internal error details to the client.

---

## §74 — Org KPI Propagation Lifecycle Policy

1. **Data Entry vs. Propagation**: Saving org KPI data via the "Save" button creates `org_kpi_values` records with `status = 'entered'`. These records are NOT automatically pushed to employee KPIs. The data owner must explicitly use "Save & Propagate" to trigger the `propagate_org_kpi_value` RPC.

2. **Propagation Effect**: When propagation runs, it:
   - Creates/updates `review_submission` records for matching employee KPIs
   - Advances `kpi.status` from `kra_set` → `self_review`
   - Creates `ORG_KPI_PROPAGATED` audit log entries for timeline visibility
   - Updates `org_kpi_values.status` to `'propagated'`

3. **Display Guard**: The Review Journey "Self" stage MUST NOT display a computed rating from `org_kpi_values` when no `review_submission` record exists. The `orgAchievedValue` fallback is only used when a submission record is present (i.e., propagation has already occurred).

4. **Repair Mechanism**: The `repair-orphaned-propagations` edge function supports a two-phase workflow:
   - **Scan Phase** (`mode: "scan"`): Read-only scan that identifies orphaned KPIs and returns detailed per-KPI information without modifying data. Admin reviews results in a data table with checkboxes.
   - **Repair Phase** (`mode: "repair"`, `kpi_ids: [...]`): Repairs only the admin-selected KPIs. Requires explicit confirmation via a destructive action dialog before execution.
    - Downloadable Excel reports are available after both scan (scan report) and repair (multi-sheet repair report with summary, details, and errors).
    - **Post-Repair Verification**: After repair, three automated checks validate results: (1) KPIs confirmed in `self_review`, (2) `review_submissions` confirmed created, (3) remaining orphan count. Results are displayed in the UI and included in reports.
    - Accessible via **System Settings → Data Repair → Repair Orphaned Propagations**. Each run processes up to 1,500 records.

---

### §75 — Step-Back Sibling Preservation & Re-percolation

1. **Guard Rule**: Bulk step-back operations targeting multi-month KPIs (Bi-Monthly, Quarterly, Half-Yearly, Yearly) **must preserve non-terminal sibling months** when the terminal month of that cycle is already independently `approved` with a `final_score`. Only genuinely prematurely reviewed KPIs should be stepped back.

2. **Recovery Tool**: The `repair-stepped-back-siblings` edge function provides a managed two-phase recovery with three recovery paths:
   - **Same-Year Sibling Recovery**: Non-terminal KPIs recover from their approved terminal sibling in the same review year.
   - **Cross-Year Sibling Recovery**: Non-terminal KPIs in wrapping cycles (e.g., Dec-Jan) recover from their terminal sibling in the previous year.
   - **Audit-Log Self-Recovery**: Terminal months that were previously approved and then bulk-stepped-back reconstruct their submission data from audit log entries (ORG_KPI_PROPAGATED, MANAGER_FORWARDED, SKIP_LEVEL_FORWARDED, HR_PMS_FORWARDED, etc.).
   - All paths: Scan phase returns per-KPI detail rows with `recovery_type`. Repair phase copies/reconstructs submission data, advances status to `approved`, logs `SIBLING_RE_PERCOLATION` audit entry. Post-repair verification confirms advancement.
   - **Post-Repair Verification**: Confirms KPIs advanced to `approved`, submissions exist, and reports remaining stuck count.

3. **Cycle Resolution**: The function uses `frequency_cycle_start` to correctly identify cycle boundaries and terminal months. Non-terminal months within a cycle are candidates; terminal months themselves are skipped.

4. **Cross-Year Cycle Recovery**: For cycles that span a year boundary (e.g., Dec-Jan Bi-Monthly with `cycle_start = "Feb-Mar"`), the repair tool resolves the terminal sibling in the **previous calendar year**. Example: a January 2026 KPI stuck at `kra_set` will be matched to its terminal sibling December 2025 if that sibling is `approved` with a `final_score`. Audit logs include `recovery_type: "cross_year"` for traceability.

5. **Scope Restriction**: This repair tool only targets KPIs with `review_year >= 2026` to preserve historical data integrity (per Migration Governance §69). Cross-year lookups extend to `review_year >= 2025` for terminal siblings only.

6. **Access**: Admin-only. Accessible via **System Settings → Data Repair → Repair Stepped-Back Siblings**.

---

## §76 — Admin Bulk Zero-Score for Non-Submitters

### Purpose
When employees fail to submit their monthly KPI data by the deadline, admins may administratively assign a score of 0 across all review levels for all unsubmitted KPIs. This penalizes non-compliance and ensures the review cycle can close on time.

### Scope
1. **Employee KPIs**: Any KPI still at `kra_set` or `self_review` status for the selected period/year is eligible for zero-scoring.
2. **Org KPIs** (optional): Org-level KPI values where the data owner has not entered data (`achieved_value IS NULL`) may also be zero-scored.
3. **Exclusions**:
   - Sent-back KPIs with open queries are excluded (employee is awaiting resolution).
   - N/A-marked KPIs are excluded.
   - Non-terminal months of multi-month KPIs (Bi-Monthly, Quarterly, Half-Yearly, Yearly) are excluded — only the terminal month is actionable.

### Scoring Rules
1. When a KPI is zero-scored, the system writes `score = 0` and `rating = 0` to **every review stage** in the employee's assigned workflow pipeline (Self, Manager, Skip-Level, HR PMS, Auditor, Management).
2. `final_score` and `final_rating` are set to 0.
3. `kpi_status` is set to `locked` in `review_submissions`; `kpis.status` advances to `approved`.
4. `auto_advance_reason` contains the admin's remarks and batch identifier, visible in all review panels.
5. Zero scores are treated as real scores (not N/A) and flow into weighted average calculations and incentive computations.

### Workflow Resolution
The system resolves each employee's workflow template using the standard hierarchy:
- Period-specific workflow config → Global workflow config → System default template
This ensures the correct stages are zeroed per employee.

### Audit Trail
1. Each KPI receives a `kpi_audit_logs` entry with `action = 'ADMIN_BULK_ZERO_SCORE'`, recording `performed_by`, `batch_id`, old/new values, and metadata (period, year, reason).
2. Org KPIs receive an `org_kpi_data_entry_logs` entry with `action = 'admin_zero_scored'`.
3. All entries in a single operation share a common `batch_id` (UUID) for traceability and reporting.

### Safety Controls
1. **Scan-before-execute**: Admins must first scan to preview affected KPIs before any zero-scoring occurs.
2. **Elevated confirmation**: The execution dialog requires typing "ZERO" to confirm — standard button-click is insufficient.
3. **Prior batch detection**: If a bulk zero-score batch was already executed for the same period/year, a warning is displayed. When scanning a single employee, the warning is scoped to that employee only.
4. **Post-execution verification**: The system confirms KPIs advanced to `approved` and submissions contain `final_score = 0`.
5. **Excel reporting**: Both scan results and execution results can be exported as multi-sheet Excel files.
6. **Organizational scoping**: Cascading Division → Business Unit → Department filters allow admins to scope the scan to a specific org unit, reducing accidental zero-scoring risk.

### Batched Data Fetching
The scan query uses batched fetching (500 rows per batch) to bypass the default 1000-row limit, ensuring all non-submitters are visible.

### Access
Admin-only. Accessible via **System Settings → Data Repair → Bulk Zero-Score Non-Submitters** or via the **Zero-Score button** on an individual employee's KPI Details header in the dashboard.

---

## §82 — Employee Self-Review Compliance Penalty

### Purpose
Employees who fail to complete all self-reviews by a configurable deadline have their pending KPIs zero-scored and their "Implementation of common - policies / systems / processes" compliance KPI penalized.

### Trigger
Deadline-based: the penalty applies after the `compliance_penalty_deadline_day` of the month following the review period. Admin-triggered via the Pending Reviews > Compliance Penalty tab.

### Scope
All employees with rolled-out KRAs for the selected period whose non-excluded KPIs remain at `kra_set` or `self_review` status past the deadline.

### Configurable Exclusions (all independently toggleable)
1. **Org-level KPIs** (`compliance_exclude_org_kpi`) — default ON
2. **Sent-back KPIs** (`compliance_exclude_sent_back`) — default ON
3. **Quarterly KPIs not due** (`compliance_exclude_quarterly_not_due`) — default ON
4. **Bi-Monthly KPIs not due** (`compliance_exclude_bimonthly_not_due`) — default ON
5. **Half-Yearly KPIs not due** (`compliance_exclude_halfyearly_not_due`) — default ON
6. **Yearly KPIs not due** (`compliance_exclude_yearly_not_due`) — default ON

### Penalty Actions
1. **Zero-score ALL remaining pending KPIs** at `kra_set`/`self_review` (after exclusions) — `final_score=0`, `final_rating=red`, `status=approved`
2. **Additionally zero the compliance KPI** ("Implementation of common - policies / systems / processes") regardless of its current status

### Audit Trail
Each penalized KPI receives a `kpi_audit_logs` entry with `action = 'EMPLOYEE_COMPLIANCE_PENALTY'`, recording `batch_id`, `penalty_type` (pending_kpi_zero or compliance_kpi_zero), `review_period`, `review_year`, and the system remark.

### Rollback
Full batch rollback available via the Compliance Penalty Rollback section. Reverts KPI status to pre-penalty state and clears submission scores. Logged as `COMPLIANCE_PENALTY_ROLLBACK`.

### Admin Settings
- `compliance_penalty_enabled` — feature toggle (default OFF)
- `compliance_penalty_deadline_day` — deadline day of following month (default 10)
- `compliance_penalty_auto_remark` — system remark applied to zeroed KPIs

### Access
Admin-only. Managed via **Pending Reviews → Compliance Penalty** tab.

---

## §83 — Multi-Factor Compliance KPI Sub-Factors (v2.33.8)

### Purpose
When HR enters values for the "Implementation of common" compliance KPI via Org KPI Entry, four reference sub-factors are captured per employee to support the manual Achieved score decision.

### Sub-Factors
| # | Factor | Input | Source |
|---|--------|-------|--------|
| 1 | Policy Compliance | Yes/No dropdown | Manual by HR |
| 2 | Self Review & Team KPI Submission Date | Auto-fetched date | System (excl. org, sent-back, not-due KPIs) |
| 3 | Policy Training | Yes/No dropdown | Manual by HR |
| 4 | Other Observation | Numeric | Manual by HR |

### Scoring
The Achieved value is **entirely manual** — HR reviews the 4 sub-factors and enters a final numeric value. There is no auto-calculation.

### Visibility
Sub-factor values and the Achieved value are visible as a read-only "Compliance Factors" banner in the Review Journey section for **all roles**: Employee, Manager, Skip-Level, Auditor, HR PMS, Management, Admin.

### Data Storage
Stored in `org_kpi_values.sub_factors` as JSONB:
```json
{ "policy_compliance": true, "submission_date": "2026-03-15", "submission_complete": true, "submission_pending_count": 0, "policy_training": true, "other_observation": 0 }
```

### Backward Compatibility
If `sub_factors` is null, the compliance factors banner is hidden. Existing KPIs are unaffected.

---

## §84 — Multi-Period Scorecard Display (v1.95.0)

When users select YTD, QTD, or Custom period modes, the UnifiedScorecard displays KPIs from all months in the selected range. In multi-month mode, the scorecard is **read-only** — all review actions (approve, send-back, submit, raise query) are disabled. Reviewers must switch to single-month mode to perform workflow actions. This prevents cross-period approval errors since workflow stages and submissions are period-specific.

---

## §85 — Admin Edge Function Invocation Standard (v1.96.0)

All admin-only edge functions **must** be invoked via `invokeAdminEdgeFunction()` from `src/lib/adminEdgeFunction.ts`, which uses explicit `fetch` with `Authorization: Bearer <token>` and `apikey` headers. The Supabase SDK's `supabase.functions.invoke()` method **must not** be used for admin functions, as it may strip or fail to forward the Authorization header, resulting in 401 errors. This policy was established after the Password Rollout 401 incident (v2.34.0) and extended after the Reset Password / Update Email 401 incident (v2.35.0). All admin edge functions must also use the shared `requireAdminUser()` helper for authentication instead of inline token validation.

---

## §86 — Inbox Observation Deep-Link Routing (v2.01.0)

Observation workflow notifications (`observation_raised`, `observation_reply`, `observation_resolved`) must deep-link to the target employee's KPI detail sheet — not merely the employee dashboard. The `getNotificationNavigationPath` function builds role-aware URLs (`view=team|audit|management`) with `employee` and `kpi` params. `UnifiedScorecard` auto-opens the reviewer sheet when `autoOpenKpiId` matches a loaded KPI in non-self modes. `@mention` notifications (`observation_mention`) continue to use the read-only `MentionedKpiSheet` via `mentioned_kpi` / `mentioned_employee` params.

## §87 — Incentive Report Pagination & Bulk Selection (v2.38.0)

The Monthly Incentive Report table must support paginated navigation with configurable page sizes (25, 50, 100, All). When all rows on the current page are selected, a banner must appear offering to select all filtered records across all pages. Filter changes must reset pagination to page 1 and clear selection state.

---

## §88 — Submission Snapshot Immutability (v2.66.7.3)

Once an `achieved_value` (and its supporting `sub_factors`, remarks, and evidence) has been written to `review_submissions`, that row is the employee's **frozen submission snapshot** for the given KPI/period. The system must **never** retroactively recompute or overwrite this value from an upstream source such as `org_kpi_values`. Specifically:

1. Org KPI propagation **copies** the achieved value into each per-employee `review_submissions` row at propagation time. It does not store a foreign-key reference to `org_kpi_values`.
2. After propagation, the employee or reviewer may amend their own row through normal workflow stages. The amended value remains the snapshot for that submission cycle.
3. Once `final_score` is approved, the row is governed by `final-score-governance-and-immutability` and is locked.
4. Admin edits to the source `org_kpi_values` row **must not** propagate into already-existing `review_submissions`. A re-propagation must be an explicit, audit-logged action initiated by a Data Owner or Admin.

Refactors that replace the per-submission value column with a live foreign-key lookup are **forbidden** under this policy because they would silently mutate already-approved historical scores in violation of HR audit law.

### §88.1 — Re-propagation Block is Benign, Not a Failure (v2.66.8)

The propagation RPC (`propagate_org_kpi_value`) only advances `kpis.status` from `kra_set` to `self_review`. Once an employee KPI has moved past `kra_set` (i.e. self_review or any later stage), every subsequent propagation call for that KPI is **intentionally skipped** with `reason: 'not_in_kra_set'`. This is the runtime expression of §88 — the snapshot is frozen and may not be silently overwritten.

UI surfaces MUST classify this skip as **informational** ("Already propagated"), not destructive. A red error toast in this case is itself a regression because:

1. The data is correct — previously propagated values remain in place.
2. The data owner has no recoverable action to take; the system is deliberately protecting downstream submissions.
3. Per-scope batch loops (e.g. `OrgKpiDataEntry.executeSaveAndPropagate`) MUST emit one summary toast for the entire batch, not one toast per scope. Stacked destructive toasts cause panic and false bug reports.

`destructive` toast variant remains correct for hard failures: `reason: 'kpi_not_found'` or `reason: 'race_lost_during_advance'`.

### §88.2 — PA3 Partial-Propagation Toast Must Be Skip-Aware (v2.66.10)

The PA3 "propagation completeness" guard in `OrgKpiDataEntry.executeSaveAndPropagate` compares `totalPropagated` to `expectedCount` after a per-scope batch and may emit a destructive toast when the two diverge. That guard MUST inspect the aggregated skip totals (`totalSkippedBenign`, `totalSkippedHard`) before classifying the gap:

1. **All shortfall is benign** (`not_in_kra_set` — already past initial stage) → emit **no** PA3 toast. The "Already propagated" summary toast (§88.1) is the canonical, non-destructive notice.
2. **Any hard skip** (`kpi_not_found`, `race_lost_during_advance`) → emit `Partial propagation: X/Y updated` describing the hard-skip count, with retry guidance.
3. **Truly unaccounted gap** (`expected − propagated − benign − hard > 0`) → only then is the legacy "may have mismatched KPI names" wording appropriate, scoped to the unaccounted count.

Re-introducing the unconditional "mismatched KPI names" toast for benign skips is **forbidden** under this policy — it misdirects Data Owners to the Pending Report for cases the system intentionally protected (§88), and was the cause of the 2026-05-05 false-alarm report.

---

## §89 — Per-KPI Audit Granularity for Org KPI Propagation (v2.66.7.3)

Every Org KPI propagation event must produce **one `ORG_KPI_PROPAGATED` row in `kpi_audit_logs` per affected KPI**, individually addressable by `kpi_id`. This granularity is required because:

1. The Review Journey UI (`KpiTimeline`, `KpiJourneySection`) filters timeline events by `kpi_id` to render per-employee history.
2. The rollback recovery engine (`repair-stepped-back-siblings`) reconstructs prior submission state by reading these per-KPI rows.
3. Compliance and SLA reporting depend on per-KPI provenance (which Data Owner propagated which value to which employee, when).

Bulk-summary audit rows that omit `kpi_id` may be added **in addition** to per-KPI rows (for analytics dashboards), but must never replace them. Any change that collapses per-KPI propagation events into a single JSON-blob row is **forbidden** under this policy.

---

## §90 — Bulk Data Wipe Operations Require Triple-Lock Confirmation (v2.66.7.4)

Any administrative action that **bulk-deletes data across the entire organisation** (e.g. "Clear All KPI Data", future "Clear All Reviews", "Reset All Incentive Records", etc.) MUST be guarded by a hardened multi-stage confirmation pattern. A single `AlertDialog` / native `confirm()` is insufficient and is **forbidden** for this class of action.

The mandatory pattern is implemented by `src/components/admin/ClearAllKpiDataDialog.tsx` and consists of three interlocked gates:

1. **Stage 1 — Live Blast-Radius Disclosure.** The dialog must fetch and display the exact row counts that will be deleted (per affected table) at the moment the dialog opens. The "Continue" button must be disabled by a **3-second cooldown** to prevent rage-click bypass and accidental Enter-key flows.
2. **Stage 2 — Type-to-Confirm.** The admin must type a fixed, case-sensitive phrase (e.g. `DELETE ALL KPI DATA`) into a text input. The destructive button stays disabled until the typed text matches exactly.
3. **Stage 2 — Responsibility Acknowledgement.** A separate checkbox stating "I have taken a backup or accept full responsibility for this irreversible action" must be ticked in addition to the typed phrase. Both gates must pass before the destructive button enables.

**Forensic audit:** Before the destructive query executes, the handler MUST insert a row into `system_audit_logs` (or an equivalent immutable log) with `action = '<BULK_*_CLEARED>'`, `performed_by = auth.uid()`, and a `metadata.counts_at_deletion` JSON capturing the per-table row counts. `system_audit_logs` is RLS-restricted to admins for SELECT and is policy-locked against UPDATE/DELETE.

**Reusability:** New bulk-wipe buttons must reuse the `ClearAllKpiDataDialog` pattern (parameterised) rather than re-implementing it. Any deviation requires explicit policy review.

---

## §94 — Profiles Query Policy: Paged Fetches for All List Reads (v2.66.7.9)

PostgREST silently caps unranged `select(...)` queries at 1000 rows. With the active employee roster currently at ~2,533, any client UI that relied on a single unranged read of the `profiles` table silently dropped >60% of employees from search/filter/selection.

**Rule.** All client-side `supabase.from('profiles').select(...)` calls that produce a **list** (for rendering, selection, filtering, search, or distinct-value extraction) MUST be wrapped in `fetchAllPaged()` from `src/lib/fetchAll.ts`.

**Exempt.** Single-row `.maybeSingle()` lookups and `.in('id', [uuid, ...])` filtered lookups — these are not bounded by the row-scrolling cap.

**Component Contract.** `EmployeeCombobox` and any equivalent client-side searchable picker filter their input array in memory. They cannot recover from a truncated dataset; the responsibility for completeness sits with the caller. This contract is documented inline on the `employees` prop.

**Enforcement.** Code review for any new `supabase.from('profiles')` list query must verify either (a) `fetchAllPaged` is used, or (b) the call is one of the exempt single/filtered-lookup shapes. Violations are forbidden because they silently regress search visibility for employees past the 1000-row boundary.

**Regression Coverage.** `src/components/admin/__tests__/employeePickerPaging.test.ts` locks in the contract by simulating a roster larger than 1000 rows and asserting target employees beyond the cap remain discoverable.

**§94 Addendum (v2.66.7.45) — Enumerated paged sites.** The following hooks/components are confirmed to comply with §94 and MUST stay paged. New entries must be appended whenever a profile-list reader is added:
- `src/components/admin/CopyKrasDialog.tsx` (source + target pickers)
- `src/components/admin/OrgKpiAddEmployeeDialog.tsx`
- `src/components/admin/CompetencyManagerTab.tsx`
- `src/components/admin/ReportAccessTab.tsx`
- `src/components/admin/AccessProfilesManager` AssignmentTab
- `src/hooks/useAdminReports.ts` → `useKpiMappingMatrix` (added v2.66.7.45 — BUG-043; previously truncated the KPI Mapping Matrix denominator to ~996 of ~2,533 active employees)

**Regression Coverage (BUG-043).** `src/test/bugBountyFixes.test.ts::BUG-043` pins (a) `useAdminReports.ts` imports `fetchAllPaged`, (b) the `kpi-mapping-profiles` queryFn block uses `fetchAllPaged` and `.range(...)`.


## §90 — Role-String Safety in SQL and Edge Code (v2.66.7.19)

**Rule.** Every role-name string literal used in (a) database triggers/functions, (b) RPCs, (c) edge functions, or (d) RLS policies MUST exist in the `app_role` enum AND in `ALL_APP_ROLES` (`src/lib/roles.ts`, the single source of truth).

**Rationale.** `app_role` is a strict Postgres enum. An unknown literal (e.g. `'audit_lead'`) raises `invalid input value for enum app_role` at execution time, aborting the surrounding transaction — which has already corrupted user-facing flows (manager Approve, v2.66.7.19 incident).

**Enforcement.**
1. Adding a new role requires (a) `ALTER TYPE app_role ADD VALUE`, (b) update `ALL_APP_ROLES` in `src/lib/roles.ts`, in the same change set.
2. `src/test/bugBountyFixes.test.ts::BUG-019` asserts every code-referenced role exists in `ALL_APP_ROLES` and that `audit_lead` is rejected.
3. Code review must reject any new role literal not present in `ALL_APP_ROLES`.

## §92 — Slim PostgREST Selects Must Be Verified Against `information_schema.columns` (v2.66.7.21)

**Rule.** Before any column is added to a slim PostgREST `select(...)` clause (e.g. `SLIM_KPI_SELECT`), the column MUST be confirmed to exist on the target table by querying `information_schema.columns`. Reviewer-stage score columns (`manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score, self_score`) live on `review_submissions`, NOT on `kpis`. The auditor column is canonically named `auditor_score` — never `audit_score`.

**Rationale.** PostgREST returns a 400 for any unknown column. With `keepPreviousData` (or any error suppression), the failure is invisible to the user and collapses every dependent dashboard to zero — exactly the v2.66.7.20 → v2.66.7.21 incident.

**Enforcement.**
1. When extending a slim select, the change set must reference the migration or schema source that defines each new column on the target table.
2. `src/test/bugBountyFixes.test.ts::BUG-020` pins that `SLIM_KPI_SELECT` must NOT contain any reviewer-stage score column and that the `auditor_score` canonical name is used in the companion hook.
3. Reviewer-stage score signatures must be sourced from `review_submissions` via `useReviewSubmissionScoresByKpiIds` (or an equivalent map-based hook), never from a join inside the kpis query.

## §97 — KPI Journey Export Must Surface the Resolved Workflow Chain (v2.66.7.26)

**Rule.** The KPI Journey Timeline Excel export must include an **Assigned Workflow** column for every row, expressed as a compact per-employee stage chain (e.g. `Self → L1 → HR PMS → Audit → Mgmt`). The chain must be resolved using the same workflow hierarchy as the workflow engine (`get_bulk_employee_workflows`): period-specific employee → ongoing employee → period-specific department → ongoing department → period-specific pms_grade → ongoing pms_grade → globals → system default.

**Rationale.** Auditors and HR need to know *which* workflow a KPI traversed (or will traverse) to interpret the timeline columns; without this, a "missing Skip-Level" cell is ambiguous (no skip-level reviewer vs. skipped step). Embedding the resolved chain in the export — without polluting the dense on-screen grid — preserves both clarity and information density.

**Enforcement.**
1. The on-screen table must NOT render the Assigned Workflow column (export-only by design).
2. `src/test/bugBountyFixes.test.ts::BUG-024` pins (a) `KpiJourneyRow.workflowChain` exists, (b) `handleExport` includes the `'Assigned Workflow'` key sourced from `r.workflowChain`, (c) the on-screen `<TableHeader>` does not include this column.
3. Stage-label mapping must remain stable: `self_review`→Self, `manager_check`→L1, `skip_level_check`→Skip, `hr_pms_review`→HR PMS, `audit`→Audit, `management_review`→Mgmt; `approved` is omitted as terminal.

## §98 — TNI Must Distinguish Compliance Failures from Skill Gaps (v2.66.7.27)

**Rule.** Training Needs Identification (TNI) detection must classify each low-scoring KPI into exactly one of:
- **`gap_type='compliance'`** — KPI scored low because the employee did not submit (`review_submissions.self_score IS NULL` OR `auto_advance_reason IS NOT NULL`). These are discipline / process failures, NOT training needs. They are surfaced for HR visibility but are **not eligible** for training plans or LMS handoff.
- **`gap_type='skill'`** — KPI scored low despite a self-submission. These are genuine training candidates and feed the LMS module.

**Rationale.** The HR KPI *"Identification & Consolidation of Training Needs from PMS Data"* measures *real* skill gaps. Mixing auto-zero non-submissions into the same bucket inflates the count, misdirects training spend, and unfairly tags compliant low-scorers alongside non-submitters.

**Enforcement.**
1. `detect_training_needs_for_period` runs Pass A (compliance) and Pass B (skill) separately, both guarded by the existing `NOT EXISTS` dedup on `kpi_id`.
2. The TNI Report UI must split totals: "Training Needs" excludes `gap_type='compliance'`; "Compliance Gaps" is a separate card.
3. Training delivery, attendance, and effectiveness tracking are **out of PMS scope** — the LMS module owns the lifecycle from `gap_type='skill'` onwards.
4. `src/test/bugBountyFixes.test.ts::BUG-025` pins the enum value, the dual-pass branching condition, and the UI gap-type filter.

## §99 — TNI Monitoring Operates on Assessment Year (Jul–Jun) (v2.66.7.28)

**Rule.** The Training Needs Identification (TNI) report must support viewing data across the full Bharat Forge **Assessment Year (July → June)**, not just a single calendar month, because the *Training & Development — Identification & Consolidation of Training Needs from PMS Data* KPI is evaluated on AY cumulatives.

**Modes.** The report exposes five scopes:
- **Month** — operational, single-period review (default).
- **QTD / YTD** — interim trend windows.
- **AY (Jul–Jun)** — the canonical evaluation scope. Anchors automatically: Jul–Dec end-month → AY starts that year; Jan–Jun end-month → AY started the prior year.
- **Custom** — arbitrary From → To, supports cross-year ranges.

**Detection scope.** `detect_training_needs_for_period` is and remains **single-month** by contract — multi-month auto-detection would risk silent over-write storms. In multi-month UI modes the Detect button surfaces an explicit month-picker so the operator must pick the target month.

**Reporting integrity.** Aggregations (summary cards, category breakdown, department breakdown, Excel detail sheet) sum across all months in the active range. The Excel export includes a mandatory **Monthly Summary** sheet so reviewers can audit per-month contribution to the AY total.

**Enforcement.**
1. `useTNI` hooks accept `periodRanges: PeriodRange[]`; a single-element array preserves the legacy `.eq` query path byte-for-byte.
2. `src/test/bugBountyFixes.test.ts::BUG-026` pins the AY boundary logic (April 2026 → Jul 2025 … Jun 2026; October 2025 → Jul 2025 … Jun 2026), QTD/YTD windows, cross-year custom ranges, and the PostgREST `and(review_period.eq.X,review_year.eq.Y)` OR-clause shape.
3. Training delivery and effectiveness remain LMS-owned (per §98) — AY filtering does not change handoff semantics.

## §100 — Canonical `review_periods` Column Names (v2.66.7.29)

**Rule.** All SQL — migrations, functions, triggers, RPCs, edge function queries — MUST reference the `public.review_periods` table using its actual column names:

| Use this | Not this |
|---|---|
| `period_name` | ~~`month_name`~~ |
| `review_year` | ~~`year`~~ |

**Background.** Two functions shipped on 2026-04-21 (`fn_sync_org_status_to_future_open_periods`, `change_org_kpi_scope_cascading`) used the non-existent `month_name` / `year` columns. This silently broke every Org↔Normal KPI toggle for four days because the trigger fires after the UPDATE and rolls back the whole transaction with `column rp.month_name does not exist`. The locked-period guard inside both functions was simultaneously unreachable, leaving locked periods unprotected from forward-sync until the fix landed.

**Enforcement.**
1. Authors of any new function/migration touching `review_periods` MUST verify columns against `information_schema.columns` (or `psql \d public.review_periods`) before merging — this is the same audit pattern §92 codified for slim PostgREST selects.
2. `src/test/bugBountyFixes.test.ts::BUG-027` pins the canonical names against the fix migration; future migrations that touch the same functions must keep the test green (or extend it with their own anchor).
3. Code review checklist: any diff containing `review_periods` is auto-flagged for the column-name check.

## §101 — Report RPC JSONB Field-Mapping Contract (v2.66.7.30)

**Rule.** Server-side report RPCs that build response rows via `jsonb_build_object(...)` MUST map each frontend field key to its **semantically correct** database column. It is forbidden to wire two semantically distinct keys (e.g., `reviewPeriod` and `status`) to the same source column "by mistake of refactor".

**Background.** The `get_kpi_journey_report` RPC mapped `'reviewPeriod' → pg.status` for ~7 days. Because the frontend Excel exporter writes `r.reviewPeriod` into the **Month** column of the KPI Journey Timeline export, every export silently displayed workflow status (`self_review`, `kra_set`, `manager_check`, …) under "Month". The dedicated **Status** column rendered correctly, masking the bug as "duplicated data" rather than a field swap. The compounding cause was that the upstream `filtered_kpis` CTE never selected `k.review_period`, so even a one-line key fix would have failed silently.

**Enforcement.**
1. Every report RPC redefinition that emits a JSONB row builder MUST be accompanied by a regression test in `src/test/bugBountyFixes.test.ts` that pins the field-to-column mapping against the migration file (pattern: `expect(sql).toMatch(/'<frontendKey>',\s*<source>/)`).
2. CTEs feeding JSONB row builders MUST `SELECT` every column referenced by a `jsonb_build_object` value expression. Reviewers should grep the JSONB block against the CTE's SELECT list before approval.
3. When a report column appears to "show the same data as another column", treat it as a field-mapping defect first — not a frontend bug — and audit the RPC's JSONB keys.
4. `BUG-028` is the canonical anchor for this rule.

---

## §102 — Training Needs Detection Lifecycle

1. **On-demand generation.** `public.training_needs` rows are produced exclusively by `detect_training_needs_for_period(...)`. KPI scoring does not create TNI rows automatically.
2. **Pre-close obligation.** Before any reporting cycle (monthly, quarterly, fiscal-year) is treated as closed, TNI detection MUST have been run for every month in the cycle that has approved KPI scores.
3. **Reporting transparency.** TNI dashboards and exports MUST distinguish "detected with zero gaps" from "not yet detected." Silent zeros are forbidden.
4. **Idempotency contract.** The detection RPC is safe to re-run; consumers of the RPC (single-month detect, range backfill) MUST NOT duplicate rows on re-execution.


---

## §103 — Page Loading Indicator Visibility Policy (revised v2.66.7.34)

The system MUST surface a **centered, screen-level page-loading indicator** (`PageLoadingOverlay`) for **page navigation and initial data loads** — not for user-initiated refresh clicks or background refetches. Inline button spinners remain mandatory for button-state feedback on Refresh actions and are the sole signal for those actions.

Rules:
1. Show the centered overlay during (a) `Suspense` fallback while a route chunk lazy-loads and (b) the FIRST fetch burst that follows a route change (gated via `useIsFetching()` + `useLocation()`). Auto-dismiss as soon as the fetch count returns to zero.
2. Do NOT show the centered overlay for user-initiated refresh actions (e.g. the Refresh button on the reviewer grid). Use the inline button spinner + `disabled` state only.
3. Do NOT show the centered overlay for background refetches (window focus, realtime sync). Those stay silent or use a small inline pill.
4. The overlay MUST respect `prefers-reduced-motion`.
5. Caption defaults to **"Please wait"** / **"Loading…"**. Branding: a single navy rocket ascending vertically with a flickering orange flame and a faint green motion-trail. The earlier growth-chart axes / arrows MUST NOT be reintroduced (see BUG-034, v2.66.7.36).

Wiring: `src/components/layout/DashboardLayout.tsx` mounts both the `Suspense` fallback and `RouteDataLoadingGate`. The deprecated `RefreshOverlay` component is retained for backwards compatibility only and MUST NOT be mounted by new call sites.

---

## §104 — Canonical Audit Table & Workflow-Status Vocabulary (v2.66.7.33)

**Rule.** Any server-side function, RPC, view, edge function, or migration that aggregates per-KPI workflow timestamps or status transitions MUST read from `public.kpi_audit_logs` and join via the `kpi_id uuid` column. Use of a `public.audit_logs` table (which does not exist in this project) is forbidden. Filters on `(new_value->>'status')` MUST use the project's canonical workflow vocabulary, exclusively:

| Stage             | Canonical literal     |
|-------------------|-----------------------|
| Self review       | `self_review`         |
| Manager review    | `manager_check`       |
| Skip-level review | `skip_level_check`    |
| HR-PMS review     | `hr_pms_review`       |
| Auditor review    | `audit`               |
| Management review | `management_review`   |
| KRA assigned      | `kra_set`             |
| Final approved    | `approved`            |

The non-canonical literals `l1_review`, `auditor_review`, and `skip_level_review` are forbidden in any production SQL or application code.

**Background.** The KPI Journey Timeline RPC was published with `FROM audit_logs` and the wrong status literals; the report rendered blank for ~1 day even though thousands of KPIs existed for the selected period. The defect was caught only when a user reported the empty screen. See `DOCUMENTATION.md` v2.66.7.33 (BUG-031).

**Enforcement.**
1. Every migration that touches a report or audit-driven RPC MUST be paired with a regression test in `src/test/bugBountyFixes.test.ts` that pins the migration text against `kpi_audit_logs`, the `kpi_id` join, and the canonical status table above.
2. Code review SHOULD reject any new reference to `audit_logs` (without the `kpi_` / `system_` / `pip_` / `review_period_` prefix) or to non-canonical stage literals.
3. `BUG-031` is the canonical anchor for this rule.

---

## §105 — Per-Employee Workflow Resolution in Reports (v2.66.7.35)

**Rule.** Any RPC, view, edge function, or report that emits a per-employee workflow chain or per-employee workflow stage list MUST resolve it via the canonical helpers `get_bulk_employee_workflows(employee_ids uuid[], p_review_period text, p_review_year integer)` (set-based) or `get_employee_workflow(employee_uuid uuid, p_review_period text, p_review_year integer)` (single-row). Hardcoded stage arrays — including the maximal `ARRAY['self_review','manager_check','skip_level_check','hr_pms_review','audit','management_review']` form — are forbidden in report output.

**Why.** Employees are assigned heterogeneous templates via `workflow_config` (e.g. `self_l1_audit`, `self_hr_pms`, `self_l1_mgmt`, `self_audit_mgmt`, …). A hardcoded array silently produces the same maximal chain for every row, which is wrong for the majority of employees. This was the root cause of BUG-033 (KPI Journey "Assigned Workflow" column showed the same six-stage chain for every employee).

**Display rules for rendered chains.**
1. Filter out the framing stages `kra_set` and `approved` — they are not user-facing review steps.
2. Preserve template ordering (use `WITH ORDINALITY` on `unnest`).
3. Use the project's canonical short labels: `Self`, `L1`, `Skip`, `HR PMS`, `Auditor`, `Mgmt`.
4. Fall back to `'—'` when a template cannot be resolved.

**Enforcement.**
1. Every migration that adds or modifies an RPC emitting a workflow chain MUST be paired with a regression test in `src/test/bugBountyFixes.test.ts` that pins the call to `get_bulk_employee_workflows`/`get_employee_workflow` and forbids the hardcoded six-stage array.
2. Code review SHOULD reject any new in-RPC `ARRAY[...stages...]` literal used as a per-employee chain source.
3. `BUG-033` is the canonical anchor for this rule.

---

## §106 — No-NULL-Status Invariant (v2.66.7.37)

**Rule.** `kpis.status` MUST NEVER be set to `NULL` by any application code path, RPC, edge function, trigger, or migration. Every workflow advancement MUST resolve to a concrete `review_status` enum value (`kra_set`, `self_review`, `manager_check`, `skip_level_check`, `hr_pms_review`, `audit`, `management_review`, or `approved`). If the next status cannot be resolved (e.g. the reviewer's owned stage is absent from the employee's effective workflow chain), the operation MUST fail loudly with a user-facing error rather than silently writing `NULL`.

**Background — BUG-035.** Eight KPIs in March 2026 (Dippendu Das, Love Sahrawat — both on the `self_audit_mgmt` template, which contains no `manager_check` stage) were corrupted to `status = NULL` when the reporting manager opened the Manager Scorecard and forwarded them. The corruption sequence was:
1. Manager landed on the scorecard via the score-signature seed in `useProfilesByWorkflowStage` (the seed is intended for read-only roster completeness but inadvertently unlocks Manager actions on employees whose chain skips `manager_check`).
2. Inside `UnifiedScorecard.tsx`, `config.forwardStatus = resolveForwardStatus('manager', stages)` returned `null` because `manager_check` is not in the chain (correct guard behaviour in `workflowEngine.ts`).
3. The component then wrote `update({ status: null as any })` to `kpis`, producing the NULL row.
4. UI fallbacks (`kpi.status || 'kra_set'`) re-rendered NULL as **"KRA Set"**, hiding the corruption from users and the audit trail.

**Enforcement.**
1. **Application guard.** `UnifiedScorecard.tsx` MUST call `assertResolvableStatus(newStatus, viewLevel)` (or the equivalent toast-and-return guard) immediately before every `kpis.status` write. The submit-mutation must throw; the inline N/A handlers may toast and return.
2. **UI honesty.** Every `kpi.status` display badge MUST render a distinct **"Status Missing"** badge (amber) when `kpi.status == null`. The previous `|| 'kra_set'` fallback for *display* is forbidden. (The fallback remains acceptable for default-when-creating-a-new-KPI initialisers in admin tools, where the absent value is genuinely a fresh KRA, never a corruption.)
3. **Database invariant.** The `kpis.status` column SHOULD eventually be made `NOT NULL` after a sweep proves zero NULLs project-wide; until then, the `RECONCILE_STATUS` audit action with reason `'null_status_repair_v1'` is the canonical repair tool.
4. **Regression coverage.** `BUG-035` in `src/test/bugBountyFixes.test.ts` pins the resolver semantics, the presence of the application guards, and the "Status Missing" UI fallback in all four reviewer-facing badge sites.

`BUG-035` is the canonical anchor for this rule.

## §107 — Reviewer Self-Exclusion (v2.66.7.38)

**Rule.** No reviewer panel — Team, Audit, HR PMS, Management, Skip-Level, Pending-Self / Pending-Manager / Pending-Skip, or any cross-check (Explorer) mode — may surface the viewer's own profile as a selectable employee. Self-assessment is permitted exclusively through the **Self** tab and the standard `self_review` workflow stage.

**Background — BUG-036.** A reporting manager (also holding `admin` access) opened `/dashboard?view=team` and saw their own profile listed alongside their direct reports. RCA traced this to `EmployeeSelectorGrid.baseMembers`: when the viewer's `effectiveRole` matched any of `admin | management | hr_pms | auditor` (`isFullAccess`), the grid returned the entire `useProfiles()` set without filtering out the current `user.id`. Pure managers were unaffected today only because the DB had no self-reporting loops — a latent risk if `profiles.reporting_manager_id = profiles.id` was ever introduced.

**Enforcement.**
1. **UI exclusion (primary).** `EmployeeSelectorGrid` MUST strip the viewer (`m.id !== user.id`) from `baseMembers` for *every* view level and *every* role bucket (full-access, manager, cross-check / Explorer). Stat counters (`Team Size`, `Total Employees`) derive from this filtered list and therefore do not double-count the viewer.
2. **Defense-in-depth click guard.** `handleEmployeeClick` MUST refuse to open the viewer's own profile (toast: *"Self-review not allowed here — Use the Self tab to view or score your own KPIs."*).
3. **Hook safety net.** `useTeamMembers` and `useSkipLevelTeamMembers` MUST chain `.neq('id', managerId|userId)` so a corrupt self-loop in `reporting_manager_id` cannot leak the viewer into their own team list.
4. **Database invariant.** A `BEFORE INSERT OR UPDATE` trigger on `public.profiles` (`prevent_self_reporting_manager`) MUST raise `check_violation` whenever `reporting_manager_id = id`, blocking the data condition that would otherwise re-introduce this bug.
5. **Stage-gate side-effect (closes BUG-035 residual).** When a reviewer clicks an employee whose resolved workflow does not include the reviewer's `requiredStage`, the click is rejected with a *"Workflow stage missing"* toast — preventing the NULL-status forward attempt from ever being initiated.
6. **Regression coverage.** `BUG-036` in `src/test/bugBountyFixes.test.ts` pins the UI filter, both click guards, both hook `.neq` clauses, and the migration installing the trigger.

`BUG-036` is the canonical anchor for this rule.

## §108 — Notification Recipient Resolution / Non-Login Guard (v2.66.7.39)

**Rule.** Notification dispatch is **best-effort** and MUST never abort the originating business transaction. Every code path that writes to `public.notifications` from inside a database trigger or function MUST treat a missing `auth.users` recipient as a **silent no-op**, not a failure.

**Background — BUG-037.** The Copy KRAs admin tool failed with `insert or update on table "notifications" violates foreign key constraint "notifications_user_id_fkey"` whenever the target employee was a **non-login user** (an `is_active` profile with no corresponding `auth.users` row — a fully supported class per `mem://features/admin/non-login-user-provisioning`). The trigger chain was: `INSERT INTO kpis` → `trigger_notify_kpi_created` → `notify_on_kpi_created()` → `INSERT INTO notifications (user_id = NEW.employee_id, ...)` → FK violation against `auth.users(id)` → entire `kpis` insert rolled back → all 12 KPIs lost. The same class of bug latently affected every notification path (status change, send-back, manager approval, auditor fan-out, finalisation, KRA assignment) for any non-login recipient.

**Enforcement.**
1. **Pre-check (preferred).** When a single recipient is known, the trigger SHOULD wrap the `INSERT` in `IF EXISTS (SELECT 1 FROM auth.users WHERE id = <recipient>) THEN ... END IF;` so the no-op is explicit and observable.
2. **Defensive handler (mandatory).** Every `INSERT INTO public.notifications` inside a trigger function MUST be wrapped in `BEGIN ... EXCEPTION WHEN foreign_key_violation THEN NULL; END;`. This is the catch-all for race conditions (recipient deactivated between row read and insert), set-based fan-outs, and any future trigger introduced without the §108 pre-check.
3. **Fan-out filtering.** Set-based recipient queries (e.g., the `auditor` role fan-out in `notify_on_kpi_status_change`) MUST filter via `EXISTS (SELECT 1 FROM auth.users au WHERE au.id = ur.user_id)` so non-login role-holders do not poison the batch.
4. **Schema invariant.** `notifications.user_id` REMAINS `REFERENCES auth.users(id) ON DELETE CASCADE`. The FK is correct — the policy lives in the trigger layer, not in the table definition. Application code (edge functions, RLS-bound RPCs) writing to `notifications` directly MUST apply the same pre-check before the insert.
5. **Regression coverage.** `BUG-037` in `src/test/bugBountyFixes.test.ts` pins (a) the `auth.users` pre-check inside `notify_on_kpi_created`, (b) parity between the count of `INSERT INTO public.notifications` and `WHEN foreign_key_violation THEN` handlers in `notify_on_kpi_status_change`, and (c) the `auth.users` filter on the auditor fan-out.

`BUG-037` is the canonical anchor for this rule.

## §109 — Large-Table Export Pagination (v2.66.7.40)

**Rule.** Any client-side export that walks a table of more than ~1k rows MUST (a) paginate via `fetchAllPaged()` from `src/lib/fetchAll.ts`, (b) include an explicit `.order(<indexed_column>)` before every `.range(from, to)`, and (c) resolve foreign-key descriptions via separate `.in('id', [...])` lookups instead of nested PostgREST joins on the paged select.

**Background — BUG-038.** The PMS Scorecard **Export Current Data** button on `/admin/import` failed with `canceling statement due to statement timeout`. Root cause: `exportKpiData()` paged 9,526 KPI rows with a 4-level nested join (`kra_categories`, `profiles → departments → business_units → divisions`) **and no ORDER BY**. Without ordering, Postgres had to materialise the full join on every page request to compute the `OFFSET`, and the first page already exceeded `statement_timeout`.

**Why this matters.** PostgREST translates `.range(offset, end)` into `OFFSET / LIMIT`. With no `ORDER BY`, the planner cannot use an index seek; it must scan + sort the full join, every page. Adding `.order('id')` on a primary-key index makes each page an O(log n) seek + O(page_size) read. The same query without ordering is effectively O(n) per page = O(n²) total.

**Enforcement.**
1. **Pagination helper.** Use `fetchAllPaged()`. Manual `while (true)` loops are forbidden in new code.
2. **Order before range.** Every paged select MUST chain `.order(...)` before `.range(...)`. Prefer the table's primary key.
3. **Decoupled lookups.** Do NOT embed `parentTable(childCols, grandchildTable(...))` joins in a query that you then page. Fetch the parent rows with own columns only, collect the foreign-key id sets, then issue one `.in('id', [...])` call per lookup table.
4. **Page size.** Default 1000 (the helper's default). For wide rows or queries that join even one heavy related table inside `fetchAllPaged`, drop to 500.
5. **§94 alignment.** This rule extends §94 (Profiles Query Policy) from rosters/pickers to exports.

**Regression coverage.** `BUG-038` in `src/test/bugBountyFixes.test.ts` pins the absence of nested joins and the presence of `.order()` + `.in()` lookups in both `exportKpiData` and `exportEmployeeData`.

`BUG-038` is the canonical anchor for this rule.

## §110 — RLS-Heavy Child-Table Exports Use Parent-ID Batching (v2.66.7.41)

**Rule.** Any client-side export that reads a child table whose RLS policies join back to a heavily protected parent (e.g., `review_submissions → kpis → profiles`) MUST fetch the child rows in **bounded `.in('<parent_fk>', batch)` calls**, NOT in a broad `fetchAllPaged()` over the whole child table. Default batch size: 100 parent ids. Each batch must still chain `.order(<indexed_column>)`.

**Background — BUG-039.** After §109 fixed the `kpis` portion of **Export Current Data**, the same flow continued to fail with `canceling statement due to statement timeout (57014)` on the very first `review_submissions` page (`offset=0&limit=1000`). The `review_submissions` SELECT policies re-evaluate `kpis`/`profiles` checks for every candidate row, so even an ordered, slim, paged query exceeded the statement timeout.

**Enforcement.**
1. Identify any child table whose RLS policy contains `EXISTS (SELECT … FROM kpis k JOIN profiles p …)` or similar multi-table joins. `review_submissions` is the canonical example.
2. After fetching the parent rows (e.g. `kpis`), collect their primary-key ids and walk them in batches of ≤100 via `.in('<parent_fk>', batch)`.
3. Do NOT use `fetchAllPaged()` on those tables for an export. The combination of `OFFSET` + per-row RLS evaluation is what blows past the statement timeout, regardless of `ORDER BY`.
4. §109 still applies to the parent fetch (ordered + decoupled).

**Regression coverage.** `BUG-039` in `src/test/bugBountyFixes.test.ts` pins (a) the removal of `fetchAllPaged` over `review_submissions` inside `exportKpiData`, (b) the presence of `.in('kpi_id', batch)` calls, and (c) a bounded `SUBMISSION_BATCH` constant.

`BUG-039` is the canonical anchor for this rule.

## §111 — Sidebar Visibility Mirrors Route Guards for Ownership-Gated Pages (v2.66.7.42)

**Rule.** When a route is protected by a stricter guard than role membership (e.g., `DataOwnerRoute`, `ReportRoute`, or any guard that validates per-row ownership/assignment), the sidebar entry for that route MUST apply the same predicate. It MUST NOT rely solely on `useMenuAccess.canAccess()`, because role-default `allowed_roles` will admit users who are then immediately redirected away.

**Background — BUG-040.** `AppSidebar.tsx` gated the Data Entry group with `return isDataOwner || true`, a dead short-circuit. Every non-admin role in the menu's `allowed_roles` saw the item and was bounced by `DataOwnerRoute`.

**Enforcement.**
1. Identify any route wrapped in a guard stricter than `ProtectedRoute(roles=...)` — e.g. `DataOwnerRoute`, custom data-scope guards.
2. The sidebar's `filterByRole` for that item MUST AND-combine `canAccess(menuKey)` with the same ownership/assignment predicate the guard uses (or a cheap proxy such as the `useIsAnyOrg…Owner` hook).
3. Per-user overrides from `menu_access_user_overrides` are an acceptable secondary admit path and SHOULD be honored.
4. Code review checklist: any expression of the form `<ownerSignal> || true` or `<ownerSignal> ?? true` is forbidden.

**Regression coverage.** `BUG-040` in `src/test/bugBountyFixes.test.ts` pins the absence of `isDataOwner || true` in `AppSidebar.tsx` and the presence of both `isDataOwner` and `userOverrides` references.

`BUG-040` is the canonical anchor for this rule.

### §111 Addendum — Sidebar and Route Admit Sets Must Be Equal (v2.66.7.43, BUG-041)

**Rule.** For any route protected by an ownership/assignment guard, the set of users admitted by the sidebar filter MUST equal the set admitted by the route guard. Any admit predicate added to one MUST be added to the other in the same change.

**Background.** After BUG-040 added per-user override admit to the **Data Entry** sidebar gate, `DataOwnerRoute` still admitted only `admin` and `isDataOwner`, so override-only users were redirected to `/dashboard`. Sidebar showed the link, route bounced — a half-implemented admit path.

**Enforcement.**
1. Both layers MUST source admit signals from the same hook (`useMenuAccess` for override / profile rights, `useIsAnyOrg…Owner` for ownership). No bespoke duplicates.
2. The route guard's loading gate MUST include `useMenuAccess.isLoading` so override/profile data has settled before the redirect decision; otherwise valid users hit a flash redirect.
3. The four canonical admit predicates for ownership-gated routes are: `admin` → `isOwner` → `userOverride[menu_key]` → `profileRight.can_view[menu_key]`. Role-default `canAccess` is excluded (see §111 base).

**Regression coverage.** `BUG-041` in `src/test/bugBountyFixes.test.ts` pins (a) `DataOwnerRoute` imports `useMenuAccess`, calls `canPerform(..., 'view')`, walks `userOverrides`, and waits on `menuLoading`; (b) `AppSidebar` Data Entry filter mirrors with `canPerform(item.menuKey, 'view')`.

## §112 — Page-Configured Role Visibility Lives in `useMenuAccess` (v2.66.7.44, BUG-042)

**Rule.** When a page has its own role-visibility config column (e.g., `app_settings.pms_policy_visible_roles`), the menu key for that page MUST:
1. Have a dedicated branch at the top of `useMenuAccess.canAccess` that reads the canonical column and admits accordingly. Admin always passes; other roles only when in the configured list; per-user overrides on the same key still grant access.
2. NOT appear in `EMPLOYEE_DEFAULT_MENUS` or `MANAGER_DEFAULT_MENUS` (Layer 1 would short-circuit true and bypass the config).
3. NOT appear in `DEFAULT_MENU_ROLES` (Layer 7 fallback would re-introduce the bug if `appSettings` is briefly unavailable).
4. Have a page guard that DELEGATES to `useMenuAccess.canAccess(menuKey)` rather than re-implementing the role-list check, so the sidebar admit set strictly equals the route admit set (per §111 addendum).

**Background — BUG-042.** `pms-policy` was admitted by Layer 1 (`EMPLOYEE_DEFAULT_MENUS`) and by Layer 7 (`DEFAULT_MENU_ROLES` for all roles) and by Layer 6 (`menu_access_config` for all roles), so removing a role from `app_settings.pms_policy_visible_roles` had no effect on sidebar visibility — only on the page redirect. Result: every excluded role saw the nav item and got bounced.

**Enforcement.**
1. Code review checklist for any new page with its own visibility config: search `useMenuAccess.ts` for the menu key in `EMPLOYEE_DEFAULT_MENUS`, `MANAGER_DEFAULT_MENUS`, `DEFAULT_MENU_ROLES`. All three MUST be empty for that key.
2. The dedicated branch MUST run before the Layer 1–7 cascade.
3. The page guard MUST call `canAccess(menuKey)`; never duplicate the role-list predicate.

**Regression coverage.** `BUG-042` in `src/test/bugBountyFixes.test.ts` pins (a) `pms-policy` absent from `EMPLOYEE_DEFAULT_MENUS`; (b) `pms-policy` absent from `DEFAULT_MENU_ROLES`; (c) `useMenuAccess` imports `useAppSettings` and has a `menuKey === 'pms-policy'` branch referencing `pms_policy_visible_roles`; (d) `PMSPolicy.tsx` delegates to `useMenuAccess.canAccess('pms-policy')`.

`BUG-042` is the canonical anchor for this rule.

## §113 — Password Rollout Auto-Provisions Missing Auth Users (v2.66.7.46, BUG-044)

Admin tooling that mutates `auth.users` (the `password-rollout` edge function and any future equivalent) MUST handle the "profile-without-auth" state — i.e. a profile row exists but no `auth.users` row matches `profile.id`. This is the steady-state for employees imported via the master backfill (see `mem://features/admin/non-login-user-provisioning`).

**Required pattern (probe → create-or-update):**
1. Call `supabaseAdmin.auth.admin.getUserById(profile.id)` first.
2. If the user is missing, call `supabaseAdmin.auth.admin.createUser({ id: profile.id, email, password, email_confirm: true, user_metadata })`. The profile id MUST be passed verbatim into `createUser` so every foreign key keyed on the profile id (user_roles, kpi_assignments, audit logs, KRA records) stays intact. Never mint a new id.
3. If the user exists, call `auth.admin.updateUserById(profile.id, { password })` as before.
4. Surface a friendlier error than "User not found" when the email is already linked to a different auth account.
5. Surface `auth_action: 'created' | 'updated'` in the per-user result payload so admins can distinguish first-login provisioning from a password reset.

**Authorization rationale**: admin selection of the target user inside an admin-only edge function (gated by `requireAdminUser`) is itself the authorization signal for first-login provisioning. No separate provisioning step is required.

**Forbidden**: skipping the probe, minting a fresh auth id, or relying on a separate "create login" tool to backfill missing auth users — these patterns leave the Password Rollout UI silently failing for the most common new-employee case.

## §114 — Auth Triggers Must Be Idempotent for Backfilled Employees (v2.66.7.47, BUG-045)

Any `AFTER INSERT ON auth.users` trigger that writes to `public.profiles` or `public.user_roles` (today: `public.handle_new_user()`) MUST be idempotent. Backfilled employees (master HR import, see `mem://features/admin/non-login-user-provisioning`) already have a `public.profiles` row before the matching `auth.users` row exists, so a blind `INSERT` raises `duplicate key value violates unique constraint` inside the auth-create transaction and Supabase surfaces it as the generic `Database error creating new user`. This is what blocked Password Rollout in BUG-045 even after BUG-044's probe→create flow was correct.

**Required pattern**:

```sql
INSERT INTO public.profiles (id, email, full_name)
VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES (NEW.id, 'employee')
ON CONFLICT (user_id, role) DO NOTHING;
```

**Rationale**:
- `ON CONFLICT (id) DO NOTHING` preserves HR-imported employee data (employee code, department, reporting manager, company, level, designation, active state). The auth signup must not overwrite the authoritative profile.
- `ON CONFLICT (user_id, role) DO NOTHING` prevents accidentally re-asserting the default `employee` role over a backfilled employee whose role already exists (or who already has a higher role). It also keeps self-signup behavior correct — first-time signups still get the default role.

**Forbidden**:
- Replacing the `INSERT` with `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` — this overwrites HR master data.
- Adding a new `auth.users` trigger that writes to `public.profiles` without the same `ON CONFLICT DO NOTHING` guard.

**Regression coverage**: `BUG-045` in `src/test/bugBountyFixes.test.ts` pins the trigger contract by scanning the latest `handle_new_user` migration for both `ON CONFLICT` clauses and verifies the password-rollout edge function maps the trigger DB error to an actionable message.

## §115 — HR PMS Roster Authority & N/A as a Reviewed Action (v2.66.7.48, BUG-046)

Reviewer panels (HR PMS, Audit, Management) MUST treat the **current resolved workflow** as the single source of truth for roster inclusion. Historical score signatures (e.g. an `hr_pms_score` set under a previous template) MUST NOT cause an employee to appear in a reviewer panel whose stage is no longer part of that employee's current workflow.

- `useProfilesByWorkflowStage` (`src/hooks/useOrganization.ts`): the `scoreSigSeededIds` and `seededIds` shortcuts are honored ONLY when bulk RPC resolution failed for that employee. Otherwise the resolved stages list authoritatively decides inclusion.
- "Approved as N/A" is a **completed reviewer action** for the stage that approved it. Stat cards and per-employee progress bars (HR PMS Reviewed, Auditor Reviewed, Management Reviewed) MUST credit `(stage_score IS NOT NULL) OR (is_na = true AND status is at-or-past the stage)`. Without this, employees whose KPIs were entirely N/A-approved render as empty cards with a `0/N` bar despite the review being formally completed.
- The "reviewed" counter inside the stat aggregations (`EmployeeSelectorGrid.tsx` HR PMS / Audit / Management branches) MUST run BEFORE any workflow-stage early-return so historical signatures still contribute to the totals when the seed admits the employee.

**Forbidden**:
- Reintroducing a `scoreSigSeededIds.has(p.id) ⇒ true` shortcut that bypasses `empStages.includes(stage)`.
- Counting "reviewed" only via `score IS NOT NULL` while excluding `is_na` rows.

**Regression coverage**: `BUG-046` in `src/test/bugBountyFixes.test.ts` pins (a) `useReviewSubmissionScoresByKpiIds` selecting `is_na`, (b) the HR PMS reviewed predicate crediting `is_na`, and (c) the workflow-first ordering inside `useProfilesByWorkflowStage`.

### §115 Extension — Structural Advancement Counts as Reviewed (v2.66.11.15)

The HR PMS Reviewed tile in `EmployeeSelectorGrid.tsx` (HR PMS branch, ~L1059-1095) MUST credit a KPI as reviewed when ANY of the following holds:

1. `review_submissions.hr_pms_score IS NOT NULL` (signature path), OR
2. `is_na = true` AND `status` is at-or-past `hr_pms_review` (or `status = 'approved'` on a workflow without HR PMS), OR
3. **The KPI's resolved workflow contains `hr_pms_review` AND `status` appears in the stages strictly after `hr_pms_review`.**

Rationale: any KPI whose status has structurally advanced past `hr_pms_review` has, by definition, completed the HR PMS stage. Counting purely off `hr_pms_score` signatures undercounts KPIs that advanced via auto-advance, bulk approval, or legacy import paths where the submission row was not stamped. Implementations MUST guard against double-counting (a `countedReviewed` flag, as in the reference impl).

**Regression coverage**: `src/test/hrPmsReviewedTile.test.ts` pins the three rules and the no-double-count invariant.

## §116 — Admin On-Behalf Submissions Must Carry a Score or N/A (v2.66.7.49, BUG-047)

Any "score on behalf of" submission written by an admin (via `useAdminSubmitReviewData` or any future equivalent path) MUST, for reviewer stages (`manager`, `skip_level`, `hr_pms`, `auditor`, `management`), include either:

- a numeric score and/or rating for that stage, OR
- the explicit `is_na = true` flag with `na_marked_by_role = 'admin'`.

A submission that advances the KPI past the reviewer stage with neither signature is forbidden because:

- The "<stage> Reviewed" dashboard counter (HR PMS Reviewed, Auditor Reviewed, Management Reviewed) credits a KPI only when its `review_submissions` row carries the stage score OR `is_na = true`. A KPI advanced without either signature appears as "Total = N, Reviewed = N − 1" with no visible owner — exactly the BUG-047 pattern that surfaced on Lekh Raj (employee 101959, March 2026, 3 KPIs).
- The audit timeline loses the "who scored / who N/A'd this stage" provenance.

**Required enforcement (defence in depth)**:

1. **Client guard** — `AdminDataEntryDialog` MUST disable Submit unless `roleLevel === 'self'` OR a score / rating is provided OR the `Mark as N/A` toggle is on. Inline error MUST cite POLICY §116.
2. **DB trigger** — `enforce_on_behalf_score_or_na` (BEFORE INSERT OR UPDATE on `review_submissions`) MUST raise an exception when `auto_advance_reason ILIKE '%on behalf of <stage>%'` AND the stage's score AND rating columns are both NULL AND `is_na <> true`. Repair migrations and fast-track writes are exempt by `auto_advance_reason` prefix.

   **§116.1 — WRITE-SCOPED enforcement (BUG-047 v2, 2026-05).** The trigger MUST only enforce on the actual on-behalf write — i.e. an `INSERT`, or an `UPDATE` where `OLD.auto_advance_reason IS DISTINCT FROM NEW.auto_advance_reason`. Subsequent updates that merely inherit the existing reason text MUST be allowed through. Otherwise stale provenance text left over after step-back, status override, or cascade-clear permanently locks the row from any further edit (auditor scoring, send-back recovery, etc.). Original guarantee is preserved because the on-behalf write itself is still validated.

   **§116.2 — Cascade-clear hygiene.** Any code path that nulls out a stage's `<stage>_score` and `<stage>_rating` (step-back, send-back, status step-back) SHOULD also null `auto_advance_reason` when that text references the cleared stage. The one-time repair migration `bug047_write_scoped_guardrail` cleared all currently-stale rows; ongoing hygiene prevents recurrence.

**Forbidden**:
- Removing or weakening either guard.
- Advancing a KPI's `kpis.status` past `<stage>` from any new code path without writing the corresponding `review_submissions` signature.

**Regression coverage**: `BUG-047` in `src/test/bugBountyFixes.test.ts` pins the dialog validation predicate, the migration's trigger function and reviewer-stage coverage, and the targeted Lekh Raj data repair.

---

## §117 — Step-Back Target Composition (v2.66.7.50, BUG-048)

**Date:** 2026-05-02 · **Status:** Active

The Step Back KPI Status dialog (`AdminStatusStepBackDialog`) MUST offer every workflow stage that the KPI either belongs to **or** has persisted scoring data for. Specifically, the **Target Stage** dropdown is the union of:

1. Every stage strictly before the current `kpis.status` in the KPI's **period-resolved** workflow template — i.e. `get_employee_workflow(employee_uuid, p_review_period, p_review_year)`. The period args MUST be passed; calling the RPC without them returns the *current* global fallback and silently misrepresents the workflow that actually governed the KPI when it was reviewed.
2. Every stage with non-NULL persisted data in `review_submissions` (`self_score`, `manager_score`, `skip_level_score`, `hr_pms_score`, `auditor_score`, `management_score`) that is strictly before the current status.

`kra_set` MUST always be included as a baseline reset target. The list MUST be sorted by the canonical `FULL_STATUS_ORDER`.

**Why**: Hiding a stage that holds real scoring data makes the recorded score unreachable for correction — the very purpose of step-back. Reported case: Amol Ashok Shivankar's March 2026 *Stack Emission and PM Monitoring Adherence* KPI was approved with `auditor_score = 0` (forcing `final_score = 0`) even though his current workflow template omits the `audit` stage. The dropdown previously offered only KRA Set / Self / Manager / Skip-Level / HR PMS, leaving the auditor's zero permanently locked behind an invisible stage.

**Required enforcement**:

1. **Period-aware lookup.** Call sites that open `AdminStatusStepBackDialog` (`KpiHeaderSection`, `AllKpis`, any future surface) MUST forward `reviewPeriod` and `reviewYear` props. The dialog MUST pass them to `get_employee_workflow`. Omitting them is forbidden.
2. **Data-bearing union.** The dialog MUST query `review_submissions` for the KPI and union every stage with a non-NULL score column into the target set, regardless of whether that stage is in the resolved workflow template.
3. **Default selection.** The default selected target MUST be the immediately-prior **data-bearing** stage when one exists (e.g. `audit` for the Amol case above), falling through to `getPreviousStatus(currentStatus, workflowStages)` and finally `kra_set`.
4. **UI hint.** Stages that appear only because of historic data (not in the resolved workflow template) MUST be flagged inline with a `(historic)` marker so the admin understands why the option is offered.

**Forbidden**: Filtering the target dropdown strictly by the workflow template. Calling `get_employee_workflow` without period args from this dialog. Hiding a stage that has any non-NULL `*_score` value below `current`.

**Anti-stale render rule (v2.66.7.51)**. The dialog MUST NOT render an enabled `Target Stage` selector while either the period-aware workflow query OR the data-bearing-stage query is still resolving. During resolution it MUST show a "Resolving target stages…" placeholder and disable the Confirm button. Default-selection MUST be derived **only** from the already-composed `availableTargets` (via `getPreferredStepBackTarget`); it is forbidden for the displayed Select value to be a stage that is not present in the dropdown options. Any in-flight `selectedTarget` that becomes invalid after the option list resolves MUST be reset.

**Regression coverage**: `src/test/stepBackTargetComposition.test.ts` (8 cases) pins the union semantics, canonical ordering, baseline `kra_set` inclusion, and the data-aware default selector.

---

## §95 — Profile Cache Invalidation Contract

When a profile (`public.profiles`) row is inserted, updated, or deleted — through any code path (User Management UI, bulk imports, edge functions, direct DB) — the React Query caches that derive from profile fields (`employee_code`, `full_name`, `designation`, `department_id`, `company_id`, `is_active`, `reporting_manager_id`) MUST be invalidated immediately.

**Why**: Hooks such as `useCompanyFilter` (10 min staleTime), `useProfilesWithHierarchy`, `useEmployeeFilterOptions` and `useMonthlyTrend` (5 min) cache employee → company / hierarchy / picker maps. Without invalidation, an admin who renames an employee or changes their `employee_code` will not see the update reflected in pickers, filter cascades or report grids until the staleTime elapses, making the employee appear "missing" (root cause behind the *Chandra Bhan Singh / 101964* report on 29 Apr 2026).

**Required enforcement (defence in depth)**:

1. **Mutation handlers** — every `onSuccess` that writes to `profiles` or `user_roles` MUST call `invalidateProfileCaches(queryClient)` from `src/lib/profileCacheKeys.ts`. Bare `queryClient.invalidateQueries({ queryKey: ['profiles'] })` is NOT sufficient.
2. **Hook keys** — any hook that caches profile-derived data (filters, pickers, employee maps, trend reports) MUST append `useProfilesVersion()` to its React Query key. The hook subscribes to a single shared Postgres realtime channel on `profiles` and increments a counter on any change, catching mutations made outside the UI.
3. **Registry** — every new profile-dependent cache key MUST be added to `PROFILE_DEPENDENT_QUERY_KEYS` in `src/lib/profileCacheKeys.ts` and pinned in `src/test/profileCacheInvalidation.test.ts`.

**Forbidden**:
- Caching profile-derived data with `staleTime > 0` without `useProfilesVersion()` keying.
- Bypassing `invalidateProfileCaches` in profile-mutation success handlers.

**Regression coverage**: `src/test/profileCacheInvalidation.test.ts`.

---

## §97 — Pending-KRA Issue Classification for Org and Multi-Month KPIs

Unified Issues / pending-KRA compliance surfaces may only flag `kra_set` KPIs that are actually awaiting employee action.

1. **Org KPI exclusion.** `kpis.is_org_level = true` rows MUST be excluded from employee pending-KRA issue flags. Their `kra_set` state means the source Org KPI value is still pending Data Owner entry/propagation, not that the employee failed to accept or submit the KPI.
2. **Multi-month placeholder exclusion.** Non-terminal months for Bi-Monthly, Quarterly, Half-Yearly and Yearly KPIs MUST be excluded from pending-KRA issue flags. Only the terminal cycle month is actionable; placeholder sibling rows exist for visibility and score inheritance.
3. **Regular KPI behavior unchanged.** Non-org monthly/daily/weekly KPIs at `kra_set` past the configured SLA remain valid pending-KRA issues.

**Regression coverage**: `BUG-048` in `src/test/bugBountyFixes.test.ts`.

---

## §98 — Org KPI Data Entry Empty-State Accuracy

The `/admin/org-kpi-data` page MUST NOT render a generic "no KPIs" empty card when data, ownership, or auth state is still resolving, and the empty card MUST distinguish the four causes below. This codifies the RCA for Vivek Kumar Dansena's April-2026 false empty state (170 backend definitions silently masked).

1. **Loading guard.** The page MUST defer rendering of any empty state until `authLoading || !isReady || kpisLoading || ownershipLoading` are all false. While loading, the `TableSkeleton` is the only acceptable placeholder.
2. **Cause-specific copy.** When `groupedKpis.length === 0`, the empty card MUST be one of: `no-backend-rows`, `masked-admin`, `all-frequency-locked`, or `filtered-out`. The decision MUST run through the pure helper `deriveOrgKpiEmptyState` (`src/lib/orgKpiEmptyState.ts`) so the contract stays testable.
3. **Stale-filter self-healing.** Selected category and selected data-owner MUST auto-reset whenever the visible KPI set no longer contains the filter target (period change, year change, ownership refresh).
4. **Filtered-out affordance.** When filters hide all rows, a Clear-Filters action MUST be present.
5. **Admin diagnostics.** When `isAdmin`, the empty card MUST display the four-stage funnel counts (backend / ownership / frequency / grouped) so the cause is debuggable in-app.

**Regression coverage**: `src/test/orgKpiEmptyState.test.ts` (7 tests).

---

## §54 v3 — Multi-Month KPI Score Inheritance (Apr 29, 2026 amendment)

**Reverses the §54 stage-guard added on 2026-04-05.** For multi-month KPIs (`Bi-Monthly`, `Quarterly`, `Half-Yearly`, `Yearly`), only the chronologically terminal month of each cycle traverses the workflow (Self → … → Management → Approved). All non-terminal sibling months are placeholders.

**The instant** the terminal month transitions to `approved`, the `percolate_multimonth_score` trigger force-applies the terminal month's full submission snapshot (all stage scores, ratings, achieved values, remarks, evidence) to every sibling in the cycle and sets `kpis.status = 'approved'`, regardless of the sibling's prior workflow stage. Audit action: `SCORE_PERCOLATED` with `metadata.policy = 'POLICY_54_v3'`.

**Compensating controls** (replacing the old auditor-bypass concern):
1. The existing `enforce_frequency_lock_on_submission` trigger already prevents any non-Admin user from submitting/transitioning a non-terminal sibling. Only the terminal-month auditor signs off; sibling approval is a derivative artifact.
2. The percolation trigger temporarily sets `app.percolation_bypass = 'true'` (transaction-local) so its own legitimate writes are not blocked by the lock trigger.
3. The terminal-month guard inside the trigger ensures that approving an earlier month (e.g. Feb in a Feb-Mar cycle) does NOT overwrite the later month — only the chronological terminal can be the source of truth.

**Workflow-template changes**: `workflow_change_step_back` skips non-terminal multi-month siblings — their scores follow the terminal month, not the local workflow.

**Backfill**: The one-shot `backfill_multimonth_percolation()` function applied this rule retroactively on 2026-04-29, propagating 23 sibling KPIs across 142 approved terminal cycles. Each backfill row is audit-logged with action `BACKFILL_MULTIMONTH_PERCOLATION` and `performed_by = NULL` (system action).

**Forbidden**:
- Re-introducing the `PERCOLATION_DEFERRED` path or any sibling-stage guard inside `percolate_multimonth_score`.
- Allowing UI surfaces to accept submissions on non-terminal sibling months for non-Admin roles.
- Calling `UPDATE kpis SET status = …` on a non-terminal sibling without first setting `app.percolation_bypass = 'true'` in a SECURITY DEFINER context.

**Related**: ADR-047 (third amendment), `mem://architecture/pms/multimonth-percolation`.

## §54 v4 — Post-Approval Re-Percolation (May 1, 2026 amendment)

**Extends §54 v3.** If scores on the terminal month's `review_submissions` row are modified **after** the KPI is already `approved` (e.g., admin corrects management_score), the `repercolate_on_submission_update` trigger automatically propagates the updated scores to all sibling month submissions.

**Trigger**: `trg_repercolate_on_submission_update` (AFTER UPDATE on `review_submissions`). Fires only when:
1. Any score, rating, achieved_value, or is_na column actually changed (OLD vs NEW comparison).
2. The parent KPI is `approved`, multi-month frequency, and the terminal month of its cycle.

**Recursion guard**: Sets `app.repercolation_active = 'true'` (transaction-local) before writing to siblings. The trigger checks this flag and skips if already active, preventing infinite loops.

**Audit action**: `SCORE_REPERCOLATED` with `metadata.policy = 'POLICY_54_v4'` and `metadata.tool = 'repercolate_on_submission_update'`.

**One-shot repair (May 1, 2026)**: Jitendra Dwivedi's AFBC Incentive Feb-Mar 2026 cycle had stale February data (is_na=true, no management/final scores) after March was corrected post-approval. Manually repaired with `SCORE_REPERCOLATED` audit log.


## §110 — Safety Module Shell Isolation (Phase 0)
**Date:** 2026-04-29 · **Status:** Active

The Safety module is the second module mounted on the Module Hub (after PMS). It ships as a **fully decoupled application shell** at `/safety/*`, composed of:
- `SafetyLayout` (`src/components/safety/SafetyLayout.tsx`)
- `SafetySidebar` (`src/components/safety/SafetySidebar.tsx`)
- `SafetyHeader` (`src/components/safety/SafetyHeader.tsx`)

**Forbidden imports (enforced by `src/test/safetyShellIsolation.test.tsx`):**
- Safety shell components MUST NOT import `AppSidebar`, `DashboardLayout`, or `MinimalHeader`.
- `DashboardLayout` MUST NOT import anything from `src/components/safety/`.

**Visibility — two independent gates, both required:**
1. **Global kill-switch:** `public.modules.is_enabled = true` for `code='safety'`. Toggled by PMS admins from `/admin/module-hub` (`ModuleHubSettings`). Defaults to `false`.
2. **Per-user grant:** A row in `public.safety_module_access` with `can_view = true`, **OR** the user holds the PMS `admin` role (auto-granted via `public.has_safety_module_access(uuid)` SECURITY DEFINER function).

**Realtime revocation:** `useModules()` subscribes to `safety_module_access` filtered by `user_id=auth.uid()`. Revoking a grant hides the Safety card on the Hub within one realtime tick.

**Route guard:** Every `/safety/*` route is wrapped by `SafetyModuleRoute`, which re-checks both gates before any Safety chrome renders. Failure redirects to `/home`.

**Forbidden:**
- Adding Safety pages outside `src/pages/safety/` or `src/components/safety/`.
- Mounting Safety routes inside the `<Route element={<DashboardLayout />}>` tree.
- Introducing any `safety_*` table without RLS that routes through a SECURITY DEFINER helper (mirrors PMS `has_role` pattern to prevent recursion).
- Storing Safety-specific roles on `profiles` or in `app_role` — Safety roles will live in a separate `safety_app_role` enum + `safety_user_roles` table (Phase 1.A).

**Related:** `mem://architecture/safety/module-shell-isolation`.

---

## §111 — Safety RBAC (Phase 1.A)

The Safety module has its own role system. **It does NOT reuse PMS `app_role`.**

- **Enum:** `public.safety_app_role` (`admin, safety_head, safety_officer, bu_head, manager, supervisor, worker, auditor`).
- **Table:** `public.safety_user_roles (user_id, role, business_unit_id?, department_id?, assigned_by, assigned_at)` — UNIQUE across the four-tuple, NULL-safe via COALESCE expression index.
- **Authoritative check:** `public.has_safety_role(uid, role, bu?)` — `SECURITY DEFINER`. **All Safety RLS policies MUST use this helper** to avoid recursion (mirrors PMS `has_role`).
- **Module access:** `has_safety_module_access(uid)` returns `true` if either an explicit `safety_module_access` row exists OR the user has any `safety_user_roles` row. Granting any Safety role therefore implicitly reveals the Hub card and unlocks `/safety/*`.
- **Audit:** every grant/revoke is recorded in `public.safety_audit_log` via `AFTER INSERT/DELETE` trigger. Only Safety `admin` can read the log.
- **Admin surface:** `/safety/settings/users` (`SafetyUsers` page). Lives inside the Safety shell — never duplicated under `/admin/*`.
- **SSOT:** `src/lib/safetyRoles.ts` — keep in sync with the Postgres enum.

**Forbidden:**
- Storing Safety roles on `user_roles` or `profiles`.
- Querying `safety_user_roles` directly inside an RLS policy on the same table without `has_safety_role()` indirection.
- Inserting into `safety_audit_log` from app code (only the trigger is authorised).

**Related:** `mem://architecture/safety/rbac`.

---

## §112 — Safety Incident Schema & FSM (Phase 1.B)

The Safety incident workflow is a **server-enforced 7-stage FSM**. The frontend cannot bypass it.

### Stages (strict order)
`reported → assigned → investigation → rca → corrective_action → verification → closed`

`orphaned` is the only out-of-band status (set when no responsible owner can be identified). Closure is only reachable via the linear path.

### Tables
- `safety_incidents` — core record. `incident_number` auto-generated as `INC-YYYY-######` from `safety_incident_number_seq` under an advisory transaction lock (offline replay safe).
- `safety_incident_timeline` — append-only audit of every status change. Inserted only by the `transition_safety_incident` RPC.
- `safety_incident_evidence` — single source of truth for files. Tagged with a `stage` enum (`report/assignment/investigation/rca/capa/verification`). **No `media_urls jsonb` on incidents.**
- `safety_incident_progress_logs` — running notes per stage.
- `safety_severity_sla` — admin-editable SLA matrix. Seeded with `low=48h ack/720h close`, `medium=24/336`, `high=8/168`, `critical=2/72`.

### Enforcement
- **`safety_incident_fsm_guard` BEFORE UPDATE trigger** — blocks any `status` change unless `current_setting('safety.fsm_transition','true') = 'on'`. The session flag is set only inside the RPC.
- **`transition_safety_incident(p_incident_id, p_to_status, p_notes, p_assigned_to)` RPC** — `SECURITY DEFINER`, the **only** legal entry point for stage advancement.
  - Rejects non-sequential transitions.
  - `→ assigned` requires `p_assigned_to`.
  - `→ closed` requires: ≥1 `verification`-stage evidence row, ≥1 progress log, non-empty `verification_notes`.
  - Returns `{ ok: boolean, error?: string, from?, to? }` envelope. Never throws to callers.
- **`safety_incident_before_insert` trigger** — assigns `incident_number` and SLA deadlines from the severity matrix.

### SLA visibility
- Live `sla_state` (`green/amber/red/closed`) is exposed via the `safety_incidents_with_sla` view (`security_invoker = true`). The view is the **only** source for displaying SLA state. Never recompute it client-side.
- `now()` cannot live in a generated column (immutability rule), so the view replaces a stored generated column.

### Offline idempotency
- Every incident carries `client_submission_id uuid` with a DB UNIQUE constraint on `(reporter_id, client_submission_id)`. The frontend generates this via `crypto.randomUUID()` at form submission time; reconnect replays are deduplicated by the DB.

### Cache scope
- All Safety React Query keys live under `['safety', ...]`. `invalidateAllSafetyQueries(qc)` (in `src/hooks/useSafetyIncidents.ts`) invalidates only that prefix and **must never** invalidate PMS keys.

### Storage
- Bucket `safety-media` (private). Users can only write/read their own folder; `admin/safety_head/safety_officer/auditor` can read all. Only `admin` (or the uploader) can delete.

### Forbidden
- Direct `update({ status: ... })` calls from app code — will be rejected by the FSM guard.
- Inserting into `safety_incident_timeline` from app code — only the RPC is authorised.
- Adding a `media_urls` column or any duplicate file storage on `safety_incidents`.
- Hardcoding stage labels, severities, or types in components — import from `src/lib/safetyIncidents.ts`.

**Related:** `mem://architecture/safety/incident-fsm`.

---

## §113 — Safety Manual-Fetch & Pagination

The Safety module follows a strict **filters-first → click-to-load → paginated** model on every list/query surface. This eliminates wasteful cold-load queries and enforces a scalable UX for large datasets.

### Rules
1. **No auto-fetch on list/query screens.** A list page must mount with the filter bar visible and an `awaiting-search` empty state. The query fires **only** when the user clicks the **Search** button (or presses Enter inside any filter input).
2. **Server-side pagination is mandatory.** Default page size 25; user-selectable from {25, 50, 100}. No tabular surface may render more than one page of rows. Queries use `.range(from, to)` with `count: 'exact'`.
3. **Cache key is the *submitted* filters + page + pageSize.** Typing in a filter input does not refetch; only Search does. Mutations re-run the **last submitted** query — never silently change filters.
4. **Exempt surfaces:** detail pages (`/safety/.../:id`), single-aggregate dashboard tiles (`SafetyHome` tiles, `SafetyAnalytics` KPI cards), `New`/`Edit` forms, master-detail editor list panes (`SafetyAuditTemplates` left pane, `SafetyPermitTypeConfig`, `SafetyTrainingAdmin`), and **life-safety reference data** that must be instantly viewable in a crisis (`SafetyEmergency` dashboard, `SafetyEmergencyContacts`). Any embedded *table* inside an ordinary dashboard is **not** exempt.
5. **Sanctioned primitives** — every Safety list MUST use:
   - `useManualQuery` (from `src/hooks/useManualQuery.ts`)
   - `<SafetyFilterBar>` (from `src/components/safety/SafetyFilterBar.tsx`)
   - `<SafetyDataTable>` (from `src/components/safety/SafetyDataTable.tsx`)
   - `<SafetyEmptyState>` (from `src/components/safety/SafetyEmptyState.tsx`)
6. **Naming:** primary trigger button is labelled **Search** (filter screens) or **Load** (parameterless screens). Secondary is **Reset**. No other verbs.

### Forbidden
- React Query `useQuery({ enabled: true })` returning a list on a Safety list page.
- `.select('*')` without `.range()` on any Safety list query.
- Client-side filtering of an unbounded result set.
- Hardcoded page-size constants outside the primitives.

**Related:** `mem://architecture/safety/manual-fetch-and-pagination`, `docs/adr/ADR-050.md`.

### Migration log
- **Phase 1 (2026-04-29):** SafetyAuditLog, SafetyIncidents, SafetyPermits, SafetyAudits.
- **Phase 2 (2026-04-29):** SafetyAssets, SafetyHoursWorked, SafetySlaMonitor.
- Static guard: `src/test/safetyManualFetchPages.test.ts` enforces every migrated page imports the sanctioned primitives.

## §114 — Cached Reports Reload Contract

Manual "Reload" / "Refresh" buttons on cached report screens MUST invalidate
their query keys (`queryClient.invalidateQueries({ queryKey: [...] })`).

---
## Version History
- **v2.66.7.15 (2026-05-01):** §54 v4 — Post-approval re-percolation trigger on `review_submissions`. Data repair for Jitendra Dwivedi AFBC Incentive Feb-Mar 2026.
Toggling local state alone is not sufficient: when filters are unchanged,
React Query returns the cached payload without re-issuing the request, so
a previously-failed (empty/all-null) result will keep showing.

**Companion rule — submission batch URL safety:** any client-side fan-out
over `kpi_id=in.(...)` (or any large `in.(...)` filter) MUST cap each batch
so the resulting URL stays well under the PostgREST/CDN ~16 KB limit.
200 UUIDs per batch (~7.6 KB) is the sanctioned ceiling; do not raise it
without measuring the produced URL length.

**Reference implementation:** `src/hooks/useMonthlyTrend.ts` +
`src/components/reports/MonthlyTrendView.tsx`. Test:
`src/test/monthlyTrendCacheBust.test.ts`. Memory:
`mem://features/reports/monthly-scorecard-trend`.

---

## §88A — KPI Standardization Forward-Only Policy

1. **Past Data Immutability:** KPI rows for periods before May 2026 MUST NOT be modified by the standardization tool. The `correct_may_kpis()` function enforces this with a hard check.

2. **Canonical Registry Authority:** From May 2026 onward, all KPIs should reference a canonical `kpi_definitions` entry. The registry is the source of truth for KPI identity.

3. **Alias-Based Cross-Month Linking:** Historical data is linked to canonical definitions via `kpi_name_aliases`, not by modifying the historical rows. Dashboard queries use `resolve_canonical_kpi()` to group across months.

4. **Soft Enforcement:** Free-text KPI names are allowed but flagged. Registry selection is the default picker for all KPI creation flows.

5. **Scoring Independence:** Standardizing KPI names does NOT affect per-employee scoring thresholds (r5-r0), target values, or weightages. These remain independently configurable.

6. **Idempotent Approval:** "Approve as Canonical" in the Build Registry tab MUST be idempotent. If a `kpi_definitions` row already exists for the chosen `(canonical_kra_name, canonical_kpi_name)` pair, the flow MUST reuse that definition and only insert the missing `kpi_name_aliases` rows — never raise a duplicate-key error to the user. De-duplication is case- and whitespace-insensitive.

---

## §88B — Phase 2a Canonical Resolver Read Path

1. **Read-only resolution.** Cross-month canonical grouping is performed
   exclusively at read time via `resolve_canonical_kpi_batch()`. No view,
   hook, or component built on top of this resolver is permitted to write
   back to `kpis`, `review_submissions`, `org_kpi_values`, or any other
   data table. Standardization writes remain confined to the admin tools
   in §88A.

2. **Fail open, never blank.** If the resolver RPC errors or returns an
   empty payload, callers MUST fall back to raw signature grouping (each
   row in its own bucket). A registry outage must never produce a blank
   or misleading aggregate. `useCanonicalResolver` enforces this with a
   try/catch that returns an empty Map and logs to console.

3. **Per-month grids unchanged.** Any UI surface that presents a single
   review period MUST continue to render the row's own `kra_name` /
   `kpi_name` text (the historical record). Canonical names may only
   replace the displayed text on aggregations that span multiple variants
   in the current view, and even then only with a visible "Also known
   as" disclosure.

4. **Signature key normalization.** The `nk()` helper
   (lowercase + trim + collapse whitespace) is the canonical client-side
   key for grouping in the read path. It is NOT used as a SQL filter;
   server lookups use the registry tables' indexed columns directly.

5. **Disclosure requirement.** Wherever variants are merged into a
   canonical row, the UI MUST surface a small visual indicator (e.g.
   `GitMerge` icon) and on-hover list of the original variant texts so
   users can audit why a previously-distinct row no longer appears
   separately.

## Version History
- **v2.66.13.1 (2026-05-25):** §11.6 added — Bulk Review Org-GAP indicator must be based on complete batched org-flag lookups, and manual Refresh invalidates both snapshot and org flags.
- **v2.66.7.16 (2026-05-01):** §88B added — Phase 2a canonical resolver read path. Adds `resolve_canonical_kpi_batch` RPC, `useCanonicalResolver` hook, `canonicalGrouping` utilities, and KraSummaryTab merge with "Also known as" tooltip.
- **v2.66.7.17 (2026-05-01):** §88C added — Phase 2b soft enforcement via DB trigger `trg_kpi_canonical_autolink`, feature flag `enable_kpi_canonical_autolink` (default ON), `promote_signature_to_definition` admin RPC, and Governance tab on /admin/kpi-standardization.
- **v2.66.7.18 (2026-05-01):** §88D added — Phase 2c Registry Health & Coverage dashboard. Adds admin-only RPCs `get_registry_coverage_stats`, `get_unlinked_signatures`, `detect_alias_drift`, `useRegistryHealth` hook, and `HealthCoverageTab` on /admin/kpi-standardization.
- **v2.66.7.19 (2026-05-01):** §88E added — Phase 3a Registry visibility in creation flows. Adds `RegistryBadge` / `RegistryBadgePreset` components and `canonicalEnforcementPeriod.ts` shared helper. Wired into AdminKpiCreateDialog, AdminKpiEditorForm, and SmartAssignmentDialog (template cards). Bulk Import deliberately not wired — wrong domain (it imports values, not new KPIs).
- **v2.66.7.20 (2026-05-01):** §88F added — Phase 3b Canonical-aware previous-month lookup in `KpiJourneySection`. The "Previous 2 Months" panel now resolves the current KPI to its canonical definition and matches historical rows against any registered alias (kra/kpi pair), so a renamed KPI still surfaces its history. Renamed matches are flagged with a `GitMerge` "Also known as" badge that reveals the original variant name in tooltip. Falls back to legacy exact-name match when no canonical definition exists.
- **v2.66.7.21 (2026-05-01):** §88G added — Phase 3c Read-only Registry Browser at `/registry`. New SECURITY DEFINER RPC `get_public_registry_view(p_search, p_category_id)` returns canonical definitions, aliases, and per-definition aggregate usage counts. Authenticated users only — anon blocked. New `registry-browser` menu_access_config row defaults visibility to admin/manager/hr_pms/management/auditor/skip_level (plain employees excluded). Hook `useRegistryBrowser`, page `RegistryBrowser.tsx`, sidebar entry under main section.
- **v2.66.7.22 (2026-05-01):** §88H added — Phase 4a/4b Auto-merge suggestion engine. Enables `pg_trgm`. Adds admin-only RPCs `suggest_definition_merges`, `suggest_alias_candidates`, `dismiss_suggestion`, plus `registry_suggestion_dismissals` table (RLS admin-only, idempotent PK). New `SuggestionsTab` (6th tab on /admin/kpi-standardization) with threshold sliders (persisted in localStorage), definition merge candidates table (Merge action stubbed pending Phase 4c), and alias promotion candidates table that reuses `promote_signature_to_definition`. `useRegistrySuggestions` and `useDismissSuggestion` hooks fail open. Forward-only — pre-May-2026 rows excluded everywhere.
- **v2.66.7.23 (2026-05-01):** §88H §§9–12 added — Phase 4c hardening. New append-only `kpi_registry_audit_log` table (admin-only RLS, no UPDATE/DELETE policies), transactional `merge_definitions(p_keep_id, p_drop_id, p_reason)` RPC (deterministic row locks, alias re-parenting + collision drop, backfill alias, KPI re-pointing, single `KPI_DEFINITION_MERGED` audit row, auto-dismissal of merged pair), and `get_registry_pending_suggestion_count` for the Health dashboard tile. UI wires per-row **Keep A / Keep B** buttons through `useMergeDefinitions`, replacing the Phase 4b stub.

---

## §88C — Phase 2b Soft Enforcement (Auto-link Trigger)

1. **DB-layer enforcement only.** Canonical auto-linking on KPI insert/update is implemented as a BEFORE trigger on `public.kpis`. Client UIs MUST NOT replicate this logic. There is exactly one source of enforcement.

2. **Forward-only gate.** The trigger only fires when `is_canonical_enforcement_period(review_period, review_year)` returns true (May 2026 or later). Any KPI in a frozen historical period is left untouched even if a matching alias exists.

3. **User intent wins.** If a caller explicitly provides `kpi_definition_id` on insert, the trigger does NOT overwrite it. Manual links always take precedence over registry auto-links.

4. **Soft, never blocking.** The trigger NEVER raises an error when an alias is missing. KPIs with custom names save with `kpi_definition_id = NULL` and surface in the Health/Unlinked queue (Phase 2c).

5. **Toggleable, audited.** The `enable_kpi_canonical_autolink` system_settings flag pauses auto-linking without dropping the trigger. Each auto-link writes a `KPI_CANONICAL_AUTOLINKED` audit row with `performed_by = NULL` (system action per System Performer Attribution memory). Audit insert is wrapped in EXCEPTION so logging failures never block KPI writes.

6. **Admin-only promotion.** `promote_signature_to_definition()` is gated by an admin role check and back-links only May 2026+ rows. It MUST NOT be exposed to non-admin RPC callers.

---

## §88D — Phase 2c Registry Health & Coverage

1. **Read-only metrics surface.** The Health & Coverage tab is purely observational. It MUST NOT mutate definitions, aliases, or KPI rows. All write actions remain in Build Registry / Review Registry / Governance tabs.

2. **Coverage scope = enforcement scope.** All "in-scope" counts (`inscope_kpis_total`, `inscope_kpis_linked`, `inscope_kpis_unlinked`, `coverage_pct`) MUST use `is_canonical_enforcement_period(review_period, review_year)` so dashboard math always agrees with what the auto-link trigger actually controls. Historical KPIs (pre-May 2026) are intentionally excluded from coverage percentage to avoid permanently dragging it down.

3. **Admin-gated RPCs.** `get_registry_coverage_stats`, `get_unlinked_signatures`, and `detect_alias_drift` MUST raise `access denied` for any caller lacking the `admin` role. They are SECURITY DEFINER with `SET search_path = public` per PLpgSQL Standards.

4. **Unlinked queue ranking.** Unlinked signatures are ordered by `occurrence_count DESC, last_seen DESC` so admins triage the highest-impact gaps first. The default page size is 100; do not raise without a paging UI.

5. **Drift is advisory.** `detect_alias_drift()` flags definitions whose aliases span >1 distinct KRA name. This is a hint, not a rule — some legitimate canonical KPIs do span KRA renames. Do not auto-split or auto-merge from this signal.

6. **Fail-open loading.** The `useRegistryHealth` hook MUST set local error state on RPC failure rather than throwing, and the dashboard MUST render an inline destructive Card with the message instead of crashing the page.

---

## §88E — Phase 3a Registry Visibility in Creation Flows

1. **Inline indicator only — no second picker.** The `RegistryBadge` (and its presentational sibling `RegistryBadgePreset`) only **labels** the user's current selection. It MUST NOT introduce a parallel picker that competes with the existing `kpi_templates` (KRA Library) picker; that would split authoring intent across two taxonomies.

2. **Period-gated visibility.** The badge MUST hide whenever `isCanonicalEnforcementPeriod(period, year)` returns false. This keeps it invisible in pre-May-2026 data-repair and historical-edit flows so authors are not nudged about records they cannot restandardize.

3. **Single client mirror of the period rule.** All client gating MUST go through `src/lib/canonicalEnforcementPeriod.ts`. Any future code that needs the same gate MUST import this helper rather than re-implement the month-list inline. The DB function `is_canonical_enforcement_period()` remains the source of truth; the client mirror exists only for UI hide/show decisions and is locked by `canonicalEnforcementPeriod.test.ts`.

4. **Batch resolver in list contexts.** When showing the badge across multiple rows (e.g. SmartAssignmentDialog template cards), callers MUST use `useCanonicalResolver()` once with the full signature array and pass the resulting Map down via `RegistryBadgePreset`. Per-row `RegistryBadge` instances inside lists are forbidden — they would issue N RPCs.

5. **Non-blocking, never enforced from the UI.** The badge MUST NOT prevent submission, change form validity, or alter what gets written to `kpis`. Auto-linking remains the trigger's job per §88C; the badge is purely informational.

6. **Out of scope for 3a.** OrgKpiBulkImport is an **achievement-value** importer that maps Excel rows to existing `kpi_templates` — it does not author new KPI names. The badge does not appear there because there is no authoring decision to label.

## §88F — Phase 3b Canonical-Aware Cross-Period Lookup

1. **Scope is narrow by audit.** Phase 3b applies **only** to `KpiJourneySection`'s "Previous 2 Months" panel. Other reports originally listed in the Phase 3 plan (VarianceReport, KpiJourneyReport, ManagementDashboard's Performance Trend, EmployeePerformanceSummary) are either single-period (forbidden by §88B) or org-aggregate (no per-KPI grouping happens), so canonical merging is not applicable and MUST NOT be retrofitted there.

2. **Read-path only — no write, no schema change.** The lookup expansion is a pure widening of the `.eq('kra_name')`/`.eq('kpi_name')` filter into `.in()` over registered alias pairs. It does not insert, update, or migrate any row, and it never modifies the displayed text of historical rows (per §88B).

3. **Variant pair filtering is mandatory.** Because `.in('kra_name', ...)` and `.in('kpi_name', ...)` are independent IN-clauses, the result MUST be post-filtered by `isAllowedPair()` from `src/lib/prevMonthCanonicalMatch.ts` to reject Cartesian-product false positives like (kraA + kpiB) when only (kraA + kpiA) and (kraB + kpiB) are registered. Locked by `prevMonthCanonicalMatch.test.ts`.

4. **Renamed-variant disclosure is required.** When a prev-month row's `(kra_name, kpi_name)` differs from the current KPI's pair under `nk()` normalization, the UI MUST surface a `GitMerge` "Also known as" tooltip that names the original variant. This preserves audit trust — reviewers must always be able to see what name the historical row was originally recorded under.

5. **Graceful fallback when not registered.** When the current KPI has no `kpi_definition_id` resolution (pre-May-2026 KPIs, unregistered KPIs, or registry RPC failure), the lookup MUST fall back to the legacy single-pair exact-match behavior. No user-visible regression and no error toast.

## §88G — Phase 3c Read-only Registry Browser

1. **Read-only by contract.** `get_public_registry_view` RPC and the `/registry` page MUST NOT expose endpoints to create, update, delete, or promote registry entries. Admins continue to manage the registry from `/admin/kpi-standardization` (§88D, §88E) — there is exactly one write surface.

2. **No sensitive performance data.** The RPC returns only: canonical name, aliases, category, and an aggregate usage count per definition. It MUST NEVER expose employee identifiers, scores, achieved values, evidence URLs, or any per-employee breakdown. Locked by `useRegistryBrowser.test.ts` which asserts the `RegistryDefinitionView` shape contains none of the forbidden keys (`employee_id`, `*_score`, `achieved_value`, `r0`–`r5`, etc.).

3. **Authenticated users only.** The RPC raises `access denied` when `auth.uid()` is null. The page-level role gate (sidebar + ProtectedRoute + `registry-browser` menu_access_config) is the per-role visibility control; admins can adjust it from the existing menu admin UI without a code change.

4. **Default audience excludes plain Employees.** The seeded `registry-browser` menu_access_config row grants visibility to admin, manager, hr_pms, management, auditor, skip_level. Plain Employee role is intentionally excluded — they have no taxonomy-management need and are shielded from registry noise. Admins may opt them in via the standard menu admin UI if a workspace requires it.

5. **Aggregate usage count uses the same period gate as enforcement.** `usage_count` is computed via `is_canonical_enforcement_period()` so the number a non-admin sees agrees exactly with what the trigger enforces and what the admin Health dashboard reports (§88D). Pre-May-2026 KPIs are not counted.

## §88H — Phase 4 Auto-Merge Suggestions

1. **Suggestions are advisory.** `suggest_definition_merges` and `suggest_alias_candidates` MUST NOT mutate any KPI, alias, or definition row. They surface candidates only. The Suggestions tab is a recommendation surface, not an enforcement surface.

2. **Admin-only at the DB layer.** All Phase 4 RPCs (`suggest_definition_merges`, `suggest_alias_candidates`, `dismiss_suggestion`, and the future Phase 4c `merge_definitions`) raise `access denied` when the caller does not hold the `admin` role via `has_role(auth.uid(), 'admin')`. The UI surface lives only on `/admin/kpi-standardization`.

3. **Forward-only scope.** Both suggestion RPCs use `is_canonical_enforcement_period()` so pre-May-2026 KPI rows never contribute to suggestions and are never affected by any subsequent merge action. This mirrors §88D and prevents the engine from proposing changes against frozen historical periods.

4. **Same-category pairs only.** Definition merge candidates are constrained to definitions sharing the same `category_id`. Cross-category fuzzy matches are suppressed by design — categories represent distinct evaluation domains and a high lexical similarity across categories is almost always a false positive.

5. **Stable pair canonicalization.** Definition pairs are always returned as `(LEAST(id), GREATEST(id))`, and `dismiss_suggestion` normalizes the same way. This guarantees that dismissing a pair from either ordering hits the same `(kind, left_id, right_id)` PK and the suggestion stops re-appearing.

6. **Idempotent dismissals.** `registry_suggestion_dismissals` PK is `(kind, left_id, right_id)`. Re-dismissing the same pair is a no-op via `ON CONFLICT DO NOTHING`. There is no UI to undo a dismissal — admins remove rows from the table directly if a candidate should re-surface.

7. **Alias promotion goes through the existing API.** The Suggestions tab promotes an alias candidate by calling the existing `promote_signature_to_definition(category, kra, kpi, canonical_kra, canonical_kpi)` RPC, which finds the existing definition (via the unique `(canonical_kra, canonical_kpi, category)` index) and adds the variant alias plus back-links matching May-2026+ rows. Phase 4 does not introduce a separate alias-attach RPC — there is exactly one promotion code path.

8. **No silent merging.** Every action — merge, promote, dismiss — requires explicit user input. The Suggestions tab MUST NOT auto-apply a candidate, even at extreme similarity scores, and MUST NOT pre-tick or pre-select any row.

9. **Transactional merges (Phase 4c).** `merge_definitions(p_keep_id, p_drop_id, p_reason)` is the **only** sanctioned code path for collapsing two canonical definitions into one. It MUST run inside a single transaction, lock both definition rows `FOR UPDATE` in deterministic order (lower UUID first) to prevent concurrent-admin races, refuse cross-category merges, re-parent the dropped definition's aliases (deleting any that would collide with an existing alias on the kept side), insert a backfill alias preserving the dropped canonical text, re-point all `kpis.kpi_definition_id` references, delete the dropped definition, and write exactly one audit row before returning.

10. **Immutable registry audit log.** Every successful merge writes one `KPI_DEFINITION_MERGED` row to `kpi_registry_audit_log` with `performed_by = auth.uid()`, the surviving and dropped definition snapshots, and the counts of re-parented aliases / dropped alias conflicts / re-pointed KPIs. The table has admin-only INSERT/SELECT and intentionally has no UPDATE or DELETE policy — registry actions are append-only.

11. **Auto-dismissal on merge.** A successful `merge_definitions` call MUST also invoke `dismiss_suggestion('definition_merge', keep_id, drop_id, 'auto: merged')` so the same pair never reappears even if a stale suggestion row is cached on the client.

12. **Forward-only re-pointing.** `merge_definitions` may only modify rows that the registry already governs (`kpis.kpi_definition_id`). It MUST NOT touch the historical `kra_name` / `kpi_name` text on any KPI row — §88B (forward-only correction) still wins. Pre-May-2026 rows are unaffected because they were never linked in the first place.

13. **Definition split (Phase 5).** `split_definition(p_source_id, p_keep_alias_ids, p_move_alias_ids, p_new_kra_name, p_new_kpi_name, p_rename_source_kra, p_rename_source_kpi, p_reason)` is the **only** sanctioned path for separating two KPIs that were accidentally grouped under one canonical definition. It MUST run inside a single transaction, lock the source definition + every alias `FOR UPDATE` in deterministic UUID order, refuse partitions that overlap, miss aliases, reference unknown ids, or leave the move side empty, and refuse blank new canonical text. KPI re-pointing is signature-based against the post-update alias mapping. Pre-May-2026 KPI rows are untouched (they were never linked).

14. **Split audit row.** Every successful split writes exactly one `KPI_DEFINITION_SPLIT` row to `kpi_registry_audit_log` with `performed_by = auth.uid()`, source-before / source-after / new-definition snapshots, the kept and moved alias id arrays, the count of re-pointed KPIs, and the rename flag. Same append-only governance as merges.

15. **Split UI guardrails.** The SplitDefinitionDialog MUST surface a live KPI-impact preview (`preview_split_definition` RPC) before commit, MUST require a non-empty admin reason (recorded in audit), and MUST disable the submit button until the partition is valid. Server-side validation in `split_definition` is the source of truth — the UI is a fast-feedback layer, not an authority.

## §114 — Admin Matrix Dashboard Pagination

Admin pages that render a matrix grouped by employee (e.g., the **KPI Weightage Dashboard** at `/admin/kpi-weightage-dashboard`) MUST paginate the **outer dimension (employees)** server-side rather than loading the full org's fiscal-year dataset on mount.

1. **Employee paging.** Page size options are `25 / 50 / 100`, default **25**. Filter changes (year, search, department, category, include-inactive) reset to page 1. Free-text search MUST be debounced (≥ 250 ms) before issuing a query.
2. **Scoped detail fetch.** Once the page's employee IDs are known, the matrix detail query (KPIs, scores, etc.) MUST be scoped via `.in('employee_id', pageIds)` so the heavy query never runs unbounded.
3. **Aggregate badges are filter-scoped, not page-scoped.** Summary counters (e.g. variance / acknowledged badges, total employees) MUST reflect the **full filter set**, computed via a separate, cached aggregate query. They MUST NOT silently change as the user pages.
4. **Cache invalidation contract.** Mutations on these screens MUST invalidate the dashboard's base query key prefix so all pages and the summary refresh together.
5. **Mapped-employees only (May 2026).** The KPI Weightage Dashboard MUST restrict its employee universe to people who have at least one `kpis` row in either review_year of the selected fiscal cycle (and matching the active category filter). Profiles with no KRA/KPI mapping MUST NOT appear in the list, the badges, or the Export. Implemented by pre-resolving distinct `employee_id`s from `kpis` and constraining the profiles query via `.in('id', …)` in both `useKpiWeightageMatrix` and `useWeightageVarianceSummary`.
6. **Report matrices: server-side scope + click-to-load (May 2026, v2.66.12.0).** Report-style matrices that fan out across employees × KPIs for a single period (starting with **KPI-Employee Matrix** at `/reports/kpi-employee-matrix`) MUST NOT issue a single nested PostgREST query over the period's full `kpis` table. They MUST: (a) resolve eligible `employee_id`s via a SECURITY DEFINER scope RPC that applies Division / BU / Department / Category / Search filters server-side; (b) batch profile and KPI-row fetches in chunks of ≤ 500; (c) gate the heavy fetch behind a **Load Matrix** click that follows a cheap scope-preview ("≈ N employees · M cells"); (d) enforce a hard cell cap (`MATRIX_CELL_CAP = 25_000`) — exceeding the cap MUST surface a "narrow filters" banner instead of attempting the fetch. The Division filter takes precedence over Business Unit when both are set, matching pre-fix behavior. See ADR-065.

Rationale: the previous full-org load shipped thousands of rows on every visit and degraded as headcount grew. This contract caps cold-load cost while keeping admin numbers honest.

## §88I — Phase 5b Reversible Standardization Actions

1. **Append-only history.** Every mutation made through the KPI Standardization tools (create canonical, link/unlink alias, edit canonical, rename KPIs via `correct_may_kpis`, delete definition) MUST insert exactly one row into `public.kpi_standardization_actions`. The table has admin-only `SELECT` and `INSERT` policies and intentionally has **no `UPDATE` or `DELETE` policy** — rows are append-only. Reversal is a state flip (`reversed_at`, `reversed_by`) performed by a `SECURITY DEFINER` function, not by deleting the action row.

2. **Single reversal entry point.** `reverse_standardization_action(p_action_id uuid)` is the only sanctioned undo path. It MUST validate the caller via `has_role(auth.uid(),'admin')`, refuse if `reversed_at IS NOT NULL`, and perform the inverse mutation atomically before stamping `reversed_at = now(), reversed_by = auth.uid()`. UI components MUST NOT replicate undo logic by issuing direct `DELETE` / `UPDATE` calls.

3. **Forward-only freeze still wins.** Reversing a `rename_kpis` action restores prior `kra_name` / `kpi_name` / `kpi_definition_id` values **only on rows the original action touched** (captured by id in the payload's `kpi_rows[]`). It MUST NOT operate on any row whose `(review_period, review_year)` falls before May 2026. The original `correct_may_kpis` guard is what prevents pre-May-2026 rows from ever entering the payload in the first place.

4. **Create-undo safety check.** Reversing a `create_definition` action MUST refuse when any `kpis` row still references the definition via `kpi_definition_id`. The function raises with the live count so the admin can unlink first or use Edit Definition to repoint. There is no force-delete path.

5. **Edit-definition propagation contract.** `useEditDefinition` exposes two modes: *Registry only* (rewrites only the canonical names on `kpi_definitions`) and *Registry + propagate* (also calls `correct_may_kpis` for each distinct `(period, year, category, kra, kpi)` tuple currently linked to the definition). Propagation MUST iterate only May-2026+ tuples; pre-2026 rows are skipped client-side and the DB function would reject them anyway. Each propagated rename also generates its own `rename_kpis` action row, so undo is granular per period.

6. **Pre-approval canonical edit.** The Build Registry tab MUST allow admins to edit the canonical KRA / KPI text inline before clicking *Approve as Canonical*. The chosen text becomes `canonical_kra_name` / `canonical_kpi_name`; all listed variants (including the originally selected one if its text now differs) are written as aliases. Empty/whitespace-only canonical text MUST block submission with a toast — no silent fallback.

7. **Drill-in is read-only.** The shared `AffectedKpisTable` component (used by Build Registry, Review Registry, and Correct May KPIs) is purely observational. It MUST NOT expose any write actions on the listed KPI rows; standardization writes remain confined to the existing buttons.

8. **History tab UX contract.** The History & Undo tab MUST show reversed actions in a dimmed state (not hidden) so the audit trail stays visible. Undo MUST go through `ConfirmDestructiveDialog` per the Destructive Action Governance memory.

9. **Scanner uniqueness invariant.** `scan_kpi_duplicate_groups` MUST emit at most one variant per `(category_id, kra_name, kpi_name)`. Self-joining `kpis` to its own aggregate is forbidden — it inflates the `variants` array by `row_count` and produces visually duplicated rows in the Build Registry tab. The client (`useScanDuplicates` → `dedupeScannerGroups`) keeps a defensive de-dup pass; both layers MUST be preserved.

10. **Scanner alias-aware filter.** `scan_kpi_duplicate_groups` MUST exclude any `(category_id, kra_name, kpi_name)` variant that already exists in `kpi_name_aliases`. Once an admin clicks **Approve as Canonical**, the variants are linked as aliases and MUST NOT reappear on the next Re-scan. After the alias filter is applied, a group with fewer than two distinct `kra_name` values MUST be dropped from the result. The aliases table is the single source of truth for "this variant has been standardised" — the scanner MUST NOT depend on `kpis.kpi_definition_id` being backfilled.

11. **Persistent "Don't Merge" skips.** Admins MUST be able to mark a duplicate group as permanently skipped through the `kpi_scanner_skips` table (admin-only RLS, no UPDATE policy). The scanner MUST hide skipped groups by default, surface them only when called with `p_include_skipped = true`, and tag them with `is_skipped: true` so the UI can render them dimmed. Skip and un-skip MUST log `skip_group` / `unskip_group` rows into `kpi_standardization_actions`, and MUST be reversible via `reverse_standardization_action` (which removes / re-inserts the skip row). Confirmation MUST go through `ConfirmDestructiveDialog`. Skips are scoped by `(category_id, normalized_kpi)` — the same KPI text in a different category is a separate decision.

12. **Canonical-aware cross-period aggregation.** Any UI surface that aggregates a single KPI across periods (KPI History card, KPI Tracker Sheet, Review Journey, profile trend cards, future scorecards…) MUST resolve sibling rows via the canonical definition + every alias variant — never via strict `kpi_name` / `kra_name` string equality. The shared helper is `src/lib/canonicalRelatedKpis.ts` (`useCanonicalVariantPairs` + `matchesCanonicalKpi` + `preferredVariantRow`). When the current KPI has no canonical entry, the matcher MUST fall back to strict equality so legacy data behaves identically. Period dedup (when two alias rows exist for the same `(period, year)`) MUST prefer the canonical pair, then the row whose id matches the user-clicked KPI, then first-encountered.

13. **Fuzzy duplicate detection.** `scan_kpi_duplicate_groups(p_include_skipped boolean, p_fuzzy_threshold numeric DEFAULT 0.55)` MUST cluster near-identical KPI names within the same `category_id` using `pg_trgm` similarity in addition to the legacy exact-match rule. Each emitted variant MUST carry `match_type: 'exact' | 'fuzzy'` and a `similarity` score in `[0,1]`; each group MUST carry `has_fuzzy: boolean`. The clustering MUST be non-recursive (LATERAL self-join, lex-min representative) to keep per-category cost bounded; a `gin_trgm_ops` index on `LOWER(TRIM(kpi_name))` MUST exist. The skip-list is keyed on the cluster representative — loosening the threshold can surface a fuzzy cousin under a new representative, which admins handle independently via **Don't merge**. The Build Registry UI MUST expose a sensitivity selector (Strict 0.75 / Balanced 0.55 / Loose 0.40) and badge each variant Exact / Fuzzy XX% so admins can judge confidence before approval.

14. **Group splitting (multi-canonical approval).** Because fuzzy clustering can pull together variants that look alike but are semantically distinct (e.g. `Total Recordable Injury (LTI)` vs `Total Recordable Injury (STI)`), the Build Registry UI MUST allow each group to be partitioned into multiple buckets (`A`, `B`, `C`, …) plus a `Skip` bucket. Approving a multi-bucket group MUST create one canonical `kpi_definition` per active bucket and link only that bucket's variants as aliases. The DB contract is unchanged — partitioning is a client-side workflow built on top of the existing idempotent `createDefinitionWithAliases`. Default behaviour (single bucket `A`) MUST remain a strict superset of the historical single-canonical flow. A `Suggest split` action MAY pre-assign buckets via well-known token heuristics (LTI/STI, PM10/PM10-AQI), which the admin can override. Variants assigned to `Skip` MUST be excluded from the approval and remain available for the next scan or for `Don't merge`.

15. **Edit-always-propagates + dashboard canonical-first display.** Edits made through `EditDefinitionDialog` MUST always rewrite `kpis.kra_name` / `kpis.kpi_name` on every May-2026+ row currently linked to the definition (`useEditDefinition` no longer exposes a "registry-only" mode to the admin). Pre-May-2026 rows MUST remain frozen and are excluded both client-side and by the `correct_may_kpis` DB function. To guarantee admin renames are visible immediately even before the rewrite finishes — and to defend against rows whose text columns have not yet been auto-stamped — `KpiHeaderSection` (the "View KPI Details" panel header on the user dashboard) MUST render the canonical pair returned by `useCanonicalVariantPairs(kpi)` in preference to the literal row text whenever the registry resolves a definition for the KPI. Falling back to row text remains the contract when the KPI is unregistered.

16. **One-shot retroactive link backfill.** A migration (Phase 5c) MUST set `kpis.kpi_definition_id` for any May-2026+ row whose `(category_id, normalized kra_name, normalized kpi_name)` matches either a `kpi_definitions` canonical pair or a `kpi_name_aliases` variant pair, and which is currently `NULL`. Pre-May-2026 rows MUST be excluded. The operation MUST log a single `backfill_definition_links` row into `kpi_standardization_actions` (newly added action_type) with the per-source counts in its payload, so it appears in the History tab. The append-only / admin-only RLS guarantees of §88I are preserved; this action is intentionally NOT reversible (un-linking rows would defeat its purpose).

## Version History
- **v2.66.7.49 (2026-05-07):** §97 added. Unified Issues pending-KRA classification now excludes Org KPI rows (`is_org_level=true`) and locked non-terminal multi-month placeholders from employee pending-KRA flags. Regression `BUG-048` pins Vivek's false-flag class while keeping regular monthly KPIs actionable.
- **v2.66.7.50 (2026-05-07):** §98 added. Org KPI Data Entry empty state must wait for auth/ownership readiness, classify via `deriveOrgKpiEmptyState`, self-heal stale category/owner filters, expose Clear Filters, and show admin diagnostics counts. Regression in `src/test/orgKpiEmptyState.test.ts`.
- **v2.66.7.24 (2026-05-01):** §88I added — Phase 5b Reversible Standardization Actions. New `kpi_standardization_actions` table (append-only, admin RLS), `log_standardization_action` + `reverse_standardization_action` RPCs, extended `correct_may_kpis` to capture before-image, new `useEditDefinition` / `useUnlinkAlias` / `useDeleteDefinition` / `useStandardizationHistory` hooks, `EditDefinitionDialog`, `AffectedKpisTable`, and `HistoryUndoTab` (7th tab on /admin/kpi-standardization). Build Registry now supports inline canonical editing and per-variant KPI drill-in.
- **v2.66.7.25 (2026-05-02):** §88I clause 9 added. Fixed `scan_kpi_duplicate_groups` row-inflation bug; added `src/lib/scanGroupsDedup.ts` defensive helper + `scanGroupsDedup.test.ts`.
- **v2.66.7.26 (2026-05-02):** §88I clauses 10 + 11 added. Scanner now filters out alias-linked variants automatically (approved groups no longer reappear on Re-scan). New `kpi_scanner_skips` table + admin RLS; new "Don't merge" / "Restore" actions in Build Registry; new `useScannerSkips` hook with full undo via existing History tab; `skip_group` / `unskip_group` action types added to `reverse_standardization_action`.
- **v2.66.7.27 (2026-05-02):** §88I clause 12 added. KPI History card and KPI Tracker Sheet are now canonical-aware — they aggregate alias-renamed monthly rows alongside the canonical row. New `src/lib/canonicalRelatedKpis.ts` helper (+ tests) consolidates the resolver + matcher + period-dedup logic so future surfaces stay consistent.
- **v2.66.7.28 (2026-05-02):** §88I clause 13 added. Duplicate scanner is now fuzzy-aware (`pg_trgm` similarity + tunable threshold + Exact/Fuzzy badges). Fixes the case where same-KPI/single-KRA leftovers and near-identical names like "PM10" vs "PM10/AQI" never grouped under the legacy strict-equality rule. New `gin_trgm_ops` index on `LOWER(TRIM(kpi_name))`; `BuildRegistryTab` adds a Match Sensitivity selector and per-variant match badges; `dedupeScannerGroups` preserves `match_type` / `similarity`.
- **v2.66.7.30 (2026-05-02):** §88I clauses 15 + 16 added — Phase 5c. RCA on "KPI Standardization edits don't reflect on the user dashboard": (a) `useEditDefinition` now ALWAYS propagates canonical text to May-2026+ linked rows (`EditDefinitionDialog` radio removed); (b) `KpiHeaderSection` prefers canonical pair over literal row text via `useCanonicalVariantPairs`; (c) one-shot SQL migration retroactively links 508 unlinked May-2026+ rows to existing canonical definitions; (d) `kpi_standardization_actions_action_type_check` extended to allow `backfill_definition_links`, `skip_group`, and `unskip_group`.

---

## §120 — Lean-Load Policy (Performance & Resource Efficiency)

Codified 2026-05-04 after the workspace-wide "Lean-Load" performance audit.

1. **Pagination/lean-projection is the default.** New list/grid/report queries MUST paginate via `.range()` with `count: 'exact'` and select an explicit column list. Bulk reads hardcoded to fetch everything are forbidden unless they are (a) admin config tables ≤200 rows, or (b) registered full-org sites under §94 (`profiles-query-policy`, `fetchAllPaged`).

2. **Intentional full-org reads are documented.** The 25 sanctioned `fetchAllPaged` sites (employee pickers, KPI Mapping Matrix, scoring engines) MUST stay registered in `mem/architecture/profiles-query-policy`. Adding a new full-org site requires a brief justification in that memory.

3. **`useAllKpis` projection is slim.** The shared hook MUST select only the column set defined by `SLIM_KPI_SELECT` in `src/hooks/useKpis.ts`. Heavy text columns (`evidence_url`, `remarks`, long descriptions) are fetched only on row open.

4. **Search/filter inputs MUST be debounced.** Any text input that drives an in-memory `.filter()` over more than ~200 rows or triggers a network call MUST wrap its value in `useDebouncedValue(value, 300)` (`src/hooks/useDebouncedValue.ts`) before feeding `useMemo` deps or query keys. Categorical filters (role, status, dept) are exempt.

5. **Skeletons stay scoped.** `Skeleton` (`src/components/ui/skeleton.tsx`) is the canonical loading placeholder for **page-level** and **list/grid** loads. `Loader2` remains correct inside buttons/inline mutation states — do not blanket-replace.

6. **No blanket `select('*')` rewrite.** `select('*', { count: 'exact', head: true })` is a count-only call (zero rows returned) and is **not** a violation. Removal of true `select('*')` row reads is allowed only when it does not break `src/integrations/supabase/types.ts` inference for the consuming code.

### Compliant sites (extend when adding new ones)
- Debounced inputs: `src/pages/admin/UserManagement.tsx` (search), `src/hooks/useReviewPageState.ts` (search), `src/components/admin/OrgKpiEntryCard.tsx`, `src/hooks/useMentionSearch.ts`, `src/pages/admin/KpiWeightageDashboard.tsx`, `src/hooks/useSafetyRealtimeSync.ts`.
- Slim projection: `useAllKpis` / `useKpisByPeriod` via `SLIM_KPI_SELECT`.
- Regression tests: `src/test/useDebouncedValue.test.tsx` (5 tests).


## §111 — Org KPI propagation source of truth (codified 2026-05-08)

The system stores Org-level KPI data across three places:

- `org_kpi_values` — the data-owner's entered value (source data, not proof of scorecard population).
- `kpis.status` — the workflow stage of each employee KPI row.
- `review_submissions` — the actual employee scorecard data.

**Rule:** "Propagated" means a `review_submissions` row exists with a non-NULL `achieved_value` OR `is_na = true` for the employee's KPI. It does NOT mean `org_kpi_values.status = 'propagated'`.

**Why:** The OKV status flag is set by a separate post-RPC `UPDATE` from the client. Historical propagations (and any flow that exits early after the RPC succeeds) leave OKV status at `'entered'` even though the scorecard is fully populated. Treating OKV.status as proof produces UI badges and reports that contradict the actual scorecard state.

**Enforcement:**
1. Per-row "Propagated / Not propagated" badges in `OrgKpiScopedEntryTable` MUST derive their status from scorecard presence (via `useOrgKpiSubmissionFallback`), with `OKV.status === 'approved'` as the only OKV-driven override.
2. Any propagation reconciliation tool (Pending Report, Data Repair) MUST treat OKV.status only as an indicator, and use `review_submissions` + `kpis.status != 'kra_set'` as the authoritative check.
3. The `propagate_org_kpi_value` RPC result mapper in `callPropagationRpc` MUST accept BOTH the live shape (`{ propagated, skipped, results, skipped_details }`) and the legacy shape (`{ propagated_count, skipped_count, details, skipped }`) so a future RPC redeploy cannot silently NaN the per-batch totals again.

Regression: `src/test/orgKpiPropagateResultContract.test.ts`.

## §111.1 — Org KPI propagation summary visibility (codified 2026-05-08)

The "X propagated / Y not propagated" badges in the Org KPI scoped entry table (`OrgKpiScopedEntryTable`) MUST remain visible whenever any row in the group carries an entered or propagated value, including one-sided distributions (all 50 propagated / 0 not, or 0 propagated / all 50 not). They may only be suppressed when every row is still `pending` (no value entered at all).

**Why:** Hiding the summary on one-sided distributions left admins unable to confirm whether the entire group had been propagated — exactly the scenario that triggered the 2026-05-08 RCA (50/50 entered, page silently dropped the summary).

Regression: `src/test/orgKpiRowStatusPill.test.tsx` (4 cases — mixed, all-propagated, all-entered, all-pending).

## §111.2 — Org KPI access-rule normalization (codified 2026-05-08)

Every RLS path that mediates Org KPI visibility (KPI definitions, `org_kpi_values`, `review_submissions`) MUST match `org_kpi_data_owners.kra_name` / `kpi_name` against `kpis.kra_name` / `kpi_name` using `public.normalize_kpi_text(...)`, the same normalizer the snapshot RPC (`get_org_kpi_data_entry_snapshot`) uses.

Raw text equality was the root cause of data owners (and edge cases where master KRA/KPI text drifted by punctuation/whitespace/case from the owner mapping) being able to read the KPI definition but not the corresponding `review_submissions` rows — making truly propagated rows render as "Not propagated" in the UI.

## §111.4 — Org KPI propagation must resolve targets server-side (ADR-062, codified 2026-05-08)

Org-level KPI propagation MUST resolve the set of target `kpis` rows via the SECURITY DEFINER RPC `resolve_org_kpi_target_kpis`. Client code MUST NOT use `supabase.from('kpis').select(...)` to gate the propagate write path.

**Why:** KPI rows are RLS-filtered per user. A data owner whose role/department restricts visibility of department X will silently receive zero rows for employees in X from a client SELECT, even though those employees legitimately carry that org KPI. The propagate RPC then never runs for them, no `review_submissions` row is written, and the UI correctly but permanently shows them as "Not propagated".

**Authorisation contract for the RPC:**
- `has_role(auth.uid(), 'admin')`, OR
- An `org_kpi_data_owners` row matching `(category_id, normalize_kpi_text(kra_name), normalize_kpi_text(kpi_name))` for the caller.

**Read/write parity:** Snapshot reads (`get_org_kpi_data_entry_snapshot`) and propagate writes (`resolve_org_kpi_target_kpis` → `propagate_org_kpi_value`) MUST see the same employee universe. Any future RLS change on `kpis` must preserve this parity or be paired with a server-side resolver update.

## §121 Review Journey Stage Visibility (v2.66.10.1)
Stage tiles in the Review Journey (Self / Manager / Skip-Level / HR PMS / Auditor / Management) MUST reflect the KPI's resolved per-employee workflow, never the global `DEFAULT_WORKFLOW_STAGES` fallback. Every entry point into `KpiReviewPanel` / `KpiJourneySection` is required to pass `workflowStages` from `useEmployeeWorkflowStages` (or the equivalent server resolver). The default constant is a safety net only and triggers a dev-only console warning when used. Rationale: prevents stale "N/A" tiles (e.g. Management) from appearing in mention popups and other secondary surfaces, eliminating the sync gap between Dashboard KPI Details, View KPI Details, and the @Mention sheet.

## §111.6 Org KPI Propagation Toast Classification (v2.66.10.3, codified 2026-05-11)

The per-scope Propagate loop in `OrgKpiDataEntry.executeSaveAndPropagate` MUST classify server-returned skip reasons against a single canonical set:

- **Benign** (informational, never destructive toast):
  `not_in_kra_set`, `reviewer_locked`, `no_target_rows`.
- **Hard** (destructive toast — refresh / retry):
  everything else (e.g. `race_lost_during_advance`, `kpi_not_found`).

Additionally:
1. The half-propagation forward-guard (Repair-Gap toast) MUST compare the existing `kpis` rows against a `consideredScopeIds` set that includes scopes skipped at the client-side `null` / untouched-zero guards, NOT only `propagatedScopeIds`. Otherwise client-skipped rows are misclassified as a server "missed" gap.
2. `usePropagateOrgKpiValue` MUST emit a synthetic `no_target_rows` skip when `resolve_org_kpi_target_kpis` returns 0 rows for a per-scope call. Empty results without a typed skip caused the page's `unaccounted` math to print a false "may have mismatched KPI names" toast.
3. When the unaccounted shortfall equals the count of mapped employees who are all past `kra_set`, the page MUST emit the neutral "Already propagated — N rows past data-owner stage (POLICY §88)" toast instead of the destructive name-mismatch one.

Regression: `src/test/orgKpiPropagationBenignReasons.test.ts`, `src/test/orgKpiPropagationToast.test.ts`.


## §122 — Workflow Resolution Report (single-resolver rule)

Any UI surface that displays "who reviews employee X at stage Y for period (P, Y)" MUST resolve it through `src/lib/workflowResolver.ts` (`resolveChain` + `buildResolverContext`), and template selection MUST come from the DB function `get_employee_workflow_info`. No surface may re-implement the manager / skip-level / HR-PMS / Auditor / Management chain inline. This prevents the "two standards" drift the user has flagged on prior issues.

The Workflow Resolution Report (`/reports/workflow-resolution`) is the period-aware surface; the existing Workflow Configuration export ("All Employees (Resolved)" sheet) is the global-only surface. Both call the same resolver.

N/A reasons are an enum (`stage_not_in_template`, `no_manager_on_profile`, `skip_level_loop`, `resolved_user_inactive`, `role_unassigned`). New reasons MUST be added to the enum + label map + unit tests in the same patch.

## §123 — Reviewer Dashboard Failure Modes
Reviewer roster queries (`useProfiles`, `useTeamMembers`, `useSkipLevelTeamMembers`, `useProfilesByWorkflowStage`, `useKpisByPeriodRanges`) MUST surface `isError` to the consuming dashboard. Reviewer dashboards (`EmployeeSelectorGrid` and any successor) MUST render a distinct error state with a Retry CTA when any of these queries fails — they MUST NOT render the generic "No employees found" empty state on query failure, because admin viewers (e.g. employee 101784) are most exposed to org-wide statement timeouts and cannot otherwise distinguish a load failure from an empty roster.

## §124 — Reporting RPC Return-Type Contract
Backend reporting RPCs that surface `kpis`, `review_submissions`, or any table with enum / `varchar` columns MUST cast every such column to its declared `RETURNS TABLE` type (`::text` for enums and varchars, `::numeric` where appropriate). PostgREST returns HTTP 400 `structure of query does not match function result type` on the first mismatch, which collapses the entire reviewer dashboard to zero counters with no user-visible error. New or edited RPCs of this kind MUST be regression-tested against the actual column types — not just the declared signature — before shipping.

## §125 — Reporting RPC Row-Cap Bypass via Chunked Pagination (v2.66.11.5)
SECURITY DEFINER reporting RPCs that can return more than 1,000 rows (e.g. `get_reviewer_roster_slim`, `get_reviewer_kpis_for_period`, `get_reviewer_submission_scores_for_period`, or any future org-scope helper) MUST be fetched via the shared `fetchAllRpcPaged` helper in `src/lib/fetchAll.ts`, which pages the RPC in 1,000-row chunks until exhausted.

**Why a single `.range(0, 49999)` is NOT sufficient:** PostgREST on Lovable Cloud enforces a hard server-side `db-max-rows = 1000` cap on RPC responses. Even when the client sends `Range: 0-49999`, the server returns HTTP 206 with `Content-Range: 0-999/<total>` and only 1,000 rows. This was verified with a direct curl as Vivek (101784) against `get_reviewer_roster_slim`: response `Content-Range: 0-999/2532`, exactly 1,000 rows in the body. The earlier v2.66.11.4 fix that added `.range(0, 49999)` therefore did NOT solve the truncation — the dashboard still showed `Total Employees = 1000`.

**Required pattern:**
```ts
const rows = await fetchAllRpcPaged<MyType>((from, to) =>
  supabase.rpc('my_reporting_rpc', params).range(from, to),
);
```

Direct `.rpc(...).range(0, N)` for these large-result RPCs is a regression and is blocked by the BUG-049 test suite.

**§125.1 — Bulk-resolution React hooks (v2.66.11.18).** The same 1,000-row cap applies to React Query hooks that call `supabase.rpc(...)` with a large input array. Any hook that resolves per-employee or per-id data for a roster whose size can exceed ~500 MUST chunk the input ids client-side (default chunk size = 500) and merge results, OR use `fetchAllRpcPaged` when the RPC is range-pageable. Concrete hooks under this rule: `useBulkEmployeeWorkflows` (`src/hooks/useWorkflowConfig.ts`) — chunks `employee_ids` into 500-id batches and calls the RPC in parallel via `Promise.all` with one retry per chunk on failure. Violations silently exclude every employee past the cut-off from reviewer-stage filters and bottleneck aggregations, even though tile counters (which use score-signature paths) appear correct. Regression: `src/test/bulkEmployeeWorkflowsPagination.test.ts` + `src/test/hrPmsRosterCompleteness.test.ts`.

## §126 — Team Reviews Tile Aggregation for Full-Access Roles (v2.66.11.6)
On the merged Team Reviews dashboard (`/dashboard?view=team`), the Direct Pending / Skip-Level Pending / Reviewed tiles MUST be computed from each KPI's resolved per-employee workflow position when the viewer is a full-access role (`admin`, `auditor`, `management`, `hr_pms`).

**Why:** Full-access roles have no direct or skip-level reports; their `teamMembers` and `skipLevelMembers` rosters are empty. The legacy membership-based classifier (`directIds.has(employee_id)` / `skipIds.has(employee_id)`) silently fell through for every KPI and produced **0 / 0 / 0** tiles even when hundreds of pending and reviewed KPIs were visible on the per-employee cards below.

**Required mapping (full-access only):**
- `status === 'self_review'` → **Direct Pending**.
- `status ∈ resolveReviewableStatuses('skip_level', stages)` → **Skip-Level Pending**.
- Any status not in `{'kra_set', 'self_review'}` and not skip-pending → **Reviewed**.

Manager/non-full-access flows continue to use the direct/skip membership classifier unchanged. Implementation: `src/components/review/EmployeeSelectorGrid.tsx` `stats` `useMemo`, `viewLevel === 'team'` branch.

## §127 — Team Reviews Tile Composition (v2.66.11.7)
The Team Reviews header on `/dashboard?view=team` MUST show the following six tiles, in this order, so the visible numbers fully account for the `Total KPIs` denominator and surface the missing "KRA Set / awaiting self-review" bucket:

1. **Total Employees** — `demographicFilteredMembers.length`.
2. **KRA Set** — KPIs with `status === 'kra_set'` (KRA assigned, employee hasn't submitted self-review yet). Counted for full-access viewers across the visible roster, and for managers across their direct reports.
3. **Direct Pending** — KPIs with `status === 'self_review'` (awaiting manager review).
4. **Skip-Level Pending** — KPIs whose status is in `resolveReviewableStatuses('skip_level', stages)` for the employee's resolved workflow.
5. **Reviewed (ratio)** — `value = reviewed`, `denominator = totalKpis`. Renders as `Reviewed / Total` with a progress bar and `% — of total KPIs` subtitle. "Reviewed" means status moved past `kra_set`/`self_review`.
6. **Org KPIs** — `value = entered + propagated`, `denominator = total org_kpi_values for period`, sub-line shows `pending` count. Full-access viewers ONLY (managers don't see this tile). Source: `useOrgKpiPeriodCounts(period, year, enabled)` — single paged read on `org_kpi_values`, React Query cache `staleTime: 60_000`, gated by `isFullAccess && viewLevel === 'team'` so it never fires for managers.

Sum invariant: `KRA Set + Direct Pending + Skip-Level Pending + Reviewed === Total KPIs` (within a 1-row tolerance for in-flight transitions). The Reviewed tile is the visible expression of this invariant via its denominator.

The standalone "Total KPIs" tile is REMOVED — its number now lives as the denominator of the Reviewed tile to keep the row at six tiles. Implementation: `src/components/review/EmployeeSelectorGrid.tsx` `renderStatsCards()` team branch + `StatCard.denominator` prop. Tile grid uses `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`. Regression: `src/test/teamReviewsFullAccessTiles.test.ts` (sum invariant + `kraSetPending` case).

## §127.1 — Reviewer-Stage Tile Parity (v2.66.11.8)
The 6-tile composition rule of §127 extends to all reviewer-stage dashboards. **HR PMS Review**, **Manager Review** (`pending_manager_review`), and **Skip Mgr Review** (`pending_skip_review`) MUST present six tiles using the same `grid-cols-2 md:grid-cols-3 xl:grid-cols-6` layout, in this order:

1. **Total Employees** — roster size after filters.
2. **Pending Review** — KPIs queued for the stage (status = the stage immediately before this reviewer's stage).
3. **In Review** — KPIs with `status` equal to this reviewer's active stage.
4. **Reviewed (ratio)** — KPIs that have moved past this stage. Rendered as `value / totalKpis` with progress bar.
5. **Total KPIs** — period total for the visible roster.
6. **Org KPIs** — same definition and gating as §127 #6 (full-access viewers only, sourced from `useOrgKpiPeriodCounts`).

Per-view stage mapping:
- **HR PMS** — Pending = before `hr_pms_review`; In Review = `hr_pms_review`; Reviewed = `hr_pms_score` recorded.
- **Manager Review** — Pending = `self_review`; In Review = `manager_check`; Reviewed = past `manager_check`.
- **Skip Mgr Review** — Pending = `manager_check`; In Review = `skip_level_check`; Reviewed = past `skip_level_check`.

Sum invariant: `Pending + In Review + Reviewed = Total KPIs` (excluding pre-stage rows: `kra_set`, and for skip view also `self_review`). Audit and Management views are intentionally out of scope until a follow-up; their existing 5-tile layouts remain unchanged.

Regression: `src/test/teamReviewsFullAccessTiles.test.ts` includes sum-invariant assertions for Manager and Skip Mgr stages.

---

## §128 — Frequency-Lock Determination Must Honor Per-KPI Cycle Override (v2.66.11.9)

Any code path that calls `isKpiLockedForPeriod(frequency, month, year, ...)` for a specific KPI MUST pass that KPI's `frequency_cycle_start` as the 4th argument. The corresponding Supabase SELECT MUST include the `frequency_cycle_start` column.

**Rationale.** Sajid Raza (100264) showed 114/257.5 = 44.27% in the Mar-2026 Employee Performance Summary instead of the correct 314/492.5 = 63.76%. All 6 of his Bi-Monthly KPIs use the offset cycle `Feb-Mar` (active month = March). The report omitted the override; `resolveEffectiveCycleOption` fell back to the default `Jan-Feb` cycle (which locks March), so 47 of 98.5 weight points were silently dropped from both the numerator and the denominator.

**Affected reports patched (v2.66.11.9):** `EmployeePerformanceSummary.tsx`, `KpiDetailReport.tsx`, `KpiStatusTracker.tsx`.

**Exempt call sites** (frequency-family checks, no specific KPI in hand) MUST add an inline comment justifying the omission. Audit with `rg "isKpiLockedForPeriod\("`; every match against a KPI row must pass argument 4.

**Regression guard:** `src/test/reportFrequencyCycleOverride.test.ts` (5 tests covering Bi-Monthly Feb-Mar, Quarterly Apr-Jun, Half-Yearly Apr-Sep, Yearly Apr-Mar, plus default-fallback baseline).

**CI guard (v2.66.11.10):** `src/test/frequencyLockCallSitesAudit.test.ts` greps the entire `src/` tree for `isKpiLockedForPeriod(` and asserts every non-whitelisted call passes ≥ 4 top-level arguments. Whitelist is limited to the helper's own unit tests where the 3-arg form is the test's purpose.

**Runtime guard (v2.66.11.10):** `isKpiLockedForPeriod` emits a dev-only `console.warn` when `frequencyCycleStart === undefined` and the frequency is multi-month (Bi-Monthly / Quarterly / Half-Yearly / Yearly). Suppressed in production builds via `import.meta.env.DEV`.

**Audit attestation:**
| Date | Production call sites | Violations |
|------|----------------------|-----------|
| 2026-05-12 | 10 | 0 |

---

## §129 — Team Reviews Tile Parity (v2.66.11.11)

All reviewer roles (Admin, HR PMS, Management, Auditor, Manager, Skip-Level Manager) see the **same 6 tiles** on the Team Reviews dashboard: Total Employees · KRA Set · Direct Pending · Skip-Level Pending · Reviewed · Org KPIs.

- Tile **layout** is role-independent. Tile **counts** remain role-scoped: managers count their direct/indirect roster only; full-access roles count org-wide. This is by design and unchanged from v2.66.11.8.
- The **Org KPIs** tile is informational and shows period-wide entered/propagated/total counts to every role. No additional RLS exposure — counts come from `org_kpi_values.status` only.
- Tile #1 label is always **"Total Employees"** (previously read "Team Size" for non-full-access roles).
- When a Manager / Skip-Level user lands on Team Reviews and `Total Employees === 0`, a **diagnostic banner** (`TeamReviewsZeroDiagnostic`) explains the cause:
  - `no_reports_mapped` — empty roster → fix in User Management
  - `reports_without_kpis` — roster exists but no KPIs assigned for the period → check KRA Issuance
  - `kpis_filtered_out` — KPIs exist but filters or stage hide them
- Pure helper `diagnoseEmptyTeam` is unit-tested in `src/test/teamReviewsZeroDiagnostic.test.ts` (5 tests).

---

## §130 — KRA Issuance Cache Invalidation & Manager Gap Surfacing (v2.66.11.12)

**Cache invalidation contract.** Any code path that creates `kpis` rows for one or more employees MUST invalidate the React Query key `['kpis-by-period-ranges']` so reviewer dashboards (Team Reviews, HR PMS, Manager / Skip-Level Pending) reflect the new KPIs immediately rather than after the 5-minute staleTime elapses.

Patched call sites (v2.66.11.12): `CopyKrasDialog`, `BulkTemplateAssignDialog`. Future KRA-issuing flows (Smart KRA Assign, Template Bundles, Admin KPI Editor bulk-create, edge functions that write to `kpis` followed by a client refresh) MUST follow the same pattern.

**Manager gap visibility.** `KRAIssuance` report renders a **"Managers Without KRAs"** panel listing every active manager (≥ 5 direct + indirect reports) whose entire reporting line has zero KPI rows for the selected period. The panel surfaces the same population that `TeamReviewsZeroDiagnostic` flags individually, but consolidated for HR PMS / Admin so issuance gaps don't depend on individual managers raising tickets.

**Scope rule.** Department, designation, or grade changes never affect manager visibility — reviewer scope is computed strictly from `reporting_manager_id` chains in `get_reviewer_roster_slim` / `get_reviewer_kpis_for_period`. RCA closed: Sajid Raza (100264) zero-KPI banner was a false negative caused by a transient RPC failure, not by his department change.

**Regression:** `src/test/managersWithoutKras.test.ts` (4 tests covering the gap predicate, indirect-hop counting, and `minReports` threshold).

---

## §131 — Reviewer SECURITY DEFINER RPC Hygiene & Hidden URL Filter Gating (v2.66.11.13)

**RCA — Sajid Raza, true root cause.** The Apr/May 2026 zero-KPI Team Reviews banner was **not** a transient failure as previously logged in §130. Both `get_reviewer_kpis_for_period(text,integer)` and `get_reviewer_roster_slim()` raised `42702 column reference "id" is ambiguous` **only inside the non-full-access (manager / skip-level) branch**, because the CTEs `directs / indirects / mine / visible` exposed an unqualified `id` column that collided with the function's `RETURNS TABLE (id uuid, …)` output column. Admin / HR PMS / Auditor / Management took the `v_is_full = true` branch and were unaffected, which is why Admin View showed 13 employees with KPIs while Sajid's Manager View showed 0. **Affected population:** every non-full reviewer with a mapped roster — current snapshot = **105 reviewers covering 2,473 direct + 2,226 indirect reports**.

**RPC contract.** Every SECURITY DEFINER reviewer helper that returns a `RETURNS TABLE (id uuid, …)` MUST qualify CTE output columns (e.g. `SELECT p.id AS profile_id`) and reference them as `cte.profile_id`. Bare `id` inside CTEs is forbidden because PL/pgSQL can ambiguate against the result column.

**Hidden URL filter gating.** The Team Reviews `?mgr=<uuid>` URL parameter is an **admin / full-access affordance only** (only the Manager combobox in `EmployeeFilters` is rendered when `showManagerFilter` is true, which itself is gated by `isFullAccess`). `EmployeeSelectorGrid.demographicFilteredMembers` MUST therefore apply `selectedManager` only when `isFullAccess === true`, otherwise a stale `mgr` param from a prior admin session silently narrows a manager's roster to a single direct line.

**Auth-ready cache eviction.** `AuthContext` MUST invalidate the manager dashboard caches once the auth bootstrap completes for the first time, including `['kpis-by-period-ranges']`, `['profiles']`, `['profiles-by-workflow-stage']`, `['team-members']`, and `['skip-level-team-members']`. Without this, RPCs that race the bootstrap return zero rows under `auth.uid() IS NULL` and stay cached.

**Diagnostic precedence.** `TeamReviewsZeroDiagnostic.diagnoseEmptyTeam` evaluates `dataLoadError` BEFORE the `no_reports_mapped / reports_without_kpis / kpis_filtered_out` branches, so an upstream RPC or network error never masquerades as "No KPIs assigned".

**Regression:** `src/test/teamReviewsZeroDiagnostic.test.ts` adds a `data_load_error` case; `src/test/managerScopeFilterGate.test.ts` (3 tests) protects the `isFullAccess` gate on the `mgr` filter.

---

## §132 — Audit Assignment Carry-Forward on KRA Rollover (v2.66.11.19)

**Context.** `audit_kpi_level_assignments` is the per-KPI auditor mapping table (`UNIQUE(kpi_id)`, `FK → kpis ON DELETE CASCADE`). Historically the `auto-rollover-kpis` edge function cloned KPIs across periods but did NOT clone these mappings, leaving every new period with zero auditor assignments until Admin re-mapped them manually. Confirmed for April 2026: 2,267 KPIs / 0 assignments.

**Policy.**

1. `auto-rollover-kpis` MUST accept an opt-in boolean `carry_audit_assignments`. When true, after KPI insertion the function clones every `audit_kpi_level_assignments` row from each rolled-over source KPI onto the matching target KPI.
2. Matching key is the **full signature** `(employee_id | review_year | review_period | kra_name | kpi_name)` resolved at insert time and stored in an in-memory map keyed by the target signature → source `kpi_id`. Partial matches are forbidden — a brand-new KPI in the target period inherits nothing.
3. The insert MUST use `onConflict: 'kpi_id', ignoreDuplicates: true` so any pre-existing manual auditor assignment on the target KPI is preserved. The function MUST NEVER overwrite or delete an existing assignment row.
4. The action MUST emit a single `system_audit_logs` row with `action='AUDIT_ASSIGNMENTS_CARRIED_FORWARD'`, `performed_by=NULL` (per Core "automated actions set performed_by=NULL"), and metadata `{ source_period, source_year, target_period, target_year, triggered_by, source_assignments_found, target_kpis_matched, cloned, skipped_already_assigned, errors }`.
5. The response payload MUST expose `audit_assignments_cloned`, `audit_assignments_skipped_already_assigned`, and `audit_clone_errors: string[]` so the admin UI can surface results.
6. The admin UI (`RolloverDialog`) MUST present this as a clearly labelled toggle (default ON) at the Configuration step, with an Alert on the Results step reporting the cloned and preserved counts. The toggle is sent on the **execute** call only, never on the dry-run preview.

**Regression:** `src/test/carryAuditAssignmentsRollover.test.ts` (5 tests — happy-path clone, UNIQUE-kpi_id preservation, source-without-assignment, full-signature collision safety, orphan-target skip).

### §115 Extension — Stuck-Stage Drain Authority (v2.66.11.17)

After period lock, Admin / Data Owner MAY drain stuck KPIs from ANY pre-terminal stage (whitelist: `kra_set`, `self_review`, `manager_check`, `skip_level_check`, `hr_pms_review`, `audit`, `management_review`). All affected KPIs receive 0 across the cascade, status advances to `approved`, and a `kpi_audit_logs` row is written with `metadata.stuck_at_stage = <originating_status>` so HR / Auditor can trace why the human reviewer was bypassed. The UI MUST display an explicit reviewer-bypass warning when the operator opts into any of the 5 reviewer stages. Default behaviour (kra_set + self_review only) is preserved. Regression: `src/test/bulkZeroStageDrain.test.ts`.

### §115 Tile↔List Parity Invariant (v2.66.11.17)

For every reviewer-stage "Reviewed" tile on the HR PMS / Audit / Management dashboards, `tile.stat3` MUST equal Σ visible `badge3` over the employees surfaced when `statusFilter='reviewed'`. Regression: `src/test/hrPmsReviewedTileVsList.test.ts`.

### §132.1 Auditor Mapping Backfill (v2.66.11.20)

For periods that were rolled over BEFORE §132 carry-forward existed, Admin MAY backfill `audit_kpi_level_assignments` via the `backfill-audit-assignments` edge function. Rules:

1. **Signature match** = `employee_id | kra_name | kpi_name`. The auditor is inherited from the source KPI in the MOST RECENT PRIOR period (across any year/month) whose source-KPI has an existing mapping.
2. **Never overwrite.** Upsert uses `onConflict: 'kpi_id', ignoreDuplicates: true`. Any manual mapping already present on the target KPI wins.
3. **Dry-run is mandatory** before Apply (UI-enforced). Dry-run returns per-period counts (`would_create / already_mapped / no_source_match / source_has_no_auditor`) without writing.
4. **Audit trail.** Every Apply writes a `system_audit_logs` row with `action='AUDIT_ASSIGNMENTS_BACKFILLED'`, `performed_by=NULL` (system performer attribution), and the full per-period summary.
5. **Admin-only** via `_shared/admin-auth.ts`.
6. **Idempotent.** Re-running the same backfill is a no-op.

Regression: `src/test/backfillAuditAssignments.test.ts` (6 tests — happy path, already-assigned preservation, walk-further-back recency, source-without-auditor, no-signature-match, signature-boundary integrity).

## §133 — Backup Coverage Is Dynamic (v2.66.11.20)

**Rule.** The `create-backup` and `restore-backup` edge functions MUST discover their table list at runtime via the `public.get_backup_table_order()` RPC. Hardcoded allowlists are forbidden.

**Mechanics.**
1. `public.get_backup_table_order()` returns every `BASE TABLE` in schema `public` in foreign-key dependency order (parents before children), excluding any row present in `public.backup_denylist`.
2. `create-backup` calls the RPC on init AND in `runScheduledChunked`. Empty result aborts the run.
3. `create-backup` enforces a coverage shrink-guard via `assertCoverageNotShrunk`: if the discovered count is less than the most recent `completed` / `completed_with_errors` `backup_logs.tables_count`, the backup aborts with an explanatory error.
4. `restore-backup` uses `fetchInsertOrder(manifestTables)` for INIT/legacy paths; tables present in the manifest but unknown to the current DB order are appended at the tail so older backups still restore.
5. Exclusions require a row in `public.backup_denylist(table_name, reason)` — admin-only RLS for writes, read-open to authenticated.

**Rationale.** Pre-§133 the backup edge function maintained a hardcoded 115-table array against a 142-table schema, silently excluding 27 tables (`access_profile_*`, `iac_*`, `kpi_definitions`, `kpi_name_aliases`, `kpi_standardization_actions`, `pms_evidence_compression_jobs`, `safety_drill_runs`, `system_audit_logs`, etc.) from every snapshot. Restores from those snapshots could not recover those tables. Dynamic discovery removes the maintenance burden and guarantees forward coverage as new tables are added.

**Recovery for pre-§133 data loss.** Tables that were excluded prior to v2.66.11.20 must be recovered from Lovable Cloud platform PITR snapshots (separate from app-level backups). The cutover timestamp is the most recent app-level restore that wiped them.

**Forbidden.**
- Reintroducing a hardcoded `TABLES_TO_BACKUP` / `INSERT_ORDER` / `DELETE_ORDER` array as the source of truth.
- Skipping `assertCoverageNotShrunk`.
- Excluding a table by quietly removing it from any list — exclusions go in `backup_denylist` with a written `reason`.

Regression: future tests in `src/test/safety/backup-coverage.test.ts` assert that `get_backup_table_order()` returns the union of all `public` base tables minus the denylist.

---

## §134 — Employee Performance Summary Data Loading Contract (v2.66.11.21)

The Employee Performance Summary report (`/reports/employee-summary`) is RLS-gated and roster-dependent. Its React Query reads MUST wait for `useAuth().isReady && !!user`, include `user?.id` in the query key, and be invalidated by `AuthContext` after first auth bootstrap.

Any `profiles` list used to build the report's employee lookup MUST use `fetchAllPaged()` with stable ordering and `.range(from, to)`. Single-shot `profiles` SELECTs are forbidden because PostgREST caps unranged reads at 1,000 rows; with the current active roster this silently removes KPI owners from the map and can render a valid admin/manager report as “No data found”.

KPI batch reads in this report MUST also use deterministic ordering before pagination.

RCA snapshot (2026-05-23): Mar-2026 backend data existed (1,756 KPI rows / 107 employees). Jitendra Bharti (101715) had 85 Mar-2026 KPI rows across 7 active direct reports and explicit `employee-summary` view/download override, but the UI could show 0 because the profile lookup was capped before grouping.

Regression: `src/test/bugBountyFixes.test.ts` asserts auth gating, per-user cache keys, paged profile fetching, and auth-bootstrap cache eviction for Employee Performance Summary.


## §134-A — Admin All KRAs Period Read Contract (v2.66.12.2)

The Admin → All KRAs (`src/pages/admin/AllKpis.tsx`) dashboard MUST fetch month-scoped KPI data through the `get_reviewer_kpis_for_period` SECURITY DEFINER RPC, paged via `fetchAllRpcPaged`. Direct PostgREST `from('kpis').select(...).eq('review_period', ...)` scans for a full month are prohibited because per-row RLS on `kpis` (≥18 policies, including expensive `get_skip_level_manager()` and `has_report_access_override()` subqueries) intermittently exceeded statement timeout and returned empty results for admins — leaving the dashboard blank despite 2,000+ KPI rows existing.

In addition, `hydrateKpiRelations` (relation backfill for `kpi.profiles` and `kpi.kra_categories`) MUST chunk `.in('id', ids)` lookups at ≤500 IDs per request. Single `.in()` calls over large ID lists silently truncate at the PostgREST 1000-row cap and drop profile hydration, which causes downstream employee grouping to skip valid KPI rows.

Year-wide ("All Periods") and non-monthly-frequency cycle paths (Quarterly / Half-Yearly / Yearly / Bi-Monthly / Custom) may continue to use direct year-scoped `kpis` reads, as they are gated by `selectedPeriod === 'all'` or `frequency in (...)` and are not in the hot Admin All KRAs default path.

RCA snapshot (2026-05-23): April 2026 had 2,267 KPI rows / 149 employees and May 2026 had 2,168 / 142, yet Admin (Jaspal) saw 0 in the dashboard. Routing through the RPC + chunked hydration restored visibility without any RLS, schema, or scoring change.

## §126 Review Timeline Cascading-Row Grouping (codified 2026-05-25)

The Review Timeline reads from `public.kpi_audit_logs`. A single human action in a write RPC commonly produces multiple audit rows in the same DB transaction because the following side-effects each insert their own row:

- `safety_net_trigger` → `SUBMISSION_SCORE_CHANGED` (fires whenever any `*_score` column on `review_submissions` is written; may fire twice in one TX — once for the stage score and again when `final_score` is stamped).
- `log_kpi_status_transition` → `STATUS_TRANSITION` (fires whenever `kpis.status` changes).
- `reconcile_workflow_statuses` → `RECONCILE_STATUS` (the tool itself audits its own correction).

These rows are CORRECT and MUST NOT be removed at the DB layer — they are the immutable trail that lets us answer "exactly what changed in this transaction?". However, the UI MUST collapse them under the originating human action so reviewers do not see "4 separate admin entries" for what was one click.

**Implementation contract:**

1. Any UI consumer of `kpi_audit_logs` that renders a per-row card list MUST first pass the rows through `groupTimelineEvents(...)` from `src/lib/timelineGrouping.ts`.
2. Bucketing key is `(performed_by, created_at truncated to second)` — same transaction.
3. Parent priority: explicit human action (`ADMIN_*`, `BULK_*`, `MANAGER_*`, `AUDITOR_*`, `MANAGEMENT_*`, `HR_PMS_*`, `SELF_REVIEW_*`, `STATUS_CHANGED`, etc.) → `RECONCILE_STATUS` (orphan reconcile) → first row in bucket (safe fallback that never hides data).
4. Cascade rows MUST remain accessible behind a visible "Show system events (N)" expander on the parent card. They are NOT to be hidden outright.
5. New audit `action` values that are pure trigger side-effects MUST be added to the `isSideEffect()` predicate in `src/lib/timelineGrouping.ts` and covered by a test in `src/lib/timelineGrouping.test.ts`.

RCA anchor (2026-05-25): single Bulk HR PMS sign-off on Aakash Kumar Roy / April 2026 / Billing Communication produced 5 rows at the same timestamp (`BULK_STAGE_SIGNOFF_HR_PMS` + 2× `SUBMISSION_SCORE_CHANGED` from `safety_net_trigger` + `STATUS_TRANSITION` + `RECONCILE_STATUS`), rendered as 5 cards. Grouping reduced it to 1 card with a 4-child cascade — visually one event, audit trail intact.
