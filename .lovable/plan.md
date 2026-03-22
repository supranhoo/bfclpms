

## Root Cause Analysis: Pending Manager/Skip-Level Review Shows 0

### Problem
The "Pending Manager Review" and "Pending Skip-Level Review" tabs show 0 KPIs despite many being pending.

### Root Cause: Wrong Status Filters

The workflow status represents the **completed stage**, not the pending one:
- `kra_set` → employee needs to self-review
- `self_review` → manager needs to review
- `manager_check` → skip-level needs to review

The hooks are filtering on the **wrong status values**:

| Tab | Current (wrong) | Correct |
|-----|-----------------|---------|
| Pending Manager Review | `manager_check` (line 150) | `self_review` |
| Pending Skip-Level Review | `skip_level_check` (line 1056) | `manager_check` |

### Fix

#### File: `src/hooks/usePendingSelfReviews.ts`

**1. Line 150** — Change `useOverdueTeamReviewKpis` status filter:
```typescript
// FROM:
.eq('status', 'manager_check')
// TO:
.eq('status', 'self_review')
```

**2. Line 1056** — Change `useOverdueSkipLevelKpis` status filter:
```typescript
// FROM:
.eq('status', 'skip_level_check')
// TO:
.eq('status', 'manager_check')
```

### No database changes needed

