

## Fix: Admin Data Entry Allows Out-of-Workflow Role Advancement + Data Repair (Jan 2026+)

### Root Cause
When an admin enters data for a role (e.g., auditor) that does NOT exist in the employee's workflow, `resolveForwardStatus` falls back to `'approved'`, incorrectly finalizing the KPI with the wrong score.

### Scope Constraint
Data repair applies to **January 2026 onwards only**. December 2025 and earlier months are untouched.

### Implementation

#### 1. Add workflow membership guard in `useAdminDataEntry.ts`
Before calling `resolveForwardStatus`, validate that the admin-entered role's stage exists in the employee's workflow. If not, set `newStatus = null` (save role-specific fields but do NOT advance status or sync final_score).

```text
Role → Stage mapping:
  manager    → manager_check
  skip_level → skip_level_check
  hr_pms     → hr_pms_review
  auditor    → audit
  management → management_review
```

If the mapped stage is not in the workflow stages array, skip advancement entirely.

#### 2. Harden `resolveForwardStatus` in `workflowEngine.ts`
For each role case, check if the role's own stage exists in `workflowStages` first. If not, return `'approved'` only if no stage exists — change to return `null` instead, so callers must handle the missing-stage case explicitly.

#### 3. Corrective data migration (Jan 2026+ only)
Run an UPDATE (via insert tool) to fix approved KPIs where:
- `review_year = 2026 AND review_period IN ('January', 'February', 'March')`
- The employee's workflow does NOT include the `audit` stage
- But `final_score` was set from `auditor_score`

Reset these KPIs:
- `status` back to the last legitimate workflow stage (the stage before the terminal one)
- Clear `final_score` and `final_rating` so they re-enter the proper workflow

Affected employees (confirmed from earlier RCA): 100801, 100316, 100860 — January 2026 only.

#### 4. Update documentation
- `DOCUMENTATION.md` version bump
- `POLICY.md` — add invariant: admin data entry must not advance status for out-of-workflow roles

### Files Changed
| File | Action |
|------|--------|
| `src/hooks/useAdminDataEntry.ts` | Add workflow membership check before status advancement |
| `src/lib/workflowEngine.ts` | `resolveForwardStatus` returns `null` when role stage not in workflow |
| Data update (insert tool) | Fix 3 affected KPIs, Jan 2026+ only |
| `DOCUMENTATION.md` | Version history |
| `POLICY.md` | New invariant |

### Risk Assessment
- **Data**: Only Jan 2026+ affected rows; Dec and earlier untouched
- **Regression**: Low — restricts an invalid path; legitimate in-workflow admin entries unaffected
- **Workflow**: Fixed KPIs re-enter proper review pipeline

