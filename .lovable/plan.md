

# Grant Full Report Data to Users with Download Overrides

## Problem

Currently, when an admin grants a user (e.g., a manager) download access to a report via User-Level Overrides, that user can navigate to the report page and see the download button -- but the **data** they see is still limited to their team. This is because Row Level Security (RLS) on the `kpis`, `review_submissions`, and `profiles` tables restricts managers to only their direct reports.

The override should grant access to the **complete** report, not just team-scoped data.

## Solution

Add a database-level security definer function and new RLS SELECT policies so that users with an active override in `report_access_user_overrides` can read all rows from the tables that power reports.

## Changes

### 1. Database Migration

**Create a security definer function:**

```sql
CREATE OR REPLACE FUNCTION public.has_report_access_override(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.report_access_user_overrides
    WHERE user_id = _user_id
      AND (can_view = true OR can_download = true)
  )
$$;
```

**Add RLS policies on the 3 key tables:**

- `kpis` -- new SELECT policy: users with any report override can view all KPIs
- `review_submissions` -- new SELECT policy: same pattern
- `profiles` -- new SELECT policy: same pattern

```sql
-- KPIs: full SELECT for override users
CREATE POLICY "Report override users can view all KPIs"
  ON public.kpis FOR SELECT TO authenticated
  USING (public.has_report_access_override(auth.uid()));

-- Review submissions: full SELECT for override users
CREATE POLICY "Report override users can view all submissions"
  ON public.review_submissions FOR SELECT TO authenticated
  USING (public.has_report_access_override(auth.uid()));

-- Profiles: full SELECT for override users
CREATE POLICY "Report override users can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_report_access_override(auth.uid()));
```

### 2. No Frontend Changes Required

The existing `useReportAccess` hook already gates navigation and the download button. The RLS change ensures data flows through automatically once the override exists.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data | Low | Override is explicitly granted by admin; function uses SECURITY DEFINER to avoid recursion |
| Security | Low | Read-only (SELECT) policies only; no INSERT/UPDATE/DELETE granted |
| Performance | Minimal | `has_report_access_override` is a simple EXISTS check; Postgres will cache the plan |
| Regression | None | Existing policies remain untouched; new policies are additive (permissive) |

## Files Changed

| File | Change |
|------|--------|
| New migration SQL | Create `has_report_access_override` function + 3 new SELECT RLS policies |
| `DOCUMENTATION.md` | Document that user-level report overrides grant full data scope |

