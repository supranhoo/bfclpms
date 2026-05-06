## Confirmed Root Cause

The "Rollover Failed — Edge Function returned a non-2xx status code" toast is the UI surfacing this Postgres error from `auto-rollover-kpis` (visible in edge logs):

```
Insert failed: column "status" is of type review_status but expression is of type text
```

The RPC `public.batch_insert_kpis_with_rollover_flag` (introduced in migration `20260501050203`) inserts:

```sql
COALESCE(kpi->>'status', 'kra_set')   -- text
```

into `kpis.status`, which is the `review_status` enum. Recent Postgres no longer implicitly coerces `text → enum` in INSERT … SELECT, so every rollover insert batch now fails — including Ankit's April → May rollover with 9 KPIs.

This is a server-side regression only; no data was written for the failing batch.

## Fix Plan

**1. DB migration — recreate the RPC with an explicit enum cast**

New migration: `supabase/migrations/<ts>_fix_batch_insert_kpis_rollover_status_cast.sql`

- `CREATE OR REPLACE FUNCTION public.batch_insert_kpis_with_rollover_flag(jsonb)` identical to today's body, but the `status` projection becomes:

  ```sql
  COALESCE(NULLIF(kpi->>'status',''), 'kra_set')::public.review_status
  ```

- Same `SECURITY DEFINER`, same `search_path = public`, same return type, same notification-suppression flag — purely a cast fix, no behavior change.

**2. Verification**

- After migration, retry Ankit's April → May rollover from the same dialog. Expect `Ready (1 employee, 9 KPIs) → Proceed → Success` toast and 9 new rows in `kpis` for May 2026.
- Check `kra_rollover_logs` no longer records a `failed` row for that batch.
- Edge log line `Insert failed: column "status"…` should not reappear.

**3. Regression guard**

Add `src/test/rolloverStatusEnumCast.test.ts` that mocks the RPC and asserts the edge-function code path surfaces a friendly toast on a Postgres `42804` error (already friendly today, but lock it in).

## Risk & Impact

| Area | Impact |
|------|--------|
| Data | None. Cast-only change; the failing batches never wrote rows. |
| Workflow | Restores the broken KRA Rollover flow — no behavioral change beyond "it works again". |
| RLS | Untouched. |
| Regression | Very low — single function body change, additive cast. |
| Mitigation | New unit test + manual rerun of Ankit's rollover. |

## Files

- **New** `supabase/migrations/<ts>_fix_batch_insert_kpis_rollover_status_cast.sql`
- **New** `src/test/rolloverStatusEnumCast.test.ts`
- **Edit** `CHANGELOG_2026.md`, `DOCUMENTATION.md` (Version History entry)

Approve to apply the migration and ship the test.
