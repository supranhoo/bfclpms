

# Plan: Update DOCUMENTATION.md with Review Period Governance Section

## Problem
The `DOCUMENTATION.md` file references the Governance system only in the version header (line 4). There is no dedicated section documenting the architecture, database tables, components, hooks, edge function, or the three-layer enforcement model (RLS + Workflow + Governance).

## What Will Be Added

### 1. Database Schema Section (under existing Tables Reference)
Add documentation for the four governance tables:
- `review_period_locks` — lock records with hierarchy (Global > Role > Department > Employee), permissions JSON, reason, is_locked
- `review_period_auto_rules` — configurable auto-lock triggers (deadline_passed, review_submitted, approval_complete, calibration_complete) with `trigger_condition` and `action` JSON columns
- `review_period_audit_log` — immutable audit trail for all governance actions
- `review_period_stages` — stage lifecycle tracking (started_at, ended_at per stage)

### 2. Feature Section: Review Period Governance
A new subsection under "Detailed Feature Breakdown" covering:
- **Three-Layer Architecture** — table showing RLS (database security), Workflow (status transitions), Governance (UI permission gating) and how they coexist
- **Lock Hierarchy** — Employee > Department > Role > Global resolution order via `check_review_period_permission` RPC
- **7-Tab Governance Center** — Overview, Global Locks, Role Permissions, Department Locks, Employee Locks, Auto Rules, Audit Log
- **Auto-Lock Rules** — the four rule types, how `deadline_days` works for `deadline_passed`, event-driven triggers for the rest
- **Enforcement Hook** — `useReviewPeriodPermissions` hook description, which components consume it (SelfReviewSheet, EmployeeScorecard, ManagementScorecard, AuditScorecard, KpiHeaderSection, GovernanceLockBanner)
- **Edge Function** — `auto-lock-review-periods` cron function behavior
- **Dashboard Widget** — `ReviewPeriodStatusWidget` on Management Dashboard

### 3. Version History Entry
Add entry for the `deadline_days` UI fix under Version History.

## File Modified
- `DOCUMENTATION.md` — Add governance documentation section and update tables reference

## No database, RLS, or edge function changes needed
This is a documentation-only update.

