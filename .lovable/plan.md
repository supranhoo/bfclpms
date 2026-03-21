

## Add 3 Sub-Stage Tiles to HR PMS View + Fix Pending Count

### Problem
The HR PMS "Pending Review" tile shows 194, which is the **sum** of KPIs at `self_review` + `manager_check` + `skip_level_check`. The user wants this broken into 3 granular tiles and the original "Pending Review" tile corrected to show only KPIs genuinely pending at HR PMS level (i.e. none for Feb).

### Changes

**Modified: `src/components/review/EmployeeSelectorGrid.tsx`**

#### 1. Stats computation (line 544-561)
Split the single `pending` counter into 3 sub-counters + keep a true HR-pending count:

```typescript
let pendingSelf = 0, pendingManager = 0, pendingSkip = 0, inReview = 0, forwarded = 0;
relevantKpis.forEach(k => {
  const stages = getStages(k.employee_id);
  const hrIdx = stages.indexOf('hr_pms_review');
  if (hrIdx === -1) return;
  if (k.status === 'hr_pms_review') inReview++;
  else if (k.status === 'self_review') pendingSelf++;
  else if (k.status === 'manager_check') pendingManager++;
  else if (k.status === 'skip_level_check') pendingSkip++;
  else {
    const afterHr = stages.slice(hrIdx + 1);
    if (afterHr.includes(k.status || '')) forwarded++;
  }
});
```

Extend the stats return to include `stat5`, `stat6`, `stat7` for the 3 sub-counts:
- `stat1`: pendingSelf
- `stat2`: pendingManager
- `stat3`: pendingSkip
- `stat4`: inReview
- `stat5`: forwarded

#### 2. Stat tiles rendering (line 648-657)
Replace the HR PMS section with 8 tiles in a responsive grid (`grid-cols-2 lg:grid-cols-4 xl:grid-cols-8`):

| Tile | Label | Count | Filter Value | Color |
|------|-------|-------|--------------|-------|
| Total Employees | stats.totalEmployees | `all` | primary |
| Pending Self Review | pendingSelf | `pending_self` | yellow |
| Pending Manager Review | pendingManager | `pending_manager` | amber |
| Pending Skip Manager Review | pendingSkip | `pending_skip` | orange |
| Pending HR PMS | inReview count=0 for Feb | `pending_hr` | purple |
| In Review (HR PMS) | inReview | `in_review` | purple |
| Reviewed | forwarded | `reviewed` | green |
| Total KPIs | totalKpis | — | blue |

Wait — the user said "correct existing HR PMS tile" meaning the current "Pending Review" tile should show only KPIs actually at `hr_pms_review` stage or just before it (not the broad sum). Since `In Review` already covers `hr_pms_review`, the corrected "Pending Review" for HR PMS should be 0 for Feb (no KPIs at stages immediately before HR PMS that HR PMS can act on). 

Simplified tile layout (7 tiles):

| # | Label | Value | Filter | Color |
|---|-------|-------|--------|-------|
| 1 | Total Employees | totalEmployees | `all` | primary |
| 2 | Pending Self Review | pendingSelf | `pending_self` | yellow |
| 3 | Pending Manager Review | pendingManager | `pending_manager` | amber |
| 4 | Pending Skip Mgr Review | pendingSkip | `pending_skip` | orange |
| 5 | In HR PMS Review | inReview | `in_review` | purple |
| 6 | HR PMS Reviewed | forwarded | `reviewed` | green |
| 7 | Total KPIs | totalKpis | — | blue |

The old broad "Pending Review" tile is removed — replaced by the 3 granular sub-stage tiles.

#### 3. Employee list filter (line 415-432)
Add 3 new filter branches for the new tile filters:

```typescript
} else if (viewLevel === 'hr_pms') {
  if (statusFilter === 'pending_self' && kpi.status === 'self_review') {
    employeeIds.add(kpi.employee_id);
  } else if (statusFilter === 'pending_manager' && kpi.status === 'manager_check') {
    employeeIds.add(kpi.employee_id);
  } else if (statusFilter === 'pending_skip' && kpi.status === 'skip_level_check') {
    employeeIds.add(kpi.employee_id);
  } else if (statusFilter === 'in_review' && kpi.status === 'hr_pms_review') {
    employeeIds.add(kpi.employee_id);
  } else if (statusFilter === 'reviewed') {
    // existing logic for after hr_pms_review
  }
}
```

Remove the old broad `pending` filter for HR PMS.

### No other files changed. No database changes needed.

