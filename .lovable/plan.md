

# Fix: Manager Cannot See Skip-Level Dashboard (RLS Policy Gap)

## Root Cause

The `profiles` table has an RLS policy for managers that only allows viewing **direct reports**:

```text
Policy: "Managers can view their direct reports"
Condition: reporting_manager_id = auth.uid()
```

The skip-level feature needs managers to also see their **indirect reports** (employees who report to their direct reports). The `useSkipLevelTeamMembers` hook does a two-step query:

1. Step 1: Fetch direct reports (`reporting_manager_id = Jaspal`) -- RLS allows this
2. Step 2: Fetch employees reporting to those direct reports (`reporting_manager_id IN [direct_report_ids]`) -- **RLS BLOCKS this** because these employees' `reporting_manager_id` is NOT Jaspal's ID

When Jaspal had the `admin` role, the "Admins can view all profiles" policy let both queries succeed. Now with only the `manager` role, step 2 returns zero rows, so the skip-level tab never appears.

## Fix

Add a new RLS SELECT policy on the `profiles` table that allows managers to view their skip-level subordinates (employees whose manager reports to them).

### New RLS Policy

```text
Policy name: "Managers can view skip-level reports"
Table: profiles
Operation: SELECT
Condition:
  The row's reporting_manager_id is in the set of profile IDs
  whose reporting_manager_id equals auth.uid()
```

In SQL terms:

```text
CREATE POLICY "Managers can view skip-level reports"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND reporting_manager_id IN (
      SELECT id FROM public.profiles
      WHERE reporting_manager_id = auth.uid()
    )
  );
```

This policy says: "If you are a manager, you can see any profile whose reporting manager is one of your direct reports." This is exactly the skip-level relationship.

### Why This Is Safe

- Only extends visibility one additional level down (not full org tree)
- Only applies to users with the `manager` role
- Uses the existing `has_role()` security-definer function (no recursion risk)
- The subquery `SELECT id FROM profiles WHERE reporting_manager_id = auth.uid()` is allowed because it matches the existing "Managers can view their direct reports" policy

## Files to Modify

| File | Change |
|---|---|
| Database migration | Add new RLS policy for skip-level profile visibility |
| `DOCUMENTATION.md` | Document the RLS policy addition |

## Risk Assessment
- **Low risk**: Additive policy only (does not modify existing policies)
- **Security**: Scoped strictly to one level below direct reports
- **No code changes**: The frontend hook `useSkipLevelTeamMembers` already works correctly; it was just being blocked by RLS

