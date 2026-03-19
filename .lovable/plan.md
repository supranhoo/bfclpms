

## Fix: Incorrect "Linked KPIs" Count (Capped at 1000)

### Root Cause

The `useLinkedKpiCounts` hook fetches all KPIs with `source_template_id` set, but Supabase has a **default limit of 1000 rows per query**. With ~5,922 linked KPIs, the count is silently capped at 1000.

The same issue affects `useLinkedEmployees` — it also fetches without a row limit.

### Fix

Replace the client-side counting approach with a **server-side aggregation** using Supabase's `group by` capabilities, or use a paginated fetch. The most efficient approach:

**`useLinkedKpiCounts`**: Use an RPC or a batched fetch approach to get accurate counts. The simplest fix is to create a database view or use `.select('source_template_id', { count: 'exact', head: false })` with pagination to fetch all rows, OR create a lightweight RPC that returns `SELECT source_template_id, count(*) FROM kpis WHERE source_template_id IS NOT NULL GROUP BY source_template_id`.

**Recommended approach**: Create a database function `get_template_linked_counts()` that returns the grouped counts server-side (no row limit issue), and call it from the hook.

**`useLinkedEmployees`**: Add `.limit(10000)` or use batched fetching to handle templates with many linked employees.

### Files to Change

| File | Change |
|------|--------|
| **New migration** | Create `get_template_linked_counts()` RPC function |
| **`src/hooks/useKpiTemplates.ts`** | Update `useLinkedKpiCounts` to call the RPC; add `.limit()` to `useLinkedEmployees` |

### Technical Detail

The RPC function:
```sql
CREATE FUNCTION get_template_linked_counts()
RETURNS TABLE(template_id uuid, linked_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT source_template_id, count(*)
  FROM kpis
  WHERE source_template_id IS NOT NULL
  GROUP BY source_template_id;
$$;
```

This returns accurate counts regardless of row limits, and is far more efficient than fetching thousands of rows to the client just to count them.

