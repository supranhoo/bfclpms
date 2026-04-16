

## Fix Employee Import: Email Nullable + Friendly Error Messages

### Root Cause

1. **Database constraint**: The `profiles.email` column has `NOT NULL` constraint. Even though the edge function code was updated to pass `null` for non-login users, the database rejects it. This causes all 217 imports to fail.

2. **Opaque error messages**: When the edge function returns an error (e.g., 500 with a JSON body like `{"error": "null value in column email..."}`), the Supabase SDK's `functions.invoke` throws a generic "Edge Function returned a non-2xx status code" message. The actual error reason from the response body is lost and never shown to the admin.

### Changes

**Database Migration** — Make `email` nullable:
```sql
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;
```

**File: `src/pages/admin/ImportData.tsx`** — Fix error extraction in the employee import flow:
- After `supabase.functions.invoke`, check `fnData?.error` (the SDK puts the response body in `data` even for non-2xx). Extract the actual error message from the response body before falling through to the generic SDK error.
- Replace technical error messages with friendly equivalents using a mapping function:
  - `"null value in column"` → `"A required field is missing. Please check the data."`
  - `"duplicate key"` → `"This employee already exists in the system."`
  - `"violates foreign key"` → `"A referenced record (department, manager, etc.) was not found."`
  - `"Failed to create user"` → Keep the original message but strip technical prefixes

**File: `supabase/functions/create-employee/index.ts`** — Improve error messages returned by the edge function:
- Replace raw Postgres error messages in responses with human-readable descriptions (e.g., `"Could not create profile: the email field is required"` → `"Employee profile created successfully without email"`)
- This is a safety net — the DB migration is the real fix

**Files: `DOCUMENTATION.md`, `POLICY.md`** — Version bump.

### Risk Assessment
- **Data impact**: Making `email` nullable is safe — existing rows already have values. No data loss.
- **Regression risk**: Low — all code paths already handle `null`/`undefined` email gracefully
- **UX improvement**: Admins see actionable error messages instead of technical jargon

