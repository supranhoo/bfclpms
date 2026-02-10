

# Fix: Admin Profile Overwrite Bug (Root Cause)

## Problem

The admin profile (Ankit Choudhary) keeps getting overwritten with imported employee data. Two bugs remain:

1. **Employee code collision (PRIMARY)**: The function looks up existing profiles by `employee_code` (line 85-89). If the admin's profile already has an employee code matching an imported employee (from a previous bad run), it overwrites the admin's name, department, etc.

2. **Broken listUsers loop (SECONDARY)**: The fallback user lookup (lines 114-125) paginates through ALL auth users, which is slow and unreliable.

## Fix (3 changes)

### 1. Restore Admin Profile (immediate database fix)
Run SQL to restore the admin's correct data:
```
UPDATE profiles 
SET full_name = 'Ankit Choudhary', 
    employee_code = NULL,
    designation = NULL,
    department_id = NULL,
    pms_grade = NULL,
    level = NULL,
    reporting_manager_id = NULL
WHERE id = '535d9a14-e4aa-4676-af92-f535373ffc8d';
```

### 2. Protect admin in edge function
Add an explicit guard in `create-employee/index.ts`: when the employee_code lookup at line 85-89 finds a profile, check if it's the admin ID. If so, skip the update and create a new user instead.

```
const ADMIN_ID = '535d9a14-e4aa-4676-af92-f535373ffc8d'

if (existingProfile && existingProfile.id !== ADMIN_ID) {
  // safe to update
} else if (existingProfile && existingProfile.id === ADMIN_ID) {
  // skip -- do NOT overwrite admin, proceed to create new user
}
```

### 3. Replace broken listUsers with direct approach
Remove the slow pagination loop (lines 114-125). Instead, when `createUser` fails with "already exists", look up the user in the `profiles` table by email. If not found there either, return a clear error. This is faster and avoids the admin-matching bug entirely.

## Files to Change
1. `supabase/functions/create-employee/index.ts` -- add admin guard + fix user lookup
2. `DOCUMENTATION.md` -- update with fix details

## Expected Result
- Admin profile is never overwritten regardless of imported data
- Duplicate email handling is faster and reliable
- Import continues to work correctly for all other employees
