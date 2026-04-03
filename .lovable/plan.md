

## Plan: Add Skip-Level Manager to Workflow Config Export

### Problem
The Employee Overrides sheet in the Workflow Configuration export shows only the direct reporting manager. It should also show the reporting manager's reporting manager (skip-level manager) in the same row.

### Change

**`src/components/admin/WorkflowConfigExport.tsx`** — Employee Overrides sheet

- After resolving `manager` from `p.reporting_manager_id`, also resolve the skip-level manager: `const skipManager = manager?.reporting_manager_id ? profileMap.get(manager.reporting_manager_id) : null;`
- Add a new column `'Skip-Level Manager'` with `skipManager?.full_name || '—'` after the `'Reporting Manager'` column
- Add corresponding column width entry `{ wch: 22 }` to `ws2['!cols']`

**`DOCUMENTATION.md`** — v2.15.62

### Files Modified

| File | Change |
|------|--------|
| `src/components/admin/WorkflowConfigExport.tsx` | Add skip-level manager column to Employee Overrides sheet |
| `DOCUMENTATION.md` | v2.15.62 |

### Risk
- None — additive column; no logic or schema changes

