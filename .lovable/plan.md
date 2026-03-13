
# Plan: Period-Specific Workflow Mapping — IMPLEMENTED ✅

## What Was Done

### 1. Database Migration
- Added `review_period` (TEXT) and `review_year` (INT) columns to `workflow_config` table.
- Replaced single unique constraint with two partial unique indexes:
  - Global: `UNIQUE(config_type, config_value) WHERE review_period IS NULL`
  - Period-specific: `UNIQUE(config_type, config_value, review_period, review_year) WHERE review_period IS NOT NULL`
- Updated 3 RPCs (`get_employee_workflow`, `get_employee_workflow_info`, `get_bulk_employee_workflows`) with optional `p_review_period` and `p_review_year` parameters.

### 2. Resolution Cascade (7 levels)
```
1. Period-specific employee config
2. Period-specific department config
3. Period-specific PMS grade config
4. Global employee config
5. Global department config
6. Global PMS grade config
7. Default template
```
When period params are NULL, steps 1-3 are skipped (backward compatible).

### 3. Frontend — `useWorkflowConfig.ts`
- Updated `WorkflowConfig` interface with `review_period` and `review_year` fields.
- Updated `useUpsertWorkflowConfig` mutation to accept optional period params (uses find-then-update/insert pattern for partial unique indexes).
- Updated `useEmployeeWorkflow`, `useEmployeeWorkflowStages`, `useBulkEmployeeWorkflows` hooks to accept optional period params and pass them to RPCs.

### 4. Frontend — `WorkflowConfig.tsx`
- Added period selector at the top: "Global Default" or "Specific Period" (month + year).
- When "Global Default" selected: shows/edits configs where `review_period IS NULL`.
- When specific period selected: shows/edits configs scoped to that period.
- Shows "Inherits: [template]" badge when a global config exists but no period override.
- Shows period badge on period-specific assignments.
- Updated priority cascade description text dynamically.

### 5. Backward Compatibility
- All existing callers that don't pass period params continue to get global resolution.
- No breaking changes to `workflowEngine.ts`, scorecards, or other consumers.
