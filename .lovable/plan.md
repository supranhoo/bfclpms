

# Plan: Workflow Configuration — Export Report

## What It Does

Adds a **"Download Report"** button to the Workflow Configuration page that exports a comprehensive Excel workbook with 4 sheets covering the complete workflow setup.

## Excel Workbook Structure

### Sheet 1: "Templates"
All workflow templates (active + archived):

| Template Name | Description | Stages | Stage Count | Is Default | Status |
|---|---|---|---|---|---|
| Standard 5-Stage | Default workflow | KRA Set → Self Review → Manager Review → Audit Review → Approved | 5 | Yes | Active |
| Full 8-Stage | Complete review cycle | KRA Set → Self Review → ... → Management Review → Approved | 8 | No | Active |
| Legacy Process | Old workflow | ... | 6 | No | Archived |

### Sheet 2: "Employee Overrides"
All employee-level workflow assignments:

| Employee Name | Employee Code | Email | PMS Grade | Department | Assigned Template | Stages | Scope | Review Period | Review Year |
|---|---|---|---|---|---|---|---|---|---|
| John Doe | EMP001 | john@co.com | A1 | Sales | Full 8-Stage | KRA Set → ... → Approved | Global | — | — |
| Jane Smith | EMP002 | jane@co.com | B2 | HR | Standard 5-Stage | KRA Set → ... → Approved | Period-Specific | March | 2026 |

### Sheet 3: "Department Assignments"
All department-level workflow assignments:

| Department | Assigned Template | Stages | Scope | Review Period | Review Year |
|---|---|---|---|---|---|
| Finance | Standard 5-Stage | KRA Set → ... → Approved | Global | — | — |
| IT | Full 8-Stage | KRA Set → ... → Approved | Period-Specific | March | 2026 |

### Sheet 4: "PMS Grade Assignments"
All PMS grade-level assignments:

| PMS Grade | Employee Count | Assigned Template | Stages | Scope | Review Period | Review Year |
|---|---|---|---|---|---|---|
| A1 | 12 | Full 8-Stage | KRA Set → ... → Approved | Global | — | — |
| B2 | 8 | Standard 5-Stage | KRA Set → ... → Approved | Global | — | — |

### Summary Header (Row 1-3 of each sheet)
- Row 1: "Workflow Configuration Report"
- Row 2: Generated date, total templates, total overrides
- Row 3: blank separator

## Implementation

### File: New `src/components/admin/WorkflowConfigExport.tsx`
- A button component that accepts `templates`, `configs`, `profiles`, `departments` as props
- Uses `xlsx` (already installed) to build the 4-sheet workbook
- Joins configs with templates to resolve template names and stages
- Joins employee configs with profiles to get name/code/email/department
- Formats stages as readable arrow-separated strings (e.g., "KRA Set → Self Review → ...")

### File: `src/pages/admin/WorkflowConfig.tsx`
- Import and place the export button next to the Reconcile button in the period selector toolbar

## Files Modified
1. **New**: `src/components/admin/WorkflowConfigExport.tsx`
2. **Modified**: `src/pages/admin/WorkflowConfig.tsx` — add export button

