

# Advanced Review Period Governance System — Full Implementation Plan

## Risk & Impact Analysis

**Data Impact**: HIGH — New tables, new enums, modifications to existing `review_periods` table. Existing workflow engine functions and triggers will need migration. Historical data integrity must be preserved.

**Workflow Impact**: CRITICAL — Replacing the workflow engine means every review flow (self-review, manager, audit, management, skip-level, HR PMS) must be re-routed through the new governance system. All existing KPIs in-flight will need a compatibility layer.

**UI/UX Consistency**: HIGH — The Review Periods page expands from a simple lock table to a multi-tab governance center. Lock indicators must propagate to Dashboard, Review panels, and Scorecard views.

**Regression Risk**: VERY HIGH — The workflow engine is referenced in 30+ files. Replacing it affects every status transition, send-back, approval, and notification trigger.

**Mitigation**: Implement in 4 ordered phases. Each phase is self-contained and testable. The existing workflow engine is preserved as a fallback until Phase 3 fully replaces it.

---

## Phase 1: Database Schema + Multi-Layer Lock Architecture

### New Tables

**`review_period_stages`** — Defines the lifecycle stage of each review period
```
id uuid PK
review_period_id uuid FK → review_periods
stage text (planning, self_review, manager_review, calibration, approval, closed)
started_at timestamptz
ended_at timestamptz
started_by uuid FK → auth.users
```

**`review_period_locks`** — Multi-layer lock records
```
id uuid PK
review_period_id uuid FK → review_periods
lock_type text (global, role, department, employee)
target_id text (role name / department uuid / employee uuid)
permissions jsonb (edit_kpi, submit_self_review, submit_manager_review, approve, edit_scores, add_comments, view_only)
is_locked boolean default true
locked_by uuid FK → auth.users
locked_at timestamptz
unlock_reason text
reason text
```

**`review_period_auto_rules`** — Auto-lock rule definitions
```
id uuid PK
review_period_id uuid FK → review_periods
rule_type text (deadline_passed, review_submitted, approval_complete, calibration_complete)
trigger_condition jsonb
action jsonb (lock_type, target, permissions)
is_active boolean
created_by uuid
```

**`review_period_audit_log`** — Governance audit trail
```
id uuid PK
review_period_id uuid FK → review_periods
action text (stage_changed, role_locked, dept_locked, employee_locked, rule_triggered)
performed_by uuid
previous_state jsonb
new_state jsonb
reason text
created_at timestamptz
```

### Modifications to Existing `review_periods` Table
- Add `current_stage text default 'planning'`
- Add `stage_started_at timestamptz`
- Add `completion_percentage numeric default 0`

### New Database Function
`check_review_period_permission(p_user_id uuid, p_period_name text, p_review_year int, p_action text)` — SECURITY DEFINER function that evaluates the lock hierarchy (Employee > Department > Role > Global) and returns boolean. This replaces inline lock checks throughout the app.

### RLS Policies
- `review_period_locks`: Admin-only INSERT/UPDATE/DELETE; authenticated SELECT
- `review_period_stages`: Admin-only INSERT/UPDATE; authenticated SELECT
- `review_period_auto_rules`: Admin-only full CRUD; authenticated SELECT
- `review_period_audit_log`: Admin-only INSERT; authenticated SELECT

---

## Phase 2: UI — Review Periods Governance Center

Rebuild `src/pages/admin/ReviewPeriods.tsx` as a tabbed governance center with 7 sections:

### Tab 1: Period Overview
- Period name, year, current stage badge, completion %, global lock toggle
- Stage progress bar (Planning → Self Review → Manager Review → Calibration → Approval → Closed)

### Tab 2: Stage Controller
- Visual pipeline with "Advance Stage" / "Revert Stage" buttons
- Each stage shows start/end dates, who initiated it
- Stage change triggers audit log entry + notifications

### Tab 3: Role Permissions Matrix
- Table with roles as rows, permissions as columns (Edit KPI, Self Review, Manager Review, Approve, Edit Scores, Comments, View Only)
- Toggle switches per cell
- Roles fetched from `user_roles` table dynamically
- Save creates/updates `review_period_locks` with `lock_type = 'role'`

