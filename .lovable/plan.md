

# Fix: Employee Import Logs Out Admin

## Problem

The employee import on `ImportData.tsx` (line 1152) uses `supabase.auth.signUp()` from the browser. This is the regular signup method -- it creates a new user **and switches the active session to that new user**, logging the admin out. Since it runs in a loop for every employee row, the admin gets logged out on the very first new user creation.

## Root Cause

```
supabase.auth.signUp({ email, password })  // <-- THIS switches the session
```

The `signUp` method is designed for self-registration -- it authenticates the new user immediately. It should never be used for bulk provisioning.

## Solution

Replace the client-side `signUp` call with a call to the **existing** `create-employee` edge function, which already uses `supabase.auth.admin.createUser()` server-side. This creates users without affecting the admin's session.

The edge function already handles:
- Creating auth users with random passwords
- Auto-confirming placeholder accounts
- Creating/updating profiles
- Deduplication by employee code and email

## Changes

### File: `src/pages/admin/ImportData.tsx`

**In `handleEmployeeImport` function (around lines 1146-1214):**

Replace the entire "Create new user" block that uses `supabase.auth.signUp()` with a call to the `create-employee` edge function:

1. Get the admin's auth token once before the loop (same pattern already used in KPI import on line 803)
2. Replace `supabase.auth.signUp(...)` with `fetch('create-employee', { ... })` passing employee_code, full_name, email, designation, department_id, pms_grade, reporting_manager_id
3. Remove the 500ms sleep (`await new Promise(resolve => setTimeout(resolve, 500))`) -- not needed since the edge function handles profile creation synchronously
4. Keep the role assignment logic after the edge function returns the new user ID
5. Remove the separate profile update call since the edge function already sets all profile fields

### File: `DOCUMENTATION.md`

Update the employee import section to note that bulk creation uses the backend function (not client-side signup).

## What Stays the Same

- The "update existing employee" path (line 1121-1145) -- this is fine, it only updates profiles
- The manager auto-promotion logic (second pass, lines 1235-1288) -- unaffected
- The `create-employee` edge function itself -- no changes needed
- The KPI import flow -- already uses the edge function correctly

