

# Root Cause: `view_only` Permission Semantic Inversion

## Problem Identified
The `check_review_period_permission` database function returns `true` by default for ALL actions when no locks exist — including `view_only`. But `view_only = true` has **inverted semantics**: it means "this period IS view-only" (restrictive), unlike other permissions where `true` means "action is allowed" (permissive).

**Proof**: For Samir viewing March 2026 (which has zero locks):
- `submit_self_review` → `true` (correct: allowed)
- `edit_kpi` → `true` (correct: allowed)  
- `view_only` → `true` (**BUG**: means "period is view-only", should be `false`)

This makes `govPerms.view_only = true`, which triggers `isGovernanceLocked = true` in the SelfReviewSheet, making ALL KPIs read-only for ALL employees in any period without explicit locks.

The daily bypass (`isDailyUnlocked`) in the code IS correct and WOULD cancel this out, but the `govPerms.view_only = true` overrides it because the condition is: `!govPerms.submit_self_review || govPerms.view_only` — the second part is `true`, so even with `submit_self_review = true`, the whole expression evaluates to `true`.

## Fix

### 1. Database Migration — Fix the RPC default for `view_only`
Modify `check_review_period_permission` to return `false` (not `true`) when `p_action = 'view_only'` and no locks apply. This is the correct semantic: "by default, the period is NOT view-only."

Add at the end of the function, before the final `RETURN true;`:
```sql
-- view_only is semantically inverted: true = restrictive
-- Default should be false (period is NOT view-only)
IF p_action = 'view_only' THEN
  RETURN false;
END IF;

RETURN true;
```

### 2. No frontend changes needed
The `SelfReviewSheet` bypass logic and `KpiHeaderSection` badge logic are both correct — they just receive the wrong `view_only` value from the RPC. Once the RPC is fixed, everything works.

## Risk Assessment
- **Data Impact**: No schema changes, only RPC logic fix
- **Regression Risk**: Low — only changes the default return for `view_only`. Periods WITH explicit locks are unaffected (the lock's `permissions.view_only` value is used directly)
- **Security**: Safer — currently the bug makes periods MORE restrictive than intended, so fixing it relaxes an incorrect restriction

