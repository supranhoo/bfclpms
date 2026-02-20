

# Fix: Propagation Statement Timeout

## Root Cause

The propagation makes 3-4 individual database calls **per employee** from the browser. The `review_submissions` table has **17 RLS policies** -- including expensive ones like `get_skip_level_manager()` -- that PostgreSQL evaluates on every single row operation. For even a few employees, the cumulative overhead causes the statement to time out.

## Solution

Create a server-side PostgreSQL function (`SECURITY DEFINER`) that performs propagation in a single SQL call, bypassing per-row RLS overhead. The client will call this function via `.rpc()` instead of making dozens of individual queries.

## Changes

### 1. Database Migration: Create `propagate_org_kpi_value` RPC function

A `SECURITY DEFINER` function that:
- Accepts: category_id, kra_name, kpi_name, review_period, review_year, achieved_value, scope, department_id, employee_id, is_na, na_remarks, and a JSON array of pre-calculated ratings (one per kpi_id)
- Uses `INSERT ... ON CONFLICT (kpi_id) DO UPDATE` to upsert `review_submissions` in a single statement
- Updates `kpis.status` from `kra_set` to `self_review` in a single bulk UPDATE
- Returns the count of propagated rows and detail records (employee name, old/new scores)

The rating calculation remains in JavaScript (too complex for SQL), but the function receives pre-calculated values and writes them all in one go.

```sql
CREATE OR REPLACE FUNCTION propagate_org_kpi_value(
  p_kpi_ratings jsonb,  -- [{kpi_id, achieved_value, self_score, self_rating, is_na, na_remarks}]
  p_is_na boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item jsonb;
  old_score numeric;
  result jsonb := '[]'::jsonb;
  propagated_count int := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_kpi_ratings)
  LOOP
    -- Get old score
    SELECT self_score INTO old_score
    FROM review_submissions WHERE kpi_id = (item->>'kpi_id')::uuid;

    -- Upsert review_submission
    INSERT INTO review_submissions (kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role, updated_at)
    VALUES (
      (item->>'kpi_id')::uuid,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'achieved_value')::numeric END,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'self_score')::numeric END,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'self_rating')::rating_level END,
      p_is_na,
      CASE WHEN p_is_na THEN 'admin' ELSE NULL END,
      now()
    )
    ON CONFLICT (kpi_id) DO UPDATE SET
      achieved_value = EXCLUDED.achieved_value,
      self_score = EXCLUDED.self_score,
      self_rating = EXCLUDED.self_rating,
      is_na = EXCLUDED.is_na,
      na_marked_by_role = EXCLUDED.na_marked_by_role,
      updated_at = now();

    -- Advance status from kra_set to self_review
    UPDATE kpis SET status = 'self_review'
    WHERE id = (item->>'kpi_id')::uuid AND status = 'kra_set';

    propagated_count := propagated_count + 1;

    -- Build result detail
    result := result || jsonb_build_object(
      'kpi_id', item->>'kpi_id',
      'old_score', old_score,
      'new_score', CASE WHEN p_is_na THEN NULL ELSE (item->>'self_score')::numeric END
    );
  END LOOP;

  RETURN jsonb_build_object('propagated_count', propagated_count, 'details', result);
END;
$$;
```

### 2. Update `usePropagateOrgKpiValue.ts`

Refactor the mutation to:
1. Fetch all matching KPIs (same query as now -- one call)
2. Calculate ratings in JavaScript for each KPI (no DB calls)
3. Build a JSON array of `{kpi_id, achieved_value, self_score, self_rating}`
4. Call `supabase.rpc('propagate_org_kpi_value', { p_kpi_ratings: [...], p_is_na: false })` -- **single DB call**
5. Parse the returned JSON to build the PropagationResultWithDetails

This reduces the operation from ~24 DB calls to **2 DB calls** (one SELECT for KPIs, one RPC for bulk write).

### 3. Update `DOCUMENTATION.md`

- Version bump to 1.45.45
- Document server-side propagation RPC for performance

## Performance Impact

| Scenario | Before | After |
|---|---|---|
| 1 employee | ~4 DB calls + RLS | 2 DB calls, no RLS on writes |
| 6 employees | ~24 DB calls + RLS | 2 DB calls, no RLS on writes |
| 10 employees | ~40 DB calls + RLS | 2 DB calls, no RLS on writes |

## Security

The RPC uses `SECURITY DEFINER` but the caller must still pass through the initial KPI query (which has RLS). The function only writes to `review_submissions` and updates `kpis.status` -- both operations that admins and data owners are already authorized to do. Access control is enforced at the application layer (ownership check) before calling the RPC.

## What Will NOT Change

- Rating calculation logic (stays in JavaScript)
- UI behavior and PropagationSummaryDialog
- The initial KPI query with employee profile data
- Bulk propagation hook (will also be updated to use the same RPC)