### Tab 4: Division/Department Locks
- List of all departments from `departments` table
- Lock/Unlock toggle per department with reason field
- Bulk actions: "Lock All", "Unlock All"
- Status indicators (Locked/Open) with locked_by and reason

### Tab 5: Employee Locks
- Searchable employee list from `profiles`
- Individual lock/unlock with reason
- Bulk actions: Lock by department, Lock completed reviews, Lock approved employees
- Filter by department, status

### Tab 6: Auto-Lock Rules
- Rule builder UI: trigger condition → action
- Predefined rule templates (self review deadline, manager submitted, final approved, calibration complete)
- Enable/disable toggle per rule

### Tab 7: Audit Log
- Filterable table from `review_period_audit_log`
- Columns: Action, Target, By, Date, Previous State, New State, Reason
- Export capability

### New Components (in `src/components/admin/`)
- `ReviewPeriodStageController.tsx`
- `ReviewPeriodRolePermissions.tsx`
- `ReviewPeriodDepartmentLocks.tsx`
- `ReviewPeriodEmployeeLocks.tsx`
- `ReviewPeriodAutoRules.tsx`
- `ReviewPeriodAuditLog.tsx`
- `ReviewPeriodOverview.tsx`

---

## Phase 3: Enforcement Layer — Replace Workflow Engine

### New Hook: `useReviewPeriodPermissions`
Central hook that checks `check_review_period_permission()` RPC for the current user + period. Returns permission flags consumed by all review components.

### Integration Points (files to modify)
1. **`src/components/review/KpiReviewPanel.tsx`** — Check lock permissions before enabling edit/submit
2. **`src/components/review/SelfReviewSheet.tsx`** — Disable self-review if locked
3. **`src/components/review/EmployeeScorecard.tsx`** — Show lock indicators
4. **`src/components/review/ManagementScorecard.tsx`** — Respect role locks
5. **`src/components/review/AuditScorecard.tsx`** — Respect role locks
6. **`src/pages/Dashboard.tsx`** — Show period status widget
7. **`src/pages/MyKpis.tsx`** — Disable submission if employee locked

### Database Trigger Updates
- Modify `prevent_locked_period_updates()` to call `check_review_period_permission()` instead of simple `is_period_locked()`
- Modify `prevent_locked_submission_updates()` similarly
- These become the server-side enforcement, preventing bypass via API

### Workflow Engine Transition
- `src/lib/workflowEngine.ts` functions (`resolveForwardStatus`, `resolvePendingStatuses`, etc.) remain for status resolution
- The PERMISSION layer (who can act) shifts to the governance system
- The STATUS layer (what comes next) stays in workflowEngine.ts
- This avoids a dangerous full replacement while achieving the user's goal of centralized governance control

---

## Phase 4: Dashboard Integration, Notifications, Auto-Lock Execution

### Dashboard Widget
- Add "Review Period Status" card to Management Dashboard
- Shows: Period, Stage, Completion %, Lock Status, Alerts (pending counts)

### Notifications
- Stage change → notify all affected employees
- Employee locked → notify employee
- Department locked → notify department members
- Deadline approaching → notify pending users
- Uses existing `notifications` table and `send_email_on_notification` trigger

### Auto-Lock Execution
- Edge function `auto-lock-review-periods/index.ts` that runs on schedule
- Evaluates active rules from `review_period_auto_rules`
- Creates lock records and audit log entries when conditions met

### Lock Indicators Across App
- Add lock icon overlays to KPI cards, scorecard headers, and review panels
- Tooltip showing lock reason and who locked

---

## Implementation Order

Given the scope, implementation will proceed across multiple build cycles:

1. **Build 1**: Phase 1 (schema + migrations) + Phase 2 Tab 1-3 (Overview, Stage Controller, Role Permissions)
2. **Build 2**: Phase 2 Tab 4-7 (Department Locks, Employee Locks, Auto Rules, Audit Log)
3. **Build 3**: Phase 3 (enforcement hook, trigger updates, component integration)
4. **Build 4**: Phase 4 (dashboard widget, notifications, auto-lock edge function, lock indicators)

### Files Created (estimated: 12 new files)
### Files Modified (estimated: 15-20 existing files)
### Migrations: 3-4 SQL migrations

