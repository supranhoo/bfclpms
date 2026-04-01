# PMS — Business Policy Document

> **Last Updated:** 2026-03-31  
> **Version:** 1.52.0 — §45: Frequency-aware KRA rollover resolves terminal months
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
- Zero/NULL scores **included** in both (penalizes unscored KPIs)

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

- **All public tables** (~50) must be included in backup/restore functions
- Any new table migration must update backup functions in the same change

### 16.2 Backup Types

| Type | Trigger | Retention |
|------|---------|-----------|
| Manual | Admin clicks "Backup Now" | Indefinite |
| Scheduled | pg_cron (Daily/Weekly/Monthly) | Indefinite |
| Uploaded | Admin uploads external backup file | Indefinite |

### 16.3 Restore Policy

- Double-confirmation required for any restore
- Warnings displayed if FK constraint issues occur
- `auth.users` excluded (managed by auth system)

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

---

## §31. Sent-Back Indicator Detection Invariant

**Rule:** The sent-back indicator on the Org KPI scoped table must detect sent-back state by:
1. Finding employee KPIs at `kra_set` status (haven't re-progressed)
2. Cross-referencing with `kpi_queries` records of type `send_back` (any status — not just `'open'`)

**Rationale:** Send-back query records are auto-resolved when KPI status changes, so filtering by `status = 'open'` always returns empty results. The correct signal is: KPI is still at `kra_set` AND has a historical send-back query.

**Invariant:** The sent-back detection must never rely solely on `kpi_queries.status = 'open'`. It must check the KPI's current workflow status.

---

## §32. Review Journey Previous Month Comparison Invariant

**Rule:** The Review Journey must show up to 2 previous months of the same KPI for trend comparison. The displayed data must:
1. Come from live database queries (same `kpis` + `review_submissions` tables as current month)
2. Use a short staleTime (≤2 minutes) to ensure real-time linkage with the dashboard
3. Resolve each previous month's workflow independently via `get_bulk_employee_workflows` RPC
4. Match KPIs by `employee_id + kpi_name + kra_name + category_id` (not by KPI ID)

**Rationale:** Reviewers need to compare current performance against recent history without switching between dashboards. The data must be live-linked to prevent stale comparisons.

**Invariant:** Previous month tiles must never show cached or snapshot data — they must always reflect the current state of the corresponding KPI in the database.

---

## §33. Rollback Cascade-Clear Invariant

**Rule:** When a KPI is rolled back (via rollback request approval or admin step-back), ALL review fields for the **target stage AND all subsequent stages** must be cleared. This includes: score, rating, remarks, evidence_url, and achieved_value for each stage, plus final_score and final_rating.

**Rationale:** If only stages after the target are cleared but the target stage's own data is preserved, stale scores from the previous approval cycle remain visible, creating a false impression that the stage has already been re-reviewed.

**Invariant:** The cascade-clear condition must use `>=` (not `>`) for stage index comparison, ensuring the target stage itself is included in the clear set.

---

## §34. Admin Edit Final Score Recomputation Invariant

**Rule:** When an admin edits any score field on an already-approved KPI, the system must recompute `final_score` using the authoritative 8-stage fallback chain (management → auditor → HR PMS → skip-level → manager → self) and patch the result if it differs from the current `final_score`. This recomputation is **independent of the `advance_status` toggle** — that toggle controls workflow progression only, not score integrity.

**Rationale:** The normal approval flow sets `final_score` during status advancement. Since already-approved KPIs skip status advancement, the `final_score` would remain stale after admin edits without explicit recomputation. The `advance_status` flag must never gate this recomputation.

**Invariant:** Post-upsert recomputation must always execute when `currentKpiStatus === 'approved'`, regardless of which role-level score was edited and regardless of the `advance_status` toggle state.

---

## §35. Admin N/A Toggle Role-Scoped Clearing Invariant

**Rule:** When an admin marks a KPI as N/A via the Admin Data Entry dialog, the system must only clear scoring fields (achieved_value, rating, score, remarks) for the **currently selected role level** and the `final_score`/`final_rating`. Scores for other review levels (self, manager, skip-level, HR PMS, auditor, management) must remain untouched.

**Rationale:** The `is_na` flag is a KPI-level applicability marker. However, clearing scores across all levels when any single level is marked N/A causes data loss for already-completed reviews. The admin dialog must only send the `is_na` flag when it has been explicitly toggled (changed from its original state), preventing accidental re-clears on subsequent edits.

**Invariant:** The N/A clearing block in `useAdminDataEntry.ts` must never reference scoring fields for roles other than the active `role_level` parameter. The `AdminDataEntryDialog` must track the original `is_na` state and only include `is_na` in the mutation payload when the value differs from the original.

---

## §36. Slab Categories Zero-Hardcoding Invariant

**Rule:** Incentive slab categories (e.g., PMS Score, Production, Availability, Maintenance, Metal Recovery) must be stored in the `incentive_slab_categories` master-data table and never hardcoded in UI components or hooks. Admins can add/remove categories via the `SlabCategorySelector` inline input.

**Rationale:** Hardcoded category lists require code deployments to change and risk drift between environments. The DB-driven approach allows admins to extend categories (e.g., "Safety Score", "Quality") without developer intervention.

**Invariant:** No component or hook may define a static array of slab category values. All slab category lists must be sourced from the `incentive_slab_categories` table via the `useIncentiveSlabCategories` hook.

---

## §37. Employee Mapping — Resolved List Invariant

**Rule:** The incentive program employee mapping UI must display a unified, sortable table of all active employees with their organizational attributes (name, code, designation, department, BU, division, level, PMS grade). The UI must NOT use abstract entity pickers (e.g., separate tabs for divisions, departments, grades) as the primary mapping interface.

**Rationale:** Abstract entity pickers obscure which individual employees are actually enrolled. A resolved employee list gives admins immediate visibility into who is mapped, supports multi-select with filters, and prevents accidental over-enrollment.

**Invariant:** `ProgramEmployeeMapping` must always render a flat employee table with checkboxes. Bulk operations (select-all-filtered, clear-all-filtered) must use the `useBulkAddProgramMappings` / `useBulkRemoveProgramMappings` hooks for performance.

---

## §38. Dashboard Observation Visibility Invariant

**Rule:** Every dashboard KPI row (desktop table and mobile card) must display the observation count when observations exist for that KPI. The indicator must be a compact, non-cluttered Eye icon with count in amber, rendered after the query badge.

**Rationale:** Observations represent critical feedback (positive, concern, neutral) from managers, auditors, and management. Hiding them inside the review panel reduces visibility and delays action. Surface-level indicators ensure all stakeholders see observation activity at a glance.

**Invariant:** `KpiDetailsTable` must accept an `observationCounts` prop and render an Eye+count indicator for KPIs with observations > 0. All scorecard containers must fetch observations via `useObservationsByKpis` and pass the derived counts.

---

## §39. Notification KPI Name Truncation Invariant

**Rule:** All notification messages (in-app and email) must use the first line of the KPI name only, truncated to a maximum of 100 characters. The full KPI description, formula, and scoring logic must never appear in notification text.

**Rationale:** KPI names in the database often contain multi-line text with description, formula, and scoring logic appended. Including this in notifications makes them unreadable and clutters both the notification panel and email inbox.

**Invariant:** When creating notification records in client code (`useKpis.ts`, `useQueryWorkflow.ts`, etc.), always apply `.split('\n')[0].substring(0, 100)` to `kpi_name` before inserting. The `send_email_on_notification` DB trigger must apply `LEFT(SPLIT_PART(..., E'\n', 1), 80)` for all query and observation notification types.

---

## §40. Single-Source Query Raised Notifications

**Rule:** `query_raised` notifications must only be created by the database trigger `notify_on_query_raised()` on the `kpi_queries` table. Frontend code must NOT insert duplicate notification records for query raises.

**Rationale:** Duplicate notification paths cause inconsistent metadata keys (e.g., `reason` vs `query_reason`), leading to email templates receiving null values. A single server-side trigger ensures consistent metadata structure and prevents duplicate notifications.

**Invariant:** The `useRaiseQuery` mutation in `useKpis.ts` must NOT insert into the `notifications` table. The DB trigger uses `jsonb_build_object('query_id', NEW.id, 'query_reason', NEW.reason)` to ensure the email trigger can read `metadata->>'query_reason'` correctly.

---

### §41 — Incentive Report Export Completeness

**Rule:** All incentive report exports (Excel/XLSX) must include the full set of disqualification rule fields: `Is Disqualified`, `Disqualification Reasons`, and `LTI Penalty %`. These fields must never be omitted from the export template.

**Rationale:** Incomplete incentive reports risk payroll errors and compliance gaps. DQ data is critical for audit trails and financial reconciliation.

**Invariant:** The `IncentiveReportExport` component's Excel export must produce at least 28 columns covering Employee Info, Period, Programme, Scores, DQ Fields, Adjustments, Final, and Analytical data.

---

### §42: Dynamic Program Configuration Tabs

**Rule:** Incentive program configuration tabs must be database-driven via `incentive_program_custom_tabs`. No new hardcoded tabs shall be added to `IncentiveConfig.tsx`. All new per-employee data entry needs (vessel rates, production targets, custom metrics) must use the dynamic custom tab system.

**Core Tabs (immutable):** Mapping, Slabs, DQ Rules, Fields, BU Sub-Units, Allocation, Vessel Rates — these remain hardcoded because they have dedicated business logic components.

**Custom Tabs:** Admin-configurable via the `[+ Add Tab]` button. Each custom tab stores its field schema in JSONB (`fields` column) and per-employee data in `incentive_custom_tab_data.field_values` JSONB.

**Invariant:** The `ProgramInnerTabs` component must always render all active custom tabs from the database after the core tabs.

---

### §43 — Org KPI Audit Review Governance

**Rule:** Organization-level KPIs that include an audit stage in their workflow must be reviewable via the dedicated Org KPI Audit Review page (`/admin/org-kpi-audit-review`). This page shows only org-level KPIs whose employee instances have reached the audit-reviewable status per each employee's workflow.

**Scoring:** Auditor scores are written to `review_submissions` (same pattern as `AuditScorecard.tsx`). Approving advances the KPI status to the next workflow stage via `resolveForwardStatus('auditor', stages)`.

**Bulk approve:** A single auditor score can be applied to all pending employees under one org KPI definition. Each employee's KPI is advanced individually, respecting their specific workflow.

**Access:** Auditor and Admin roles only. Menu key: `admin-org-kpi-audit`.

### §44 — Production Daily Entry Governance

**Rule:** Programs with per-ton production rates use daily achievement grids instead of BU-based production target entry. Employees are auto-populated from programme mappings — no BU dropdown is required.

**Rate configuration:** Production rates support four assignment modes: **Employee-wise** (per individual), **Department-wise** (applies to all employees in a department), **BU-wise** (applies to all employees in a business unit), and **Common** (single rate for all mapped employees). Rates are configured in the programme's "Production Rates" tab using a radio selector and entity picker.

**Rate resolution priority:** When the daily grid renders, each employee's effective rate is resolved using a strict priority cascade: Employee > Department > BU > Common. The first matching rate wins. Only employees with a resolved rate appear in the grid.

**Daily values:** Stored as JSONB (`{"1": 10, "2": 15, ...}`) in `production_daily_entries`, keyed by program + employee + month + year. Days beyond the month's length are ignored.

**Calculation:** Incentive amount = Total daily achievement × Effective rate per ton. The grid displays a badge (emp/dept/bu/com) next to each rate to indicate its source.

**Computation pipeline:** The `compute-monthly-incentives` edge function aggregates production daily entries and resolves rates using the priority cascade. For production programs, it splits records by payment period: if daily data spans all three ranges (1-10, 11-20, 21-31), a single "Full Month" record is created; if data only covers specific ranges, separate records are created per populated range. Each period record has its own `incentive_amount` and independent `status` (draft/confirmed/paid), enabling payroll to track and confirm payments per period without duplication.

**Payment period column:** `employee_incentive_records.payment_period` stores: `'1-10'`, `'11-20'`, `'21-31'`, or `'Full Month'`. All program types now use `'Full Month'` as the standardized full-period value. Unique constraint: `(employee_id, review_period, review_year, program_id, payment_period)`.

**Recomputation cleanup:** The edge function deletes all existing records for each employee+program+month before upserting fresh results. This ensures: (a) period structure changes (full → split or vice versa) don't leave orphan records, (b) DQ status is always current after re-computation, and (c) manually overridden statuses are preserved via the pre-read at step 5 and re-applied during upsert.

**Date range filter:** UI toggle renamed from "All" to "Full Month". Totals always reflect all days regardless of visible range.

**Detection priority:** Vessel rates → Vessel grid; Production rates → Daily grid; Neither → Slab-based grid.

**Invariant:** The edge function must always aggregate `production_daily_entries` for production programs. The `incentive_amount` field must reflect `totalTons × resolvedRate`. Client-side-only calculations must never be the sole source of truth for incentive amounts.

**DQ amount visibility:** When an employee is disqualified, the `incentive_amount` retains the calculated value (what would have been earned). The `is_disqualified` flag and `disqualification_reasons` array indicate forfeiture. `final_incentive_percent` is set to 0 for slab-based programs. Payroll/finance teams MUST use `is_disqualified = true` (not `incentive_amount = 0`) to determine actual payout eligibility.

**DQ rule configuration requirement:** Every incentive program MUST have disqualification rules configured in `incentive_disqualification_rules` before computation. If no rules exist for a program, the DQ evaluation loop is a no-op and all employees pass as eligible. Standard rule set: warning, suspension, absence, LWP, LTI, contract. Admins can manage rules via the programme's "Disqualification Rules" tab in Incentive Configuration.

## §45 — Frequency-Aware KRA Rollover

**Terminal month resolution:** When KPIs are rolled over to a new period, the system resolves the target `review_period` to the correct terminal month based on the KPI's frequency. Monthly KPIs use the raw target month; multi-month frequencies (Bi-Monthly, Quarterly, Half-Yearly, Yearly) are mapped to their cycle's terminal month (e.g., Quarterly April → June). This prevents insertion failures caused by frequency lock triggers blocking non-terminal months.

**Service role bypass:** The `enforce_frequency_lock_on_submission` database trigger allows service-role callers (edge functions) to bypass frequency lock checks. This ensures automated processes like rollover and bulk assignment are not blocked by the trigger.
