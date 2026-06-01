## Issue
Bulk sign-off as HR PMS with N/A rows fails with:
`column "na_reason" of relation "review_submissions" does not exist`

## Root Cause
The `bulk_write_stage_scores` RPC (added recently to support N/A in bulk sign-off) writes to `review_submissions.na_reason`, but that column was never added to the table. The table has `is_na` and `na_marked_by_role` only.

## Fix (single migration, additive only)

Add the missing column:

```sql
ALTER TABLE public.review_submissions
  ADD COLUMN IF NOT EXISTS na_reason text;
```

No backfill needed (column is nullable, historical rows had no N/A reason captured).
No RLS / GRANT change — column inherits existing table grants.
No client code changes — the RPC is the only writer and already passes the value through.

## Risk & Impact
- Data: Additive nullable column, zero impact on existing rows.
- Workflow: Unblocks bulk HR PMS / Manager / Skip / Auditor N/A sign-off; no behavioural change for non-N/A path.
- Regression: None — column was already expected by the deployed RPC.
- Rollback: `ALTER TABLE … DROP COLUMN na_reason;` (safe, no dependents besides the RPC that already tolerates NULL).

## Verification
After migration, re-run the bulk HR PMS sign-off on the 11 N/A cells from the screenshot — it should succeed and stamp `na_reason = "NA - 1st Month exemption"` on each row.
