

# Merge Team Review + Skip-Level Review into "Team Reviews"

## Workflow Impact Assessment

**No workflow logic is impacted.** The merge is purely a UI-level change -- combining two toggle buttons into one and showing both employee lists together. Here is why:

- The **score fields** remain separate: Team Review writes to `manager_score`, Skip-Level writes to `skip_level_score`. This does not change.
- The **status transitions** remain the same: Team reviews KPIs at `self_review` status; Skip-Level reviews KPIs at `manager_check` status. The workflow engine (`workflowEngine.ts`) is untouched.
- The **UnifiedScorecard** already determines which score field and action to use based on the `viewLevel` prop (`manager` vs `skip_level`). This stays the same -- only the routing into it changes.
- **RLS policies** and **database schema** are completely unaffected.

## What Changes (UI Only)

### 1. ViewModeToggle -- Remove `skip_level`, rename `team` to "Team Reviews"

Replace two buttons ("Team Review" + "Skip-Level") with a single "Team Reviews" button. The `skip_level` ViewMode value is removed from the toggle but kept internally for scorecard routing.

### 2. EmployeeSelectorGrid -- Merge employee lists with relationship tags

When `viewLevel === 'team'`:
- Fetch **both** direct reports (existing `useTeamMembers`) and indirect reports (`useSkipLevelTeamMembers`)
- Deduplicate by employee ID (a direct report is never also a skip-level report)
- Tag each employee card with a **"Direct"** or **"Indirect"** badge so the manager knows the relationship
- Combine stat cards: show Direct Pending, Skip-Level Pending, and Reviewed counts
- Status filter options updated: "Pending (Direct)", "Pending (Skip-Level)", "Reviewed"

### 3. Dashboard -- Route to correct scorecard viewLevel

When a manager clicks an employee tagged as "Indirect", the `UnifiedScorecard` receives `viewLevel="skip_level"` instead of `"manager"`. This ensures the correct score field (`skip_level_score`) and workflow status checks are used -- **preserving all existing workflow behavior**.

### 4. Deep-link URLs

Update URL handling: `?view=skip_level` still works for backward compatibility (notifications, bookmarks) but now opens the merged "Team Reviews" mode and selects the employee.

### 5. Sidebar navigation

Remove the separate "Skip-Level Review" sidebar entry if one exists; the single "Team Reviews" entry covers both.

## Files Changed

| File | Change |
|---|---|
| `src/components/review/ViewModeToggle.tsx` | Remove `skip_level` from visible modes, rename `team` label to "Team Reviews" |
| `src/components/review/EmployeeSelectorGrid.tsx` | Merge direct + indirect reports, add relationship badge, combine stats |
| `src/pages/Dashboard.tsx` | Map merged mode to correct `viewLevel` based on employee relationship tag |
| `src/components/layout/AppSidebar.tsx` | Remove skip-level nav item (if present) |
| `DOCUMENTATION.md` | Update documentation |

## Technical Detail: Relationship Detection

Each employee in the merged list will carry a `relationship` field:

```text
type EmployeeWithRelation = EmployeeProfile & {
  relationship: 'direct' | 'indirect';
};
```

- `direct`: employee's `reporting_manager_id === currentUserId`
- `indirect`: employee is in the `skipLevelMembers` list

When an employee is selected, the Dashboard checks this tag:
- `direct` -> passes `viewLevel="manager"` to UnifiedScorecard
- `indirect` -> passes `viewLevel="skip_level"` to UnifiedScorecard

This ensures the correct score column, workflow status, and action buttons are used without any workflow engine changes.

