

## RCA: Employee 100386 Not Shown + Missing Employees

### Finding 1: Employee 100386 Does Not Exist in the System
Employee code **100386** has **no auth user** and **no profile record** anywhere in the database. The import either:
- Was never attempted (row was skipped due to validation error)
- Failed and the error was dismissed/not noticed in the import results

**Action needed from you**: Re-import this employee. If a validation error appears, that will reveal why it was skipped originally.

### Finding 2: 6 Employees Have Auth Users But No Profiles (Orphaned)
These employees were created in the authentication system but their profile records were never written. This is the "auth created, profile upsert failed" bug in the `create-employee` edge function — the upsert error is logged but the function still returns HTTP 200, so the import reports "success" even though the profile is missing.

| Employee Code | Name | Email |
|---|---|---|
| 100003 | Bishnu Prasad Upadhaya | bishnu@bfclalloys.com |
| 100275 | Shambhu Kumar | rockingraja7870@gmail.com |
| 101126 | Sunehri Yadav | sunehribhanker@gmail.com |
| 101655 | Pratik Raj Srivastava | srivastavapratik592@gmail.com |
| 200209 | Akshata Anant Shet | shetanant@yahoo.com |
| 200302 | Poonam Anil Kumar | poonam.pathak204@gmail.com |

Plus 4 test accounts (admin@test.com, vivek@test.com, admin@test.in, ankit.choudhary@bfclalloys.com) — these can be ignored.

### Root Cause: Silent Profile Upsert Failure
In `supabase/functions/create-employee/index.ts` line 172-174:
```typescript
if (upsertError) {
  console.error('Failed to upsert profile:', upsertError)
  // ← BUG: does NOT return an error response, falls through to fetch
}
```
The function logs the error but continues. The subsequent `select` on line 177 then fails too (no profile exists), but this may also be swallowed depending on timing.

### Fix Plan

#### 1. Fix `create-employee` to fail on profile upsert error
Return HTTP 500 instead of continuing when the profile upsert fails. This ensures the import correctly reports the row as failed.

#### 2. Repair the 6 orphaned employees
Create a migration that inserts profile records for the 6 orphaned auth users using data from their `raw_user_meta_data`.

#### 3. Add orphan detection to import results
After the import batch completes, do a quick check to verify all "successful" rows actually have profiles, and flag any that don't.

### Files Changed
| File | Action |
|---|---|
| `supabase/functions/create-employee/index.ts` | Return error response on profile upsert failure |
| Migration SQL | Insert profiles for 6 orphaned auth users |

### Risk Assessment
- **Data**: Additive — inserts missing profiles, no existing data modified
- **Regression**: Low — making a silent failure loud is strictly safer
- **Security**: No change

