

# Fix: "type review_rating does not exist" in Reconcile RPC

## Root Cause Analysis

The dry-run (`p_dry_run = true`) succeeds because it never executes the UPDATE path. When the user clicks "Confirm & Reconcile" (`p_dry_run = false`), the function hits this line:

```sql
UPDATE review_submissions
SET final_rating = v_best_rating::review_rating,  -- ← THIS TYPE DOES NOT EXIST
    ...
```

The database has a type called **`rating_level`**, not `review_rating`. The incorrect cast causes a `42704` error.

**Error from network response:**
```
{"code":"42704","message":"type \"review_rating\" does not exist"}
```

## Fix (1 Migration)

Create a migration that replaces the `reconcile_workflow_statuses` function, changing the single cast from `::review_rating` to `::rating_level`.

**Line to change:**
```sql
-- Before:
final_rating = v_best_rating::review_rating,

-- After:
final_rating = v_best_rating::rating_level,
```

The rest of the function remains identical.

## Files Modified

1. **New SQL migration** — `CREATE OR REPLACE FUNCTION reconcile_workflow_statuses` with the corrected type cast

No frontend changes needed.

