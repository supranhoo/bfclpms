
## RCA — Current bug is a query timeout, not a visibility bug

### Confirmed facts
- The page is now surfacing the real backend error: `canceling statement due to statement timeout`.
- The failing request is the `kpis` fetch itself, specifically the paged request with `offset=1000&limit=1000`.
- The failing query currently asks for:
  - base KPI fields
  - `kra_categories(name)`
  - nested `review_submissions(...)`
- March 2026 data exists:
  - `1,758` KPIs
  - `107` employees
  - `1,664` linked `review_submissions`
- The current logged-in user is `admin`, so the old manager/RLS explanation is **not** the blocker for this screenshot.

### Assumptions I am making explicitly
1. The timeout is most likely caused by the nested `review_submissions(...)` join inside the paged `kpis` query.
2. I am **not** assuming the `profiles` fetch is the problem, because the network failure happens before that step.
3. I am **not** assuming a database schema/index change is needed first, because there is already an index on `review_submissions.kpi_id` and the simplest fix is to change the query shape.

### Multiple valid interpretations
#### Interpretation A — `review_submissions` join is the real bottleneck
This is the most likely case. The minimal fix is to stop loading submissions as a nested relation inside the large paged `kpis` query.

#### Interpretation B — the remaining `kra_categories(name)` join also contributes
Possible, but I would **not** change this first. If the timeout persists after removing nested `review_submissions`, then split categories too in a second pass.

### Recommended fix
Use the **minimum-code** change:

1. Keep the paged `kpis` fetch.
2. Remove nested `review_submissions(...)` from that query.
3. After KPI rows are loaded, fetch `review_submissions` separately in chunks using `kpi_id in (...)`.
4. Merge submissions back in-memory by `kpi_id`.
5. Leave the rest of the page behavior unchanged.

This is the smallest change that directly targets the timed-out query.

## What to build

### 1. Change only the heavy query path
In `src/pages/reports/KpiScorecardDetail.tsx`:

- Change the paged `kpis` select to fetch only KPI columns needed for the table, plus `kra_categories(name)` if kept.
- Build a `kpiIds` array from the loaded KPI rows.
- Fetch `review_submissions` separately in chunks of 500 using:
  - `kpi_id`
  - all currently-used score/actual fields
  - `is_na`
- Build a `Map<kpi_id, submission>` and merge during `FlatRow` mapping.

### 2. Do not add new features
Do **not** change:
- click-to-load behavior
- filters
- access policy
- exports
- UI copy beyond what is necessary
- database schema
- RLS
- config tables
- generic service abstractions

### 3. Keep fallback scope narrow
If the timeout still happens after step 1:
- second, and only then, remove nested `kra_categories(name)` too
- fetch categories separately by `category_id`
- merge client-side

I would not do this in the first pass unless the first minimal fix fails.

## Files to change
| File | Change |
|---|---|
| `src/pages/reports/KpiScorecardDetail.tsx` | Replace nested `review_submissions(...)` relation with separate chunked `review_submissions` fetch and local merge |
| `DOCUMENTATION.md` | Add RCA note and record that the report no longer joins `review_submissions` inside the large paged KPI query |
| test file | Add one regression test for 1000+ KPI load path using separate submissions fetch |

## Regression protection
Add one focused test only:
- Scenario: more than 1000 KPIs for a period
- Expectation: page loads data successfully when KPI rows are paged and submissions are fetched separately
- No need for broad new abstractions or a large test suite for this fix

## Risk & Impact Report
### Data impact
- No schema change
- No RLS change
- No historical data impact

### Workflow impact
- None

### UI/UX impact
- None intended
- Same page, same filters, same load button

### Regression risk
- Low
- Main risk is mismatching submission rows to KPIs during merge

### Mitigation
- Merge strictly by `kpi_id`
- Keep field list identical to current usage
- Add one regression test for paged KPI + separate submissions path

## Why this is the simplest correct fix
- It addresses the actual failing request shown in the network log
- It avoids speculative database work
- It avoids new architecture
- It keeps the change local to one report
- It uses an existing project pattern already used elsewhere: chunked `.in('kpi_id', batch)` reads

