

## Fix: KPI Journey Report Stuck/Slow Loading

### Root Cause
With 1,583 KPIs for the current period, the report makes **6 sequential batch iterations** for both submissions and audit logs. Each audit log iteration makes 2 queries (workflow + transition). While the two loops run in parallel, each loop internally runs its batches **sequentially** -- that's 6 sequential round-trips within each loop. Combined with the 2-iteration KPI fetch loop, the total waterfall is ~8 sequential database round-trips, causing the page to appear stuck.

### Fix

**File: `src/hooks/useKpiJourneyReport.ts`**

Parallelize the inner batch loops -- instead of iterating sequentially, fire all batch queries concurrently using `Promise.all`:

1. **Submissions**: Build all batch slices upfront, then `Promise.all` all submission queries at once (6 parallel calls instead of 6 sequential)
2. **Audit logs**: Build all batch slices, then `Promise.all` all workflow + transition queries at once (12 parallel calls instead of 6 sequential pairs)

This reduces the waterfall from ~8 sequential round-trips to ~3 (KPI fetch pages + one parallel fan-out for everything else).

```text
Before:  KPI pg1 → KPI pg2 → [sub batch1 → sub batch2 → ... → sub batch6]
                              [log batch1 → log batch2 → ... → log batch6]

After:   KPI pg1 → KPI pg2 → [sub batch1..6 + log batch1..6 ALL parallel]
```

### Files Changed
| File | Change |
|------|--------|
| `src/hooks/useKpiJourneyReport.ts` | Parallelize batch queries inside submissions and audit log loops |

