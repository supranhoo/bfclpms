

## RCA + CAPA: "user is not defined" in repair-stepped-back-siblings

### 1. Root Cause

After the auth refactor to use the shared `requireAdminUser(req)` helper, the function destructures only `adminClient` from the result:

```typescript
const auth = await requireAdminUser(req);
const supabase = auth.adminClient;
```

But on **line 381** and **line 474**, the audit log inserts reference a bare `user` variable that no longer exists:

```typescript
performed_by: user.id   // ← ReferenceError: user is not defined
```

The correct reference is `auth.user.id`. This is a simple variable-scope regression introduced when the inline auth code was replaced with the shared helper — the old code had `const user = ...` in scope, but the refactored code stores it under `auth.user`.

### 2. Impact

- All 6 repair attempts failed at the audit-log insert step (after the submission upsert and KPI status update succeeded or were attempted)
- The `try/catch` per-KPI catches the ReferenceError and reports it as `"user is not defined"`
- Zero repairs completed successfully despite the core repair logic being correct

### 3. Corrective Action

**In `supabase/functions/repair-stepped-back-siblings/index.ts`:**

Add a `user` alias after auth validation (line ~161):

```typescript
const supabase = auth.adminClient;
const user = auth.user;  // ← add this line
```

This fixes both line 381 (`performed_by: user.id`) and line 474 (`performed_by: user.id`).

### 4. Same bug check in repair-orphaned-propagations

Verify whether `repair-orphaned-propagations/index.ts` has the same pattern — if it references `user.id` after the shared-auth refactor, apply the same fix.

### 5. Preventive Action

- Add a TypeScript-level destructuring pattern to the shared auth helper usage so `user` is always in scope:
  ```typescript
  const { adminClient: supabase, user } = await requireAdminUser(req);
  ```
- Update `DOCUMENTATION.md` with the standard auth destructuring pattern for all admin edge functions.

### 6. Files to update

| File | Change |
|------|--------|
| `supabase/functions/repair-stepped-back-siblings/index.ts` | Add `const user = auth.user;` after line 161 |
| `supabase/functions/repair-orphaned-propagations/index.ts` | Same fix if applicable |
| `DOCUMENTATION.md` | Add standard destructuring pattern note |

### 7. Risk Assessment

- **Data impact**: None — the fix only affects variable scoping, no schema or data changes
- **Regression risk**: Zero — adding an alias cannot break existing code
- **Workflow impact**: None — restores intended functionality

