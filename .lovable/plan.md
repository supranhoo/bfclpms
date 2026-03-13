

# Plan: Period-Specific Workflow Mapping

## Context from Project Knowledge

The **workflow-versioning-constraint** states workflows are currently "global and immediate" with no period-specific support. The **workflow-engine-spec** confirms resolution uses Employee > Department > PMS Grade > Default cascade via RPCs. The **workflow-template-lifecycle** notes archived templates are excluded from the cascade.

This plan introduces period-aware resolution as a new capability, designed to be fully backward-compatible — existing global configs continue to work unchanged as the fallback layer.

## Risk Mitigation

The key risk (from project knowledge) is "KPIs getting stuck in orphaned statuses." With period-specific workflows, a KPI in July using an 8-stage template won't be affected by August using a 4-stage template, because the RPC will resolve the correct template per-period. The RPCs default to global behavior when no period params are passed, preserving all existing call sites.

## Database Changes (1 Migration)

### Add period columns to `workflow_config`

```sql
ALTER TABLE workflow_config
  ADD COLUMN review_period TEXT,
  ADD COLUMN review_year INT;
```

### Replace unique constraint

Drop `workflow_config_config_type_config_value_key` and create two partial unique indexes:
- Global: `UNIQUE(config_type, config_value) WHERE review_period IS NULL`
- Period-specific: `UNIQUE(config_type, config_value, review_period, review_year) WHERE review_period IS NOT NULL`

### Update 3 RPCs with optional period params

All three RPCs (`get_employee_workflow`, `get_employee_workflow_info`, `get_bulk_employee_workflows`) get optional `p_review_period TEXT DEFAULT NULL` and `p_review_year INT DEFAULT NULL` parameters.

New resolution cascade (7 levels):
```text
1. Period-specific employee config
2. Period-specific department config
3. Period-specific PMS grade config
4. Global employee config
5. Global department config
6. Global PMS grade config
7. Default template
```

When `p_review_period` is NULL, steps 1-3 are skipped (existing behavior preserved). Each period-specific lookup adds `AND wc.review_period = p_review_period AND wc.review_year = p_review_year` to the WHERE clause.

## Frontend Changes

### `src/hooks/useWorkflowConfig.ts`
- Update `WorkflowConfig` interface to include `review_period: string | null` and `review_year: number | null`
- Update `useUpsertWorkflowConfig` mutation to accept optional `reviewPeriod` and `reviewYear`, pass to upsert, and handle the new composite uniqueness
- Update `useWorkflowConfigs` to return period columns
- Update `useEmployeeWorkflow`, `useEmployeeWorkflowStages`, `useBulkEmployeeWorkflows` hooks to accept optional period params and pass them to RPCs

### `src/pages/admin/WorkflowConfig.tsx`
- Add a period selector at the top of the page using `ReviewPeriodSelector` — with an extra "All Periods (Global Default)" option
- When "Global Default" is selected: show/edit configs where `review_period IS NULL` (current behavior)
- When a specific period is selected: show/edit configs scoped to that period
- In Employee/Department/Grade tabs, show a badge indicating whether the assignment is period-specific or inherited from global
- The assignment Select dropdown passes `reviewPeriod` and `reviewYear` to the upsert mutation

### Consumers (no breaking changes)
- Existing callers that don't pass period params continue to get global resolution (backward compatible due to DEFAULT NULL)
- Callers that have review period context (e.g., `useAdminDataEntry`, scorecard components) can optionally pass it for period-aware resolution — this can be done incrementally

## Files Modified
1. **New SQL migration** — ALTER `workflow_config`, DROP/CREATE indexes, CREATE OR REPLACE 3 RPCs
2. `src/hooks/useWorkflowConfig.ts` — interfaces, hooks accept optional period params
3. `src/pages/admin/WorkflowConfig.tsx` — period selector UI, filter/assign by period

## Update Project Knowledge
After implementation, update `workflow-versioning-constraint` to reflect the new period-aware capability.

