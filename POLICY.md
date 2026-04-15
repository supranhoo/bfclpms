# PMS — Business Policy Document

> **Last Updated:** 2026-04-15  
> **Version:** 2.12.0 — §Access: Restored Menu Access Rights grid on Profile Mapping tab for per-profile CRUD permission management.
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

**Computation pipeline:** The `compute-monthly-incentives` edge function aggregates production daily entries and resolves rates using the priority cascade. For production programs, it splits records by payment period: if daily data spans all three ranges (1-10, 11-20, 21-31), a single "Full Month" record is created; if data only covers specific ranges, separate records are created per populated range. Each period record has its own `incentive_amount` and independent `status` (draft/confirmed/paid), enabling payroll to track and confirm payments per period without duplication.

**Payment period column:** `employee_incentive_records.payment_period` stores: `'1-10'`, `'11-20'`, `'21-31'`, or `'Full Month'`. All program types now use `'Full Month'` as the standardized full-period value. Unique constraint: `(employee_id, review_period, review_year, program_id, payment_period)`.

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
