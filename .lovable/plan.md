
# Root Cause: Workflow-Unaware Employee List in All Reviewer Panels

## The Core Bug

In `src/components/review/EmployeeSelectorGrid.tsx` line 188:

```typescript
if (viewLevel === 'hr_pms') return allProfiles;
```

The HR PMS panel (and Audit/Management panels — same pattern at line 189) uses `allProfiles` — **every single employee in the system** — regardless of whether that employee's assigned workflow template even includes the relevant stage.

The result: employees like **Abhas Luharuwalla** who are on `self_audit_mgmt` (stages: `kra_set → self_review → audit → management_review → approved`) appear in the HR PMS panel even though HR PMS will **never** touch their KPIs. Same problem exists for Audit and Management review panels.

---

## Scope of the Problem — Confirmed from Database

| Panel | Employees shown incorrectly | Why |
|---|---|---|
| HR PMS | **27 employees** | Their workflow template has no `hr_pms_review` stage |
| Audit | **18 employees** | Their workflow template has no `audit` stage |
| Management | **30 employees** | Their workflow template has no `management_review` stage |
| Skip-Level | **44 employees** | Their workflow template has no `skip_level_check` stage |

**Example confirmed:** Abhas Luharuwalla (`self_audit_mgmt` template = `[kra_set, self_review, audit, management_review, approved]`) — no `hr_pms_review`, but appears in HR PMS grid showing 39 total employees.

---

## The Fix

### `EmployeeSelectorGrid.tsx` — `baseMembers` computation (lines 170–191)

The `baseMembers` memo currently assigns profiles to panels using a flat role-based check. It needs to be **workflow-aware**: filter `allProfiles` to only include employees whose assigned workflow template includes the required stage for that panel.

The workflow stages for every employee are already fetched via `useBulkEmployeeWorkflows` (the `workflowMap`). We use that same map to filter.

**Stage-to-panel mapping:**
- `hr_pms` panel → only employees whose stages include `hr_pms_review`
- `audit` panel → only employees whose stages include `audit`
- `management` panel → only employees whose stages include `management_review`
- `skip_level` panel → only employees whose stages include `skip_level_check`
- `team` panel → no stage filter needed (managers see their direct/indirect reports)

**However, there is a timing issue:** `workflowMap` is derived from `periodKpis` employee IDs (line 137–142). If an employee has no KPIs in the selected period, they won't be in `workflowMap` and will fall back to the `DEFAULT_WORKFLOW_STAGES` (which DOES contain `hr_pms_review`). This means employees with no KPIs in the period will still appear — which is actually correct behaviour (they might just not have submitted yet).

The more robust fix is to filter `allProfiles` by doing a **direct database-side check**: only show employees whose effective workflow template contains the required stage. This is done in two parts:

**Part 1: New `useProfilesByWorkflowStage` hook** in `useOrganization.ts`

A new targeted hook that queries the database for profiles whose resolved workflow template includes a given stage. This uses the existing `workflow_config` + `workflow_templates` relationship, with the default template as a fallback for employees without an explicit override.

```typescript
export function useProfilesByWorkflowStage(stage: string | null) {
  return useQuery({
    queryKey: ['profiles-by-workflow-stage', stage],
    queryFn: async () => {
      if (!stage) return null; // null = no filter = return all

      // Get employee IDs that have the required stage in their template
      // This uses the workflow_config (employee overrides) + default template fallback
      const { data: overrideConfigs } = await supabase
        .from('workflow_config')
        .select('config_value, workflow_templates!inner(stages)')
        .eq('config_type', 'employee');

      // Get default template stages
      const { data: defaultTemplates } = await supabase
        .from('workflow_templates')
        .select('stages')
        .eq('is_default', true)
        .single();

      const defaultStages: string[] = (defaultTemplates?.stages as string[]) || [];
      const defaultHasStage = defaultStages.includes(stage);

      // Map of employee_id -> hasStage
      const overrideMap = new Map<string, boolean>();
      overrideConfigs?.forEach(cfg => {
        const stages = (cfg.workflow_templates as any)?.stages as string[] || [];
        overrideMap.set(cfg.config_value, stages.includes(stage));
      });

      // Fetch all profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*, departments(id, name, code)')
        .order('full_name');

      // Filter: if employee has override, use it; otherwise use default
      return profiles?.filter(p => {
        if (overrideMap.has(p.id)) return overrideMap.get(p.id);
        return defaultHasStage;
      }) || [];
    },
    enabled: !!stage,
  });
}
```

