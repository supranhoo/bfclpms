

# Fix: Persistent "duplicate key value violates unique constraint" on Propagation

## Root Cause Analysis

The previous fix replaced check-then-insert with `.upsert({ ... }, { onConflict: 'kpi_id' })`. However, this still fails because of how PostgreSQL evaluates Row Level Security (RLS) during upsert operations:

1. PostgreSQL's `INSERT ... ON CONFLICT DO UPDATE` first attempts an INSERT
2. RLS `WITH CHECK` policies on INSERT are evaluated **before** the conflict detection
3. If the INSERT WITH CHECK passes but the row already exists, PostgreSQL detects the conflict and tries to DO UPDATE
4. However, certain RLS configurations can cause the conflict to surface as an error instead of being handled gracefully

Additionally, the upsert sends both `kpi_id` and an auto-generated `id` (since `id` has a default UUID). When the row already exists with a different `id` but the same `kpi_id`, the unique constraint on `kpi_id` fires.

## Fix: Try-Update-First, Fallback-to-Insert Pattern

Replace the upsert with a deterministic two-step approach:
1. **Try UPDATE first** (targeting `kpi_id` -- will affect 0 or 1 rows)
2. **If no rows updated** (count === 0), then INSERT

This avoids the upsert RLS issue entirely and is safe against race conditions because:
- If the row exists, UPDATE succeeds
- If the row doesn't exist, INSERT succeeds  
- If a concurrent insert happens between step 1 and 2, catch the error and retry as UPDATE

## Files to Change

| File | Change |
|---|---|
| `src/hooks/usePropagateOrgKpiValue.ts` | Replace `.upsert()` with update-first-then-insert pattern in both single and bulk mutation functions |
| `DOCUMENTATION.md` | Update the fix documentation |

## Technical Implementation

### New Pattern (in both mutationFn functions)

```typescript
// Step 1: Try update first
const { data: updated, error: updateError } = await supabase
  .from('review_submissions')
  .update({
    achieved_value: achievedValue,
    self_score: ratingResult.rating,
    self_rating: ratingLevel,
    updated_at: new Date().toISOString(),
  })
  .eq('kpi_id', kpi.id)
  .select('id')
  .maybeSingle();

if (updateError) throw updateError;

// Step 2: If no existing row, insert
if (!updated) {
  const { error: insertError } = await supabase
    .from('review_submissions')
    .insert({
      kpi_id: kpi.id,
      achieved_value: achievedValue,
      self_score: ratingResult.rating,
      self_rating: ratingLevel,
    });
  
  // If insert fails due to race condition (row was created between update and insert),
  // retry as update
  if (insertError?.code === '23505') {
    const { error: retryError } = await supabase
      .from('review_submissions')
      .update({
        achieved_value: achievedValue,
        self_score: ratingResult.rating,
        self_rating: ratingLevel,
        updated_at: new Date().toISOString(),
      })
      .eq('kpi_id', kpi.id);
    if (retryError) throw retryError;
  } else if (insertError) {
    throw insertError;
  }
}
```

This pattern is applied to both:
- `usePropagateOrgKpiValue` (single propagation, lines 131-141)
- `useBulkPropagateOrgKpiValues` (bulk propagation, lines 256-260)

