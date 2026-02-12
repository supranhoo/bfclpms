

# Fix: Password Rollout Times Out for Large Batches

## Root Cause Analysis (RCA)

The edge function log shows:
```
Http: connection closed before message completed
```

The function processes **63 users sequentially** in a single request:
1. For each user: generate password, call `auth.admin.updateUserById()`, then call the `send-email-notification` function
2. Each iteration involves 2-3 network round-trips (auth update + email HTTP call + audit log insert)
3. With 63 users, this easily exceeds the edge function timeout (typically ~60 seconds)
4. The connection drops mid-processing, the client gets "Failed to fetch", and partial results may have been applied without the caller knowing which succeeded

## Corrective Action (CAPA)

### Strategy: Process in Batches with Parallel Execution

Instead of sequential processing, use `Promise.all` with a concurrency-limited batch approach:

1. **Split users into chunks of 5** (safe concurrency for auth admin calls)
2. **Process each chunk in parallel** using `Promise.allSettled`
3. **Log results as they complete** rather than at the end

### Code Changes

**File: `supabase/functions/password-rollout/index.ts`**

Replace the sequential `for...of` loop with batched parallel processing:

```typescript
// Process in batches of 5
const BATCH_SIZE = 5;
for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
  const batch = profiles.slice(i, i + BATCH_SIZE);
  const batchResults = await Promise.allSettled(
    batch.map(profile => processOneUser(profile, ...))
  );
  // collect results from each settled promise
}
```

This reduces total execution time from ~63 sequential calls to ~13 batched rounds, well within the timeout limit.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/password-rollout/index.ts` | Refactor sequential loop to batched parallel processing (chunks of 5) |
| `DOCUMENTATION.md` | Document the batched processing pattern |

## Expected Result

After this fix, password rollout for 63+ users completes within the timeout window. Each batch of 5 users processes in parallel, reducing total time by roughly 5x.

