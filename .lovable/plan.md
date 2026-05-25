# Fix Bulk Sign-off Failure (`jsonb_object_length` does not exist)

## Root Cause
The migration `20260525123736_*.sql` introduces `public.bulk_write_stage_scores(...)` and uses `jsonb_object_length(p_manual_scores)` / `jsonb_object_length(p_achieved_values)` to record counts in the audit batch row. Postgres does **not** ship a `jsonb_object_length(jsonb)` function (only `jsonb_array_length` exists for arrays, and `json_object_keys` / `jsonb_object_keys` for objects). The RPC therefore aborts with `function jsonb_object_length(jsonb) does not exist`, surfaced in the UI as **"Sign-off failed"**.

This blocks every bulk sign-off — including the admin Override path the user just configured.

## Risk & Impact
- **Data**: None. No row was written (RPC aborted before INSERT). No schema change required beyond replacing the function body.
- **Workflow**: Restores sign-off; no behavior change to scoring/override logic.
- **Regression**: Low — change is isolated to two expressions inside the batch-metadata `jsonb_build_object`.
- **Mitigation**: Add a unit-style SQL assertion + ensure the helper expression is safe when the JSONB param is `NULL` or not an object.

## Fix
Replace both call sites with a NULL-safe object-key count:

```sql
COALESCE(
  (SELECT count(*)::int FROM jsonb_object_keys(p_manual_scores)),
  0
)
```
(and the same for `p_achieved_values`).

`jsonb_object_keys` raises if given a non-object; current callers always pass `'{}'::jsonb` or an object, but we'll also guard with `jsonb_typeof(...) = 'object'` to be defensive:

```sql
CASE WHEN jsonb_typeof(p_manual_scores) = 'object'
     THEN (SELECT count(*)::int FROM jsonb_object_keys(p_manual_scores))
     ELSE 0 END
```

## Steps

1. **New migration** `supabase/migrations/<ts>_fix_bulk_write_stage_scores_jsonb_count.sql`
   - `CREATE OR REPLACE FUNCTION public.bulk_write_stage_scores(...)` with the **identical signature** as the previous migration, body unchanged except the two `jsonb_object_length(...)` expressions replaced by the `CASE / jsonb_object_keys` form above.
   - No RLS, no grants change (function already owned + granted in prior migration).

2. **SSOT updates**
   - `POLICY.md` — append §111.7.a.5 (v2.66.13.12): RCA note that Postgres lacks `jsonb_object_length`; canonical pattern for counting JSONB object keys in our RPCs is `jsonb_object_keys` + `count(*)`. Forbid future use of `jsonb_object_length`.
   - `DOCUMENTATION.md` — add v2.66.13.12 entry: "Hotfix: bulk sign-off RPC failed with `jsonb_object_length does not exist`. Replaced with object-key count."

3. **Regression test** (`src/lib/bulkSignoffImpact.test.ts` is JS-side; the failing surface is SQL).
   - Add a lightweight assertion in the migration itself:
     ```sql
     DO $$ BEGIN
       PERFORM public.bulk_write_stage_scores(
         p_submission_ids := ARRAY[]::uuid[],
         p_stage := 'auditor',
         p_remark := 'noop probe (min 10 chars).',
         p_attachments := '[]'::jsonb,
         p_manual_scores := '{}'::jsonb,
         p_achieved_values := '{}'::jsonb,
         p_is_override := false,
         p_batch_reason := 'self_test',
         p_dry_run := true
       );
     END $$;
     ```
     This runs at migration time and fails loudly if the signature/body regresses.

## Out of Scope
- Override semantics, Achieved/Manual recompute, row-checkbox scope fix — all untouched.
- No frontend code changes.

## Rollback
Re-apply the prior `CREATE OR REPLACE` body. Function is replace-in-place; no destructive DDL.
