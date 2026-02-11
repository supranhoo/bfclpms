

# Enhanced KRA Rollover System

## Overview

Redesign the "Rollover Now" workflow into a multi-step dialog with conflict detection, selective employee rollover, balance-only KPI copying, and downloadable Excel reports.

## Changes

### 1. Database Migration

Add a `details` JSONB column to `kra_rollover_logs` to store per-employee breakdown for historical report downloads.

### 2. Rewrite Edge Function (`supabase/functions/auto-rollover-kpis/index.ts`)

Support new request parameters:

- `source_month`, `source_year` -- custom source period (defaults to previous month)
- `target_month`, `target_year` -- custom target period (defaults to current month)
- `employee_ids` -- optional array for selective rollover
- `dry_run` -- preview mode that returns conflict data without inserting
- `rollover_balance_only` -- only copy KPIs missing in target for employees who already have some
- `skip_employee_ids` -- employees to skip entirely

**Core logic per employee:**
1. Fetch source KPIs for that employee
2. Fetch target KPIs for that employee
3. If target has KPIs and `rollover_balance_only` is true: compare by `kpi_name + kra_name`, copy only missing ones
4. If target has KPIs and not balance mode: add to skipped list
5. If no target KPIs: copy all

**Response includes:**
- `rolled_over` -- array of `{ employee_id, employee_name, employee_code, department, kpis_copied }`
- `skipped` -- array of `{ employee_id, employee_name, employee_code, department, existing_kpi_count, existing_kpi_names }`
- `conflicts` -- array of employees with partial KPIs (for preview step)
- `total_kpis_copied`, `total_employees_affected`

### 3. New Component (`src/components/admin/RolloverDialog.tsx`)

A multi-step dialog triggered by a single "Rollover KPIs" button:

**Step 1 -- Configuration:**
- Source period: month + year dropdowns (default: previous month)
- Target period: month + year dropdowns (default: current month)
- Toggle: "All Employees" or "Select Specific Employees"
- If specific: searchable multi-select of employees from profiles table
- "Check & Preview" button triggers dry_run

**Step 2 -- Preview and Conflict Resolution:**
- Summary: "X employees ready, Y employees have existing KPIs"
- Table of conflicting employees showing: name, code, department, existing KPI count
- Each conflict row has a checkbox: checked = rollover balance KPIs only, unchecked = skip
- Select All / Deselect All toggle
- Warning banner for conflicts
- "Proceed with Rollover" button

**Step 3 -- Results and Report:**
- Summary cards: total rolled over, balance-only, skipped
- Results table with all employees and their status
- "Download Report" button generates Excel using the `xlsx` library with columns:

| Employee Name | Employee Code | Department | Source Period | Target Period | KPIs Copied | Status | Existing KPIs |
|---|---|---|---|---|---|---|---|
| John Doe | EMP001 | Sales | January 2026 | February 2026 | 5 | Rolled Over | 0 |
| Jane Smith | EMP002 | HR | January 2026 | February 2026 | 2 | Balance Only | 3 |
| Bob Lee | EMP003 | IT | January 2026 | February 2026 | 0 | Skipped | 5 |

### 4. Update System Settings Page (`src/pages/admin/SystemSettings.tsx`)

- Replace "Rollover Now" and "Force Rollover" buttons with a single "Rollover KPIs" button that opens `RolloverDialog`
- Keep auto-rollover toggle and last rollover info display as-is

### 5. Update Hooks (`src/hooks/useSystemSettings.ts`)

- Update `useTriggerRollover` to accept the new parameters
- Add `useRolloverPreview` hook for dry-run calls
- Add `useEmployeeList` hook for the employee selector

### 6. Update Documentation (`DOCUMENTATION.md`)

Document the enhanced rollover system including conflict detection, balance-only mode, selective rollover, and report downloads.

## File Summary

| File | Action |
|---|---|
| Database migration | Add `details` JSONB column to `kra_rollover_logs` |
| `supabase/functions/auto-rollover-kpis/index.ts` | Rewrite with enhanced logic |
| `src/components/admin/RolloverDialog.tsx` | New multi-step dialog |
| `src/pages/admin/SystemSettings.tsx` | Replace buttons with dialog trigger |
| `src/hooks/useSystemSettings.ts` | Update mutation, add preview hook |
| `DOCUMENTATION.md` | Update rollover docs |

