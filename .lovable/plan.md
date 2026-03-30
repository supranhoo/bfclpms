

## Fix: Error When Editing Observation — `mentionedUserIds` Not a DB Column

### Root Cause

In `AddObservationDialog.tsx` line 112, the edit path includes `mentionedUserIds` in the submitted object (cast via `as any`). This flows to `useUpdateObservation`, which destructures `{ id, ...updates }` and passes `updates` directly to `supabase.update()`. Since `mentionedUserIds` is not a database column, Supabase rejects it with the schema cache error.

Same issue applies to `evidence_urls` — the dialog sends it but `UpdateObservationInput` doesn't include it, so it's only passed through via `as any`.

### Fix

**File: `src/hooks/useKpiObservations.ts`**

1. Add `mentionedUserIds` and `evidence_urls` as optional fields on `UpdateObservationInput` (for type safety)
2. In `useUpdateObservation.mutationFn`, strip `mentionedUserIds` from the object before sending to Supabase, similar to how `useCreateObservation` does `const { mentionedUserIds, ...insertData } = input`
3. After the update succeeds, process mention notifications (reuse the same notification logic from create)

```typescript
// In useUpdateObservation mutationFn:
const { id, mentionedUserIds, ...updates } = input;
// Now 'updates' is clean for Supabase
```

**File: `src/hooks/useKpiObservations.ts` — `UpdateObservationInput`**

Add optional fields:
- `mentionedUserIds?: string[]`
- `evidence_urls?: string[]`

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useKpiObservations.ts` | Strip `mentionedUserIds` before DB update; add mention notification logic to update path; add missing fields to `UpdateObservationInput` |
| `DOCUMENTATION.md` | v2.15.3 changelog |

### Risk Assessment
- **Regression**: Zero — purely fixes a broken path
- **Scope**: Single file fix, no schema changes needed