**Part 2: Update `EmployeeSelectorGrid.tsx` `baseMembers` logic**

Replace the `if (viewLevel === 'hr_pms') return allProfiles;` and the similar lines for `audit` and `management` with workflow-filtered lists:

```typescript
// Map each panel to its required workflow stage
const PANEL_REQUIRED_STAGE: Partial<Record<Exclude<ViewMode, 'self'>, string>> = {
  hr_pms: 'hr_pms_review',
  audit: 'audit',
  management: 'management_review',
  skip_level: 'skip_level_check',
};

// Fetch workflow-filtered profiles for panels that need stage filtering
const requiredStage = PANEL_REQUIRED_STAGE[viewLevel] ?? null;
const { data: stageFilteredProfiles } = useProfilesByWorkflowStage(requiredStage);
```

Then in the `baseMembers` memo:

```typescript
// BEFORE:
if (viewLevel === 'hr_pms') return allProfiles;
if (isFullAccess) return allProfiles;

// AFTER:
if (requiredStage) return stageFilteredProfiles || [];
if (isFullAccess) return allProfiles;
```

This completely replaces the "show everyone" behaviour with "show only employees whose workflow includes this stage."

---

## Additional Fix: Stats Card Count

The `stats.totalEmployees` counter and the "Total Employees: 39" banner in the screenshot will automatically correct once `baseMembers` is correctly filtered — no separate fix needed there.

---

## Also Fix: `isLoading` State

Line 165–167 in `EmployeeSelectorGrid.tsx`:

```typescript
const isLoading = viewLevel === 'skip_level' ? skipLevelLoading 
  : viewLevel === 'team' ? (isFullAccess ? profilesLoading : (teamLoading || skipLevelLoading))
  : (isFullAccess ? profilesLoading : teamLoading);
```

This needs to also account for `stageFilteredProfilesLoading` when a stage filter is active:

```typescript
const isLoading = viewLevel === 'skip_level' ? skipLevelLoading 
  : viewLevel === 'team' ? (isFullAccess ? profilesLoading : (teamLoading || skipLevelLoading))
  : requiredStage ? stageFilteredProfilesLoading
  : (isFullAccess ? profilesLoading : teamLoading);
```

---

## Files to Modify

| File | Change |
|---|---|
| `src/hooks/useOrganization.ts` | Add `useProfilesByWorkflowStage(stage)` hook |
| `src/components/review/EmployeeSelectorGrid.tsx` | Import and use `useProfilesByWorkflowStage`; replace `allProfiles` assignment for `hr_pms`, `audit`, `management`, `skip_level` panels with workflow-filtered list; update `isLoading` |
| `DOCUMENTATION.md` | Version bump to 1.45.20, document workflow-aware panel filtering |

---

## What Changes After the Fix

| Panel | Before | After |
|---|---|---|
| HR PMS | 39 employees (all profiles) | ~27 employees (only those with `hr_pms_review` stage) |
| Audit | All profiles | Only employees with `audit` stage |
| Management | All profiles | Only employees with `management_review` stage |
| Skip-Level | All skip-level members regardless of template | Only those with `skip_level_check` stage |
| Team | Unchanged — managers' direct/indirect reports | Unchanged |

Abhas and all other senior/VP-level employees on `self_audit_mgmt` will no longer appear in the HR PMS panel.

---

## Correctness of the Approach

- Employees with **no workflow config entry** fall through to the system **default template** (`self_l1_l2_hr_pms`), which DOES include `hr_pms_review` — so they correctly remain visible in the HR PMS panel.
- Employees with an **employee-level override** that doesn't include `hr_pms_review` (like Abhas on `self_audit_mgmt`) are correctly excluded.
- The fix is purely front-end filtering — it does not change any database records or workflow assignments.
- The "Pending Review" count badge on individual employee cards (`getEmployeeKpiStats`) already uses `resolveReviewableStatuses` correctly — it only shows counts for stages that exist in the employee's workflow. The fix aligns the employee LIST with this already-correct KPI count logic.
