---
name: compute-monthly-incentives — paginated reads (ADR-094)
description: production_daily_entries, incentive_production_rates and employee_incentive_records override-probe MUST paginate via .range() loop in the compute edge function; PostgREST 1,000-row cap previously hid ~91 employees from the Incentive Report.
type: feature
---

`supabase/functions/compute-monthly-incentives/index.ts` paginates every
multi-row read with `PAGE = 1000` and `if (rows.length < PAGE) break;`.
The contract is locked by `src/test/computeMonthlyIncentivesPagination.test.ts`.

Diagnostics expose `daily_entries_rows_loaded` and
`production_rate_rows_loaded` so the 1,000-row symptom is surfaced in
the dry-run dialog instead of silently dropping employees (Pavan Gope,
Metal Sizing June 2026 — RCA ADR-094).

Do **not** add a new `.from(...).select(...)` in this function without
`.range()` pagination. Any sibling edge function discovered with the
same shape (e.g. compute-increment) inherits the same rule.