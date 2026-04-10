

## Fix: Repair Function Timing Out (504)

### Root Cause

The analytics logs show the edge function returning **504 Gateway Timeout** after **150+ seconds** when scanning 1500 KPIs. The function makes **2-3 individual DB queries per KPI** inside a `for` loop (checking `review_submissions`, then `org_kpi_values` exact match, then fallback match). With 1500 KPIs, that's 3000-4500 sequential database round-trips.

### Fix Strategy: Batch pre-fetch instead of per-KPI queries

Replace the per-KPI loop queries with **bulk pre-fetches** before the loop:

**1. Pre-fetch all review_submissions in one query**
- Before the loop: `SELECT kpi_id FROM review_submissions WHERE kpi_id IN (all target KPI IDs)`
- Build a `Set<string>` of KPI IDs that already have submissions
- In the loop: check the Set instead of querying per-KPI

**2. Pre-fetch all org_kpi_values in one query**
- Before the loop: `SELECT * FROM org_kpi_values WHERE category_id IN (...) AND review_period IN (...) AND review_year IN (...) AND status IN ('propagated','approved','entered')`
- Build a lookup Map keyed by `category_id + kra_name + kpi_name + period + year`
- In the loop: look up from the Map instead of querying per-KPI

**3. Keep the loop logic intact** — just replace DB calls with Map/Set lookups

This reduces ~4500 DB queries down to **~5 total queries**, bringing execution time from 150s to under 5s.

### Files Changed

- `supabase/functions/repair-orphaned-propagations/index.ts` — replace per-KPI queries with batch pre-fetches
- `DOCUMENTATION.md` — version bump
- `POLICY.md` — note performance fix

### Risk Assessment
- **Data Impact**: None — same logic, same results, just batched queries
- **Backward Compatible**: Response shape unchanged
- **Regression Risk**: Low — matching logic stays identical, only data fetching changes

