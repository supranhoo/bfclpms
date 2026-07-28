## What's wrong (verified)

In `src/pages/review/BulkReviewDashboard.tsx` the org filters are multi-select, but the server RPCs (`bulk_scope_preview` / `bulk_review_snapshot`) accept only **one** value per axis. The page therefore does:

```
const oneOrNull = (arr) => arr.length === 1 ? arr[0] : null;
filters = { company_id, division_id, business_unit_id, department_id, category_id: oneOrNull(...) }
```

With 2 divisions selected (DRI + SMS) `division_id` becomes `null` → the server returns the **whole scope**. Client-side there is a compensating filter for **KRA, category, designation, grade, reporting manager** — but **none for company / division / business unit / department**. So those axes become a silent no-op above one selection.

Confirmed against the data: Anil Kumar Pathak (200301) is CLU-Operation → BU "CLU" → Division **Ferro**, and Babloo Kumar Shah (101209) is Division **CPP** — neither DRI nor SMS, yet both render.

Also confirmed: `profiles` has only `department_id` and `company_id`; division/BU are derived via `departments → business_units → divisions`. `bulk_review_snapshot` rows carry no org columns, and `rpc_bulk_employee_attrs` returns only designation / grade / reporting manager — so the client currently has no way to know a row's division.

## Fix

**1. Extend the employee-attribute RPC (migration)**
Add to `rpc_bulk_employee_attrs` output: `company_id`, `department_id`, `business_unit_id`, `division_id` (resolved via the department → BU → division join). Signature stays the same (same args, additional returned columns), SECURITY DEFINER, read-only.

**2. Hydrate them client-side**
Extend `BulkEmployeeAttr` in `src/hooks/useBulkReview.ts` with the four ids and map them through.

**3. Apply the missing client-side filter**
New pure helper in `src/lib/bulkEmployeeFilter.ts` (`allowedOrgEmployeeIds`) — AND across axes, OR within an axis, same convention as the existing designation/grade/manager filter. Wire it into the `loadedRows` memo in `BulkReviewDashboard.tsx` so company/division/BU/department are enforced regardless of how many values are selected. Single-selection keeps its server-side fast path (unchanged), the client filter is then a no-op for it.

**4. Keep counts honest**
The header chips (`42 employees`, `57 cells`, `99/99 rows`) derive from the loaded rows, so they self-correct. The pre-load `Load Scope` preview still counts the broader server scope when 2+ values are picked — show an "approximate" hint on the preview count in that case rather than pretending it's exact.

**5. Regression tests**
- Unit tests for `allowedOrgEmployeeIds` (multi-division, blank/unmapped employee, AND-across-axes).
- A regression test locking the exact reported case: divisions = [DRI, SMS] must exclude a Ferro employee and a CPP employee.

**6. Docs / policy**
Add `docs/adr/ADR-195.md` (Bulk Review multi-select filter parity) and a POLICY entry: *any multi-select filter whose server RPC is single-valued MUST have a client-side counterpart* — this is the third occurrence of the same class of bug (KRA, then category, now org axes).

## Risk & impact

- **Data**: none — additive columns on one read-only RPC. No schema change, no writes.
- **Workflow**: none. RLS unchanged; filtering only narrows what is already visible.
- **UI**: fewer rows shown when 2+ org values are selected (the correct behaviour). Selection pruning already runs on `loadedRows` change, so stale selections are dropped safely.
- **Regression risk**: low; employees with no department mapping would be excluded when a division filter is active — treated explicitly as "unmapped" and covered by a test.
- **Rollback**: revert the client patch; the extra RPC columns are inert.
