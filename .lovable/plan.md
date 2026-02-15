

# Plan: Add Auditors to Eligible Login Users

## Problem

The `eligible_login_users` database view only includes users who have KRAs assigned or are reporting managers of employees with KRAs. Users with the **Auditor** role are excluded, meaning they cannot receive login credentials via the Password Rollout feature.

## Solution

Update the `eligible_login_users` view to include a third eligibility source: users with the `auditor` role in the `user_roles` table. Also update the UI filter to include the new eligibility type.

## Changes

### 1. Database Migration -- Recreate the View

Add a new CTE `is_auditor` that selects user IDs from `user_roles` where `role = 'auditor'`. Extend the CASE expression and WHERE clause accordingly.

```text
New eligibility_type values:
- "has_kras"          -- has KRAs assigned
- "reporting_manager" -- manages employees with KRAs
- "auditor"           -- has auditor role
- "both"              -- has KRAs AND is a manager (existing)
```

The updated view logic:

```text
WITH has_kras AS (
  SELECT DISTINCT employee_id AS id FROM kpis
),
is_manager AS (
  SELECT DISTINCT p.reporting_manager_id AS id
  FROM profiles p
  WHERE p.reporting_manager_id IS NOT NULL
    AND p.id IN (SELECT employee_id FROM kpis)
),
is_auditor AS (
  SELECT DISTINCT user_id AS id
  FROM user_roles
  WHERE role = 'auditor'
)
SELECT pr.id, pr.full_name, pr.email, pr.employee_code,
       pr.designation, pr.department_id,
       CASE
         WHEN hk.id IS NOT NULL AND im.id IS NOT NULL THEN 'both'
         WHEN hk.id IS NOT NULL THEN 'has_kras'
         WHEN im.id IS NOT NULL THEN 'reporting_manager'
         ELSE 'auditor'
       END AS eligibility_type
FROM profiles pr
LEFT JOIN has_kras hk ON hk.id = pr.id
LEFT JOIN is_manager im ON im.id = pr.id
LEFT JOIN is_auditor ia ON ia.id = pr.id
WHERE hk.id IS NOT NULL OR im.id IS NOT NULL OR ia.id IS NOT NULL;
```

### 2. UI Update -- `PasswordPolicyTab.tsx`

Add "Auditor" as a filter option in the eligibility dropdown and add a badge variant for the `auditor` type.

| Change | Detail |
|---|---|
| SelectItem | Add `<SelectItem value="auditor">Auditor</SelectItem>` |
| `eligibilityBadge` | Add case for `'auditor'` returning a badge |

### 3. Hook Update -- `usePasswordRollout.ts`

Add `'auditor'` to the `EligibleUser.eligibility_type` union type.

### 4. Documentation

Update `DOCUMENTATION.md` with the change.

## Files Changed

| File | Change |
|---|---|
| Migration SQL | Recreate `eligible_login_users` view with auditor CTE |
| `src/components/admin/PasswordPolicyTab.tsx` | Add auditor filter option and badge |
| `src/hooks/usePasswordRollout.ts` | Extend eligibility type union |
| `DOCUMENTATION.md` | Document the change |

