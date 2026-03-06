

# Fix: Role Permission Matrix "Restricted" Status Logic

## Problem

The screenshot shows every non-admin role as "Restricted" even though all operational permissions (Edit KPI, Self Review, Manager Review, etc.) are enabled. The cause is in the restriction check logic:

```typescript
const isRestricted = PERMISSION_KEYS.some(k => !perms[k]);
```

Since `view_only` defaults to `false` (which is correct — you *don't* want view-only mode), this check treats it as a restriction. Every role where `view_only` is off gets flagged as "Restricted", which is misleading.

## Fix

Change the restriction check to exclude `view_only` from the calculation. A role should only be considered "Restricted" if any *operational* permission is disabled. `view_only` is a special flag — when it's `true`, it *restricts* access; when `false`, it means full access.

### File: `src/components/admin/ReviewPeriodRolePermissions.tsx`

Update the restriction logic in two places (the `handleSave` function and the render):

```typescript
// Exclude view_only from restriction check — false means "not restricted"
const OPERATIONAL_KEYS = PERMISSION_KEYS.filter(k => k !== 'view_only');
const isRestricted = OPERATIONAL_KEYS.some(k => !perms[k]) || !!perms['view_only'];
```

This means a role is "Restricted" if:
- Any operational permission (edit_kpi, submit_self_review, etc.) is turned OFF, **OR**
- `view_only` is turned ON

Otherwise it shows "Full Access".

No other files modified. No database changes.

