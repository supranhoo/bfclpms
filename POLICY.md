# PMS — Business Policy Document

> **Last Updated:** 2026-03-02  
> **Version:** 1.0.0  
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
19. [Version History](#19-version-history)

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

## 19. Version History

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-03-02 | Initial POLICY.md creation — documented all existing business rules, workflow policies, configurable settings, and the new mandatory remarks feature |
