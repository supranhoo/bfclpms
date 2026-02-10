

# Fix: Slow Employee Import + Admin Profile Overwrite Bug

## Problems Found

### 1. Slow Import (main complaint)
Each employee is created via a **sequential** `for...of await` loop, making one HTTP call at a time to the backend function. Each call takes ~3 seconds (auth user creation + profile update). For 100 employees, this means **~5 minutes of waiting**.

### 2. Critical Bug: Admin Profile Being Overwritten
The network responses show that every `create-employee` call returns the **admin's profile ID** and overwrites the admin's name, employee code, and department with each imported employee's data. This means:
- No new employees are actually being created as separate users
- The admin account gets corrupted with the last imported employee's data

The root cause is the `listUsers` filter syntax in the edge function. The filter `email.eq.${email}` does not work as expected with the Supabase Admin API — it likely returns all users (including the admin) instead of filtering properly, causing the function to think the auth user already exists.

## Solution

### Part A: Fix the `create-employee` Edge Function
- Replace the broken `listUsers` filter with a direct lookup using `getUserByEmail` or a corrected filter approach
- This prevents false matches that cause the admin profile overwrite

### Part B: Add Batch Concurrency to Employee Import
- Replace the sequential `for...of await` loop with a **batched parallel** approach
- Process employees in batches of 5 concurrently (not all at once, to avoid rate limits)
- This reduces import time from ~5 minutes to ~1 minute for 100 employees
- Add a progress indicator showing "Processing 15/100..."

### Part C: Add a Bulk Import Edge Function (optional optimization)
- Create a `bulk-create-employees` edge function that accepts an array of employees
- Process all employees server-side in a single HTTP call
- This eliminates per-employee network overhead entirely

## Recommended Approach: Part A + Part B

Part C is the fastest but adds more complexity. Parts A and B together will fix both the bug and reduce import time to ~1 minute, which is acceptable.

## Technical Details

### Edge Function Fix (`supabase/functions/create-employee/index.ts`)
- Remove the `listUsers` call with the broken filter
- Use `supabase.auth.admin.getUserById` after looking up by email in a more reliable way, or query `auth.users` table directly via the admin client
- Alternatively, try creating the user and catch the "already exists" error as the check

### Import Loop Fix (`src/pages/admin/ImportData.tsx`)
- Replace:
```text
for (const row of employeeData) {
  await supabase.functions.invoke('create-employee', ...);
}
```
- With a batched approach that processes 5 employees concurrently using `Promise.all` on sliced chunks
- Add progress state to show import progress in the UI

### Files to Change
1. `supabase/functions/create-employee/index.ts` — fix auth user lookup logic
2. `src/pages/admin/ImportData.tsx` — add batch concurrency + progress indicator
3. `DOCUMENTATION.md` — update with changes

