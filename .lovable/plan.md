

# Workflow Configuration: "Effective From" Period Support

## Current Limitation

The system stores workflow configs with an **exact month+year** match. The `get_employee_workflow` RPC checks:
```sql
WHERE wc.review_period = p_review_period AND wc.review_year = p_review_year
```

This means if you assign a workflow to Bhoopendra for "March 2026", it **only** applies to March 2026. For April 2026, it falls back to the global config. To cover 12 months, you'd need 12 separate records — clearly impractical.

## Proposed Solution: "Effective From" Mode

Add an `effective_from` flag so a config means "use this workflow from this month onward, until a newer config supersedes it."

### Database Changes

**1. Add column to `workflow_config`:**
```sql
ALTER TABLE workflow_config
  ADD COLUMN is_ongoing BOOLEAN NOT NULL DEFAULT false;
```

When `is_ongoing = true`, the config applies from `(review_year, review_period)` onward — not just that single month.

**2. Update `get_employee_workflow` RPC:**

For each priority level, add a second lookup after the exact-match check: find the most recent ongoing config where `(year, month_index) <= (requested_year, requested_month_index)`.

```text
Resolution order per priority level:
  1. Exact match for requested month+year
  2. Latest ongoing config where effective_from ≤ requested month+year
  3. (fall through to next priority level)
```

A helper converts month names to sortable integers for comparison:
```sql
-- Compare: (config_year * 100 + month_index) <= (requested_year * 100 + requested_month_index)
```

If two ongoing configs exist (e.g., one from Jan 2026, another from June 2026), the one with the latest effective date that is still ≤ the requested period wins.

**3. Similarly update `get_employee_workflow_info` and `get_bulk_employee_workflows` RPCs** to use the same ongoing resolution logic.

### Frontend Changes

**`src/pages/admin/WorkflowConfig.tsx`:**
- When `periodMode === 'specific'`, add a toggle/checkbox: **"Apply from this month onward"**
- When toggled on, the upsert call includes `is_ongoing: true`
- In the config list, show a badge like "Ongoing from Mar 2026" instead of "Mar 2026"
- Add a visual indicator (e.g., arrow icon →) to distinguish one-time vs ongoing configs

**`src/hooks/useWorkflowConfig.ts`:**
- Update `useUpsertWorkflowConfig` to accept and pass `isOngoing` parameter
- Update `WorkflowConfig` interface to include `is_ongoing`

### UI Behavior

```text
┌─────────────────────────────────────────────────────┐
│  Scope: ○ Global  ● Specific Period                 │
│                                                     │
│  Month: [March ▾]  Year: [2026 ▾]                   │
│                                                     │
│  ☑ Apply from this month onward                     │
│    (This workflow will remain effective for all      │
│     future months until a new config is set)         │
└─────────────────────────────────────────────────────┘
```

When viewing configs in the table:
```text
│ Bhoopendra (101131) │ Sales Workflow │ Ongoing from Mar 2026 → │
│ Rajesh (101045)      │ Default Flow   │ Apr 2026 only           │
```

### Config List Filtering

When viewing a specific period (e.g., July 2026), the list should show:
1. Exact configs for July 2026
2. Ongoing configs from earlier months that are still effective (with an "Inherited from Mar 2026" indicator)

### Edge Cases

- **Overriding an ongoing config**: Setting a new config (exact or ongoing) for a later month takes precedence for that month onward
- **Removing an ongoing config**: Reverts all future months back to the next applicable config in the hierarchy
- **Exact config + ongoing config for same entity**: Exact match always wins for that specific month

### Files to Modify

| File | Change |
|---|---|
| **New migration SQL** | Add `is_ongoing` column, update 3 RPCs with ongoing resolution logic |
| `src/hooks/useWorkflowConfig.ts` | Add `is_ongoing` to interfaces, pass in upsert |
| `src/pages/admin/WorkflowConfig.tsx` | Add "Apply from this month onward" toggle, update badges and list display |

### Summary

This is primarily a **database RPC change** — the resolution logic in `get_employee_workflow` needs to check for the nearest ongoing config when no exact match exists. The frontend changes are minimal: one checkbox toggle and updated badge display.

