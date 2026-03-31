

## Plan: Fix Query Raised Email Showing "N/A" — Duplicate Notification + Wrong Metadata Key

### Root Cause

There are **two code paths** creating `query_raised` notifications — causing duplicates AND the email showing "N/A":

1. **DB trigger `notify_on_query_raised`** (from migration `20260105...`) — fires on every `kpi_queries` INSERT. Creates a notification with:
   - `metadata: { query_id, reason }` — uses key **`reason`**, not `query_reason`
   - Raw `kpi_name` (no first-line truncation — includes formula/scoring)
   
2. **Frontend `useRaiseQuery`** (useKpis.ts line 938) — also creates a notification with:
   - `metadata: { query_id, query_reason }` — correct key
   - Truncated KPI name — correct

The DB trigger's notification is the one that fires the email (via `send_email_on_notification`), and since it uses `reason` not `query_reason`, the email trigger reads `NEW.metadata->>'query_reason'` → gets `null` → email shows "Query: N/A".

Evidence from logs:
```
notification 71fec707 (trigger):  metadata = { query_id, reason: "testing 2" }     ← wrong key
notification 3f123501 (frontend): metadata = { query_id }                          ← old build, but even new build = { query_id, query_reason }
```

### Fix

**Option chosen: Fix the DB trigger + remove the frontend duplicate.**

The DB trigger is more reliable (runs server-side, can't be skipped). We fix it to:
- Use `query_reason` as the metadata key (matching what the email trigger reads)
- Truncate KPI name to first line
- Remove the duplicate notification insert from `useRaiseQuery` in `useKpis.ts`

### Changes

**1. Database migration** — Replace `notify_on_query_raised()` function:
```sql
CREATE OR REPLACE FUNCTION public.notify_on_query_raised()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_kpi_name TEXT;
  v_raiser_name TEXT;
BEGIN
  SELECT LEFT(SPLIT_PART(COALESCE(kpi_name, ''), E'\n', 1), 80) INTO v_kpi_name
  FROM public.kpis WHERE id = NEW.kpi_id;

  SELECT COALESCE(full_name, email) INTO v_raiser_name
  FROM public.profiles WHERE id = NEW.raised_by;

  INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
  VALUES (
    NEW.raised_to,
    'query_raised',
    'New Query Raised',
    v_raiser_name || ' raised a query on "' || COALESCE(v_kpi_name, 'a KPI') || '": ' || LEFT(NEW.reason, 120),
    NEW.kpi_id,
    NEW.raised_by,
    jsonb_build_object('query_id', NEW.id, 'query_reason', NEW.reason)
  );
  RETURN NEW;
END;
$$;
```

**2. `src/hooks/useKpis.ts`** — Remove the duplicate notification insert from `useRaiseQuery` mutationFn (lines 930-946). Keep the audit log insert.

**3. `DOCUMENTATION.md`** — v2.15.17 changelog

**4. `POLICY.md`** — Add invariant: query_raised notifications must only be created by the DB trigger (single source)

### Files Modified

| File | Change |
|------|--------|
| DB migration | Fix `notify_on_query_raised()` — use `query_reason` key, truncate KPI name |
| `src/hooks/useKpis.ts` | Remove duplicate notification insert from `useRaiseQuery` |
| `DOCUMENTATION.md` | v2.15.17 |
| `POLICY.md` | Single-source notification invariant |

### Risk Assessment
- **Regression**: Zero — removes a duplicate; the DB trigger now produces the correct notification
- **Data**: Existing notifications unchanged; only new ones affected
- **Performance**: Slightly better — one fewer DB insert per query raised

