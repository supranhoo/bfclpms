

## Why the KPI Journey Report Got Slower

### Root Cause
The recent changes added `review_submissions` queries inside the sequential batch loop (lines 101-117). For each batch of 500 KPI IDs, **two queries now run** instead of one. With 1000+ KPIs (March 2026 has 1000+ based on network requests), that's 3+ sequential loop iterations x 2 queries each = 6+ sequential DB calls, plus the profiles query runs sequentially after KPIs instead of in parallel.

### Optimization Plan

**File: `src/hooks/useKpiJourneyReport.ts`**

1. **Fetch profiles in parallel with audit logs/submissions** -- currently profiles are fetched sequentially between KPIs and audit logs. Move the profiles query to run concurrently with the batch loop.

2. **Increase batch size from 500 to 1000** for the `.in()` queries -- reduces loop iterations from 3 to 2 for typical data volumes.

3. **Fetch all review_submissions in a single query** outside the loop -- unlike audit logs which can have many rows per KPI, submissions have exactly one row per KPI. Fetch them all at once with a single `.in('kpi_id', allKpiIds)` call (paginated if needed), removing them from the per-batch loop entirely.

4. **Drop `new_value` from the audit log select** -- replace with a targeted approach: only fetch `new_value` for `STATUS_TRANSITION` actions by splitting into two queries: one for workflow actions (no `new_value` needed) and one for `STATUS_TRANSITION` (with `new_value`). This reduces data transfer significantly since `new_value` contains large JSON.

### Expected Impact
- Eliminates ~2-3 sequential DB round-trips
- Reduces data transfer by not fetching `new_value` JSON for non-transition logs
- Profiles load concurrently instead of blocking

### Files Changed
| File | Change |
|------|--------|
| `src/hooks/useKpiJourneyReport.ts` | Restructure queries for parallelism and reduce payload |

