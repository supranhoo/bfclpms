

## Data Repair: Re-run Rollover to Backfill Missing Sibling Month Records

### Problem
The rollover edge function code is now fixed (creates all cycle months), but the April 2026 rollover already ran with the old code. So Quarterly KPIs only have June records, Bi-Monthly only have May records, etc. April (and other sibling months) are missing.

### Fix — Re-run rollover with force flag

Call the edge function with these parameters:

```json
{
  "source_month": "March",
  "source_year": 2026,
  "target_month": "April",
  "target_year": 2026,
  "force": true,
  "triggered_by": "admin_backfill"
}
```

### What will happen
1. The function fetches all March 2026 source KPIs
2. For each multi-month KPI, it computes the full cycle (e.g., Quarterly → April, May, June)
3. Dedup checks each month independently — June already exists, so it skips June
4. Creates missing April and May records with `status: 'kra_set'`
5. Monthly KPIs are also deduped — April already exists, so they are skipped

### Execution
I will invoke the edge function directly using the Supabase curl tool with the service role key and the parameters above. This is safe because:
- Dedup prevents any duplicate records
- `force: true` bypasses the auto-rollover enabled check
- Existing terminal month records are untouched

### No code changes needed
The edge function code is already correct. This is purely a data repair operation.

